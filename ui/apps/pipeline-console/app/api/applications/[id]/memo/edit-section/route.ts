/**
 * POST /api/applications/<id>/memo/edit-section
 *
 * Banker edits to a memo section land here. The route:
 *   1. SELECTs the latest credit_memo artifact for the application.
 *   2. Patches the section's narrative + citations in-memory.
 *   3. INSERTs a new credit_memo artifact row at revision = max + 1
 *      with author='human' so the audit trail shows who changed what.
 *   4. Writes one application_events row of type='memo_edited' with the
 *      diff payload so the build-tab pipeline activity surfaces it.
 *
 * Body shape:
 *   {
 *     section_key: "risk_rating_rationale",
 *     patches: {
 *       narrative?: string,
 *       citations?: Array<{ doc_id: string, page: number, excerpt?: string }>
 *     },
 *     actor?: string,        // banker username; defaults to "banker"
 *     comment?: string       // optional rationale shown in the audit trail
 *   }
 *
 * Returns 200 { ok: true, revision: N } on success.
 * Returns 404 if no credit_memo exists for the application.
 * Returns 422 on bad body / unknown section.
 */
import { NextResponse } from "next/server";

import {
  getPool,
  isDbConfigured,
  DB_UNAVAILABLE_MESSAGE,
} from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN_SECTIONS = new Set([
  "executive_summary",
  "borrower_overview",
  "financial_analysis",
  "cash_flow_projection",
  "risk_factors",
  "collateral",
  "covenant_package",
  "regulatory_concentration",
  "risk_rating_rationale",
  "recommendation",
]);

interface CitationPatch {
  doc_id?: string | null;
  page?: number | null;
  excerpt?: string | null;
  source?: string | null;
  section?: string | null;
  claim?: string | null;
}

interface RequestBody {
  section_key?: string;
  patches?: {
    narrative?: string | null;
    citations?: CitationPatch[];
  };
  actor?: string;
  comment?: string;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const applicationId = decodeURIComponent(params.id);
  if (!UUID_RE.test(applicationId)) {
    return NextResponse.json({ ok: false, error: "invalid_application_id" }, { status: 422 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 422 });
  }

  const sectionKey = String(body.section_key ?? "");
  if (!KNOWN_SECTIONS.has(sectionKey)) {
    return NextResponse.json(
      { ok: false, error: "unknown_section", section_key: sectionKey },
      { status: 422 },
    );
  }

  const patches = body.patches ?? {};
  const newNarrative =
    typeof patches.narrative === "string" ? patches.narrative : undefined;
  const newCitations = Array.isArray(patches.citations) ? patches.citations : undefined;

  if (newNarrative === undefined && newCitations === undefined) {
    return NextResponse.json({ ok: false, error: "no_patches_provided" }, { status: 422 });
  }

  const actor = String(body.actor ?? "banker").slice(0, 40);
  const comment = body.comment ? String(body.comment).slice(0, 500) : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Latest revision of this application's credit_memo
    const cur = await client.query(
      `SELECT revision_number, body
         FROM application_artifacts
        WHERE application_id = $1 AND artifact_type = 'credit_memo'
        ORDER BY revision_number DESC
        LIMIT 1`,
      [applicationId],
    );
    if (cur.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: "no_memo_to_edit" },
        { status: 404 },
      );
    }
    const previousRevision = Number(cur.rows[0].revision_number ?? 0);
    const previousBody = (cur.rows[0].body ?? {}) as Record<string, unknown>;

    // The drafter sometimes wraps the memo as { memo: {...} }; normalize
    // by editing the inner-or-outer object whichever holds the section.
    let patched: Record<string, unknown>;
    let isWrapped = false;
    const inner = (previousBody as { memo?: unknown }).memo;
    if (inner && typeof inner === "object") {
      isWrapped = true;
      patched = { ...(inner as Record<string, unknown>) };
    } else {
      patched = { ...previousBody };
    }

    const oldSection = (patched[sectionKey] ?? {}) as Record<string, unknown>;
    const newSection: Record<string, unknown> = { ...oldSection };

    if (newNarrative !== undefined) {
      newSection.narrative = newNarrative;
      // Some sections also carry "text" (executive_summary). Mirror it
      // so downstream readers that only look at one field still see the
      // edited prose.
      if ("text" in oldSection) newSection.text = newNarrative;
    }
    if (newCitations !== undefined) {
      newSection.citations = newCitations
        .filter((c): c is CitationPatch => Boolean(c))
        .map((c) => ({
          doc_id: c.doc_id ?? null,
          page: typeof c.page === "number" ? c.page : null,
          excerpt: c.excerpt ?? null,
          source: c.source ?? null,
          section: c.section ?? null,
          claim: c.claim ?? null,
        }));
    }

    // Mark the section as banker-edited so downstream readers (audit
    // panel, render-stability test, drafter retry) can see the edit
    // happened and respect it.
    newSection.edited_by = actor;
    newSection.edited_at = new Date().toISOString();
    if (comment) newSection.edit_comment = comment;

    patched[sectionKey] = newSection;

    const finalBody: Record<string, unknown> = isWrapped
      ? { ...previousBody, memo: patched }
      : patched;

    // 2. INSERT new revision
    const nextRevision = previousRevision + 1;
    await client.query(
      `INSERT INTO application_artifacts
         (application_id, artifact_type, revision_number, author, body)
       VALUES ($1, 'credit_memo', $2, $3, $4::jsonb)`,
      [applicationId, nextRevision, actor, JSON.stringify(finalBody)],
    );

    // 3. Audit event for the build-tab activity log
    await client.query(
      `INSERT INTO application_events
         (application_id, event_type, service_name, payload)
       VALUES ($1, 'memo_edited', 'pipeline-console', $2::jsonb)`,
      [
        applicationId,
        JSON.stringify({
          section_key: sectionKey,
          revision: nextRevision,
          previous_revision: previousRevision,
          actor,
          comment,
          changed_fields: [
            ...(newNarrative !== undefined ? ["narrative"] : []),
            ...(newCitations !== undefined ? ["citations"] : []),
          ],
        }),
      ],
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      revision: nextRevision,
      section_key: sectionKey,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      {
        ok: false,
        error: "edit_failed",
        message: (err as Error).message,
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
