/**
 * GET /api/applications/<id>/validate
 *
 * Reads the application's documents from Cloud SQL, runs the same
 * validation rules as the Python gate (usecases/credit-memo-commercial/
 * validation/gate.py) directly in the route, and returns a
 * ValidationResult that the UI's ReturnedApplicationPanel can render.
 *
 * The TypeScript implementation is intentionally a faithful port of the
 * Python gate — both consume the same document_requirements.json file,
 * so the two stay in lockstep. Production clarity > DRY: the workflow
 * uses the Python gate (because it runs server-side), the UI uses this
 * one (because it doesn't want to bounce through a Cloud Run service
 * just to render the missing-items list when the data is already in
 * the DB).
 *
 * Response shape mirrors validation.gate.ValidationResult exactly so
 * the same React component renders both server-evaluated and
 * UI-evaluated outputs.
 */

import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPool,
  isDbConfigured,
  DB_UNAVAILABLE_MESSAGE,
} from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Shared types — keep in sync with validation/gate.py ─────────────────────

type DocType =
  | "10-K"
  | "10-Q"
  | "audited_financials"
  | "AR_aging"
  | "board_minutes"
  | "appraisal"
  | "business_plan";

interface DocumentRow {
  doc_id: string;
  doc_type: DocType;
  extraction_status:
    | "pending"
    | "extracting"
    | "extracted"
    | "failed"
    | "returned_for_revision";
  missing_required_fields: string[];
  error_code: string | null;
}

type Decision = "PROCEED" | "RETURN_FOR_REVISION";

interface MissingItem {
  code:
    | "missing_doc_type"
    | "extraction_failed"
    | "critical_field_missing"
    | "incomplete_application";
  doc_type: DocType | null;
  doc_id: string | null;
  field_path: string | null;
  applicant_message: string;
  severity: "critical" | "warning";
  regulation: string | null;
}

interface ValidationResult {
  application_id: string;
  decision: Decision;
  missing_items: MissingItem[];
  submitted_doc_types: DocType[];
  tier_reason: string | null;
  next_steps: string;
}

// ── Document requirements (load once, cache) ────────────────────────────────

let _requirements: Record<string, unknown> | null = null;
function loadRequirements(): Record<string, unknown> {
  if (_requirements !== null) return _requirements;
  // schemas/document_requirements.json sits four levels above this route file:
  //   ui/apps/pipeline-console/app/api/applications/[id]/validate/route.ts
  //   ↑↑↑↑↑↑↑ usecases/credit-memo-commercial/schemas/document_requirements.json
  const path = join(
    process.cwd(),
    "..",
    "..",
    "..",
    "usecases",
    "credit-memo-commercial",
    "schemas",
    "document_requirements.json",
  );
  const text = readFileSync(path, "utf-8");
  _requirements = JSON.parse(text) as Record<string, unknown>;
  return _requirements;
}

const CRITICAL_FIELD_KEYWORDS = [
  "revenue",
  "ebitda",
  "net_income",
  "total_assets",
  "total_debt",
  "total_equity",
  "operating_cash_flow",
  "fiscal_year_end",
  "fiscal_period_end",
  "as_of_date",
  "auditor_name",
  "audit_opinion",
  "appraised_value",
  "meeting_date",
];

function isCriticalField(fieldPath: string): boolean {
  return CRITICAL_FIELD_KEYWORDS.some((kw) => fieldPath.includes(kw));
}

// ── Tier selection ──────────────────────────────────────────────────────────

interface Tier {
  loan_amount_lt: number;
  must_have: string[];
  minimum_satisfied_by?: unknown[];
  reason: string;
}

function selectTier(loanAmount: number): Tier {
  const req = loadRequirements();
  const tiers = (
    req["application_completeness"] as { tiers_by_loan_amount: Tier[] }
  ).tiers_by_loan_amount;
  const sorted = [...tiers].sort(
    (a, b) => a.loan_amount_lt - b.loan_amount_lt,
  );
  for (const t of sorted) {
    if (loanAmount < t.loan_amount_lt) return t;
  }
  return sorted[sorted.length - 1]!;
}

