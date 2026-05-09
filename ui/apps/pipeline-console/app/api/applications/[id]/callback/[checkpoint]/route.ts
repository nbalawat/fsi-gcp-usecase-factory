/**
 * POST /api/applications/<id>/callback/<checkpoint>
 *
 * Resume a Cloud Workflows execution that's blocked on
 * events.await_callback. The UI fires this when a human acts at one of
 * the four HITL checkpoints:
 *
 *   - extraction_review : { decision: "approve" | "fix",
 *                           fixes?: [{doc_id, field_path, new_value}] }
 *   - rating_review     : { decision: "approve" | "override",
 *                           new_risk_band?: "1-pass" | "2-special-mention" | ... }
 *   - draft_review      : { decision: "approve" | "edit",
 *                           memo_edits?: <full memo body JSON> }
 *   - final_approval    : { decision: "APPROVE" | "DECLINE" | "RETURN_FOR_REVISION",
 *                           notes?: string }
 *
 * Mechanics:
 *   1. Read application_state.pending_callbacks → JSONB map of
 *      checkpoint → {url, registered_at}
 *   2. For the requested checkpoint, fetch its callback URL.
 *   3. POST the human's decision body to the workflow's callback URL
 *      (with an OIDC-token Authorization header — the workflow's
 *      callback endpoint requires the same auth as any other Cloud
 *      Run service invocation).
 *   4. Workflow resumes; clears its own pending_callbacks entry on
 *      next step (audit-writer /callback/clear).
 *
 * Returns 200 on success, 404 if no pending callback for that
 * checkpoint, 422 on bad body, 502 if the workflow callback POST
 * fails.
 */

import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

import {
  getPool,
  isDbConfigured,
  DB_UNAVAILABLE_MESSAGE,
} from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CHECKPOINTS = new Set([
  "extraction_review",
  "rating_review",
  "draft_review",
  "final_approval",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _auth: GoogleAuth | null = null;
function googleAuth(): GoogleAuth {
  if (_auth === null) {
    _auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return _auth;
}

/**
 * Mint an OAuth 2 access token for Google Cloud APIs (the Workflows
 * callback endpoint at workflowexecutions.googleapis.com requires this,
 * NOT an OIDC ID token).
 */
async function accessToken(): Promise<string> {
  const client = await googleAuth().getClient();
  const resp = await client.getAccessToken();
  if (!resp.token) {
    throw new Error("getAccessToken returned no token");
  }
  return resp.token;
}

interface PendingCallback {
  url: string;
  registered_at?: string;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string; checkpoint: string } },
): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const { id: applicationId, checkpoint } = params;
  if (!UUID_RE.test(applicationId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid application_id (must be UUIDv4)" },
      { status: 400 },
    );
  }
  if (!VALID_CHECKPOINTS.has(checkpoint)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid checkpoint. Use one of: ${Array.from(VALID_CHECKPOINTS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Body must be JSON: ${(e as Error).message}` },
      { status: 422 },
    );
  }
  if (!body || typeof body.decision !== "string") {
    return NextResponse.json(
      { ok: false, error: "Body must include `decision` (string)" },
      { status: 422 },
    );
  }

  // Look up the workflow's callback URL
  const pool = getPool();
  let callbackUrl: string | null = null;
  try {
    const r = await pool.query(
      `SELECT pending_callbacks -> $1 ->> 'url' AS url
         FROM application_state
        WHERE application_id = $2`,
      [checkpoint, applicationId],
    );
    if (r.rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: `Application ${applicationId} not found` },
        { status: 404 },
      );
    }
    callbackUrl = r.rows[0].url;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `DB read failed: ${(e as Error).message}` },
      { status: 503 },
    );
  }

  if (!callbackUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `No pending callback for checkpoint=${checkpoint}. ` +
          `Either the workflow isn't waiting at this checkpoint, or it ` +
          `already received a response. Check application_state.current_stage.`,
      },
      { status: 404 },
    );
  }

  // Workflows callback URLs are at workflowexecutions.googleapis.com and
  // accept an OAuth 2 access token (NOT an OIDC ID token).
  let token: string;
  try {
    token = await accessToken();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Could not mint ID token for callback: ${(e as Error).message}. ` +
          `The Next.js process needs ADC; run \`gcloud auth ` +
          `application-default login\` or set GOOGLE_APPLICATION_CREDENTIALS.`,
      },
      { status: 503 },
    );
  }

  // POST the decision to the workflow's callback URL
  const r = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Workflow callback returned ${r.status}: ${text.slice(0, 300)}`,
      },
      { status: 502 },
    );
  }

  // Best-effort: write an audit event so the UI's pipeline activity
  // shows the human action. Failure here doesn't fail the request.
  try {
    await pool.query(
      `INSERT INTO application_events
         (application_id, event_type, service_name, payload)
       VALUES ($1, 'human_action', 'ui', $2::jsonb)`,
      [
        applicationId,
        JSON.stringify({
          checkpoint,
          decision: body.decision,
          notes: body.notes ?? null,
        }),
      ],
    );
  } catch (e) {
    // Swallow — the workflow has already accepted the callback
    console.error(
      `[callback] audit event write failed: ${(e as Error).message}`,
    );
  }

  return NextResponse.json(
    { ok: true, checkpoint, decision: body.decision, workflow_response: text.slice(0, 500) },
    { status: 200 },
  );
}
