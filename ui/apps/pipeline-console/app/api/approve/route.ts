import { NextResponse } from "next/server";

/**
 * Mock approval endpoint. In production this is the BFF, which:
 *   1. Validates the officer_id has the credit-officer role.
 *   2. Writes an entry to BigQuery `audit.human_actions`.
 *   3. Calls the Cloud Workflows callback URL emitted by approval-gate@1.0.
 *
 * For demo purposes we just acknowledge and return a synthetic audit id.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    loan_id?: string;
    disposition?: string;
    comment?: string;
    officer_id?: string;
  };
  if (!body.loan_id || !body.disposition) {
    return NextResponse.json(
      { ok: false, error: "loan_id and disposition required" },
      { status: 400 },
    );
  }
  const auditId = `audit-${Date.now().toString(36)}`;
  return NextResponse.json({
    ok: true,
    audit_log_id: auditId,
    workflow_callback_invoked: false,
    received: body,
  });
}