function blockSatisfied(block: unknown, submitted: Set<string>): boolean {
  if (typeof block === "string") return submitted.has(block);
  if (typeof block !== "object" || block === null) return false;
  const b = block as Record<string, unknown>;
  if (Array.isArray(b.any_of)) {
    return b.any_of.some((sub) => blockSatisfied(sub, submitted));
  }
  if (Array.isArray(b.all_of)) {
    return b.all_of.every((sub) => blockSatisfied(sub, submitted));
  }
  return false;
}

// ── Gate ────────────────────────────────────────────────────────────────────

function evaluate(
  applicationId: string,
  loanAmount: number,
  hasRealEstate: boolean,
  documents: DocumentRow[],
): ValidationResult {
  const req = loadRequirements();
  const items: MissingItem[] = [];

  const submittedDocTypes = Array.from(
    new Set(documents.map((d) => d.doc_type)),
  ).sort() as DocType[];
  const submittedSet = new Set<string>(submittedDocTypes);

  // 1. Extraction failures
  for (const d of documents) {
    if (d.extraction_status === "failed") {
      items.push({
        code: "extraction_failed",
        doc_type: d.doc_type,
        doc_id: d.doc_id,
        field_path: null,
        applicant_message:
          `Your ${d.doc_type} document could not be processed ` +
          `(error: ${d.error_code ?? "unknown"}). ` +
          `Please re-upload a clean PDF — most often this means the file ` +
          `was corrupted, password-protected, or scanned at too low a ` +
          `resolution.`,
        severity: "critical",
        regulation: null,
      });
    } else if (
      d.extraction_status === "pending" ||
      d.extraction_status === "extracting"
    ) {
      items.push({
        code: "extraction_failed",
        doc_type: d.doc_type,
        doc_id: d.doc_id,
        field_path: null,
        applicant_message:
          `Your ${d.doc_type} document is still being processed. ` +
          `This typically resolves within 60 seconds. If you continue to ` +
          `see this notice, please contact your relationship manager.`,
        severity: "critical",
        regulation: null,
      });
    }
  }

  // 2. Critical-field checks
  for (const d of documents) {
    if (d.extraction_status !== "extracted") continue;
    for (const field of d.missing_required_fields) {
      if (isCriticalField(field)) {
        items.push({
          code: "critical_field_missing",
          doc_type: d.doc_type,
          doc_id: d.doc_id,
          field_path: field,
          applicant_message:
            `Your ${d.doc_type} is missing the required field '${field}'. ` +
            `We extracted the document but couldn't find this value. ` +
            `Please supply a version that includes it (typically the ` +
            `audited income statement or balance sheet table).`,
          severity: "critical",
          regulation: null,
        });
      }
    }
  }

  // 3. Tier rule
  const tier = selectTier(loanAmount);

  const minAlways = (
    req["application_completeness"] as { minimum_always: { any_of?: string[] } }
  ).minimum_always;
  const baseline = minAlways?.any_of ?? [];
  if (baseline.length > 0 && !baseline.some((d) => submittedSet.has(d))) {
    items.push({
      code: "incomplete_application",
      doc_type: null,
      doc_id: null,
      field_path: null,
      applicant_message:
        `Every commercial credit application requires at least one ` +
        `audited annual financial statement set. Submit one of: ` +
        `${baseline.join(", ")}.`,
      severity: "critical",
      regulation: "bank_credit_policy_v3",
    });
  }

  for (const requiredDoc of tier.must_have) {
    if (!submittedSet.has(requiredDoc)) {
      items.push({
        code: "missing_doc_type",
        doc_type: requiredDoc as DocType,
        doc_id: null,
        field_path: null,
        applicant_message:
          `For loan amounts in this tier, the bank requires a ` +
          `${requiredDoc} document. ${tier.reason}`,
        severity: "critical",
        regulation: tier.reason,
      });
    }
  }

  if (
    tier.minimum_satisfied_by &&
    tier.minimum_satisfied_by.length > 0 &&
    !tier.minimum_satisfied_by.some((b) => blockSatisfied(b, submittedSet))
  ) {
    items.push({
      code: "incomplete_application",
      doc_type: null,
      doc_id: null,
      field_path: null,
      applicant_message:
        `The submitted document set doesn't satisfy the bank's ` +
        `minimum-completeness rule for this loan amount. ` +
        `Tier rule: ${tier.reason}`,
      severity: "critical",
      regulation: tier.reason,
    });
  }

  // 4. Real-estate collateral
  if (hasRealEstate) {
    const cc = (
      req["application_completeness"] as {
        collateral_conditional?: {
          if_collateral_includes_real_estate?: string[];
        };
      }
    ).collateral_conditional;
    const restRequired = cc?.if_collateral_includes_real_estate ?? [];
    for (const requiredDoc of restRequired) {
      if (!submittedSet.has(requiredDoc)) {
        items.push({
          code: "missing_doc_type",
          doc_type: requiredDoc as DocType,
          doc_id: null,
          field_path: null,
          applicant_message:
            `Real-estate-secured loans require a current ${requiredDoc}. ` +
            `12 CFR 34 requires the appraisal to be no more than 12 months ` +
            `old at the time of underwriting.`,
          severity: "critical",
          regulation: "12_CFR_34",
        });
      }
    }
  }

  // 5. Verdict + dedupe
  const seen = new Set<string>();
  const deduped: MissingItem[] = [];
  for (const item of items) {
    const key = `${item.code}|${item.doc_type ?? ""}|${item.field_path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  const decision: Decision =
    deduped.length === 0 ? "PROCEED" : "RETURN_FOR_REVISION";
  const nextSteps =
    decision === "PROCEED"
      ? `All required documents have been submitted and successfully extracted. ` +
        `Your application has been routed to underwriting; you will receive a ` +
        `decision within the regulatory deadline.`
      : `This application cannot be underwritten as submitted. Please address ` +
        `${deduped.length} item${deduped.length === 1 ? "" : "s"} below and ` +
        `re-submit through the application portal. Your relationship manager ` +
        `has been notified.`;

  return {
    application_id: applicationId,
    decision,
    missing_items: deduped,
    submitted_doc_types: submittedDocTypes,
    tier_reason: tier.reason,
    next_steps: nextSteps,
  };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const applicationId = params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid application_id (must be UUIDv4)" },
      { status: 400 },
    );
  }

  const pool = getPool();
  let stateRow: { loan_amount_usd: number; collateral_includes_real_estate?: boolean } | null;
  try {
    const stateRes = await pool.query(
      `SELECT loan_amount_usd FROM application_state WHERE application_id = $1`,
      [applicationId],
    );
    if (stateRes.rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: `Application ${applicationId} not found` },
        { status: 404 },
      );
    }
    stateRow = stateRes.rows[0];
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `DB read failed: ${(e as Error).message}` },
      { status: 503 },
    );
  }

  let docs: DocumentRow[];
  try {
    const docRes = await pool.query(
      `SELECT doc_id, doc_type, extraction_status,
              COALESCE(missing_required_fields, '[]'::jsonb) AS missing,
              error_code
         FROM application_documents
        WHERE application_id = $1
        ORDER BY uploaded_at`,
      [applicationId],
    );
    docs = docRes.rows.map((r) => ({
      doc_id: String(r.doc_id),
      doc_type: r.doc_type as DocType,
      extraction_status: r.extraction_status,
      missing_required_fields: Array.isArray(r.missing) ? r.missing : [],
      error_code: r.error_code ?? null,
    }));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `DB read failed: ${(e as Error).message}` },
      { status: 503 },
    );
  }

  const result = evaluate(
    applicationId,
    Number(stateRow!.loan_amount_usd),
    Boolean(stateRow!.collateral_includes_real_estate),
    docs,
  );

  return NextResponse.json({ ok: true, validation: result }, { status: 200 });
}
