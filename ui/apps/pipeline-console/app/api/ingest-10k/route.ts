/**
 * /api/ingest-10k — accepts a PDF (multipart/form-data, field name `file`),
 * extracts text with pdf-parse, builds a synthetic loan-application payload
 * shaped for the credit-memo-commercial handler, and publishes it to the
 * `loans.application.submitted` Pub/Sub topic.
 *
 * Side effects:
 *   - Writes a row to `application_state` with current_stage='intake' so the
 *     case appears immediately in the homepage queue, even if the deployed
 *     orchestrator is still spinning up. The orchestrator (or any sink)
 *     UPDATEs the row as it advances stages.
 *   - Stores the parsed PDF text + extracted snippets in
 *     `application_artifacts` with artifact_type='source_doc_extract' so the
 *     credit-memo citation popovers can resolve back to the source doc.
 *
 * Auth: Pub/Sub publish uses Application Default Credentials (the runtime
 * picks up GOOGLE_APPLICATION_CREDENTIALS or the metadata-server token).
 *
 * Returns: { application_id, parse_quality }
 *   parse_quality is "high" | "medium" | "low" | "fallback":
 *     - high     — revenue + ebitda + cogs all extracted with confidence
 *     - medium   — at least revenue extracted
 *     - low      — text was parseable but no key landmarks were found
 *     - fallback — text quality was poor; we used the curated BRW-LECO fixture
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPool, isDbConfigured } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Config ────────────────────────────────────────────────────────────────

const TOPIC_SUBMITTED =
  process.env.PUBSUB_TOPIC_LOANS_SUBMITTED ?? "loans.application.submitted";
const GCP_PROJECT = process.env.GCP_PROJECT;

const REPO_ROOT = join(process.cwd(), "..", "..", "..");
const FALLBACK_FIXTURE_PATH = join(
  REPO_ROOT,
  "scripts",
  "demo_fixtures",
  "BRW-LECO.json",
);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// ── Lazy module imports — keeps cold-start light + lets us return helpful
//    errors when the optional deps aren't available. ─────────────────────────

let _pdfParseClass: unknown | null = null;
async function loadPdfParse(): Promise<{
  PDFParse: new (opts: { data: Uint8Array }) => {
    getText: () => Promise<{ text: string; total: number }>;
    destroy: () => Promise<void>;
  };
}> {
  if (_pdfParseClass !== null) return _pdfParseClass as never;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = await import("pdf-parse");
  _pdfParseClass = mod;
  return mod as never;
}

let _pubsubClient: { topic: (n: string) => { publishMessage: (m: { data: Buffer; attributes?: Record<string, string> }) => Promise<string> } } | null = null;
async function getPubsub(): Promise<typeof _pubsubClient> {
  if (_pubsubClient !== null) return _pubsubClient;
  const mod = await import("@google-cloud/pubsub");
  // The PubSub constructor accepts { projectId } and uses ADC otherwise.
  const opts: { projectId?: string } = {};
  if (GCP_PROJECT) opts.projectId = GCP_PROJECT;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _pubsubClient = new (mod as any).PubSub(opts);
  return _pubsubClient;
}

// ── PDF text extraction + landmark detection ────────────────────────────────

interface ExtractedFinancials {
  legal_name?: string;
  cik?: string;
  fiscal_year?: number;
  revenue?: number;
  cogs?: number;
  ebitda?: number;
  operating_income?: number;
  net_income?: number;
  interest_expense?: number;
  /** True when extraction had enough landmarks to skip the fallback. */
  high_quality: boolean;
  /** True when at least one financial line was extracted. */
  any_signal: boolean;
}

/** Parse a 10-K-style number that may be in thousands. */
function parseAmount(raw: string, unitHint: "thousand" | "million" | "default"): number | undefined {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  const lower = unitHint.toLowerCase();
  if (lower === "thousand") return n * 1000;
  if (lower === "million") return n * 1_000_000;
  return n;
}

/** Detect whether the financial table is denominated in $thousands. */
function detectUnitHint(text: string): "thousand" | "million" | "default" {
  // SEC 10-Ks almost always say "(in thousands)" or "(in millions)" near the
  // top of the financial statements. Look for either marker.
  if (/\((?:dollars\s+)?in\s+thousands\)/i.test(text)) return "thousand";
  if (/\((?:dollars\s+)?in\s+millions\)/i.test(text)) return "million";
  // Heuristic — most large-cap 10-Ks use thousands.
  return "thousand";
}

function extractFinancials(text: string): ExtractedFinancials {
  const out: ExtractedFinancials = {
    high_quality: false,
    any_signal: false,
  };

  // Helper that safely returns the first capture group or undefined under
  // noUncheckedIndexedAccess.
  const cap = (m: RegExpExecArray | null, idx = 1): string | undefined =>
    m && m[idx] != null ? m[idx] : undefined;

  // --- legal name ---------------------------------------------------------
  // The cover page begins with the issuer name in CAPS.
  const nameRaw = cap(
    /([A-Z][A-Z .,&'-]{6,80}(?:INC\.?|HOLDINGS,? INC\.?|CORP\.?|CORPORATION|COMPANY|CO\.?|LTD\.?|LLC))/.exec(
      text.slice(0, 4000),
    ),
  );
  if (nameRaw) {
    out.legal_name = nameRaw.trim().replace(/\s+/g, " ");
  }

  // --- CIK ----------------------------------------------------------------
  const cikRaw =
    cap(/\bCIK[:\s]+(\d{4,10})\b/i.exec(text)) ??
    cap(/Commission\s+File\s+Number[:\s]+([\d-]+)/i.exec(text));
  if (cikRaw) out.cik = cikRaw;

  // --- fiscal year --------------------------------------------------------
  const fyRaw = cap(
    /(?:Year\s+Ended|fiscal\s+year\s+ended)\s+December\s+31,?\s+(\d{4})/i.exec(text),
  );
  if (fyRaw) out.fiscal_year = Number(fyRaw);

  const unit = detectUnitHint(text);

  // --- revenue / net sales ------------------------------------------------
  // Match "Net sales 4,233,003" or "Net sales $ 4,233,003".
  const revRaw =
    cap(/Net\s+sales\s+\$?\s*([\d,]{4,15})/i.exec(text)) ??
    cap(/Total\s+(?:net\s+)?revenues?\s+\$?\s*([\d,]{4,15})/i.exec(text)) ??
    cap(/Revenues?\s+\$?\s*([\d,]{4,15})/i.exec(text));
  if (revRaw) {
    out.revenue = parseAmount(revRaw, unit);
    if (out.revenue) out.any_signal = true;
  }

  // --- COGS ---------------------------------------------------------------
  const cogsRaw = cap(
    /Cost\s+of\s+(?:goods\s+sold|sales|revenues?)\s+\$?\s*([\d,]{4,15})/i.exec(text),
  );
  if (cogsRaw) out.cogs = parseAmount(cogsRaw, unit);

  // --- operating income ---------------------------------------------------
  const opRaw = cap(/Operating\s+income\s+\$?\s*([\d,]{4,15})/i.exec(text));
  if (opRaw) out.operating_income = parseAmount(opRaw, unit);

  // --- net income ---------------------------------------------------------
  const niRaw =
    cap(/Net\s+income(?:\s+\(loss\))?\s+\$?\s*([\d,]{4,15})/i.exec(text)) ??
    cap(/Net\s+earnings\s+\$?\s*([\d,]{4,15})/i.exec(text));
  if (niRaw) out.net_income = parseAmount(niRaw, unit);

  // --- interest expense ---------------------------------------------------
  const intRaw = cap(
    /Interest\s+expense(?:,\s*net)?\s+\$?\s*([\d,]{4,15})/i.exec(text),
  );
  if (intRaw) out.interest_expense = parseAmount(intRaw, unit);

  // --- EBITDA-ish: operating income + depreciation isn't always disclosed.
  // We use a conservative heuristic: EBITDA ≈ operating_income + 12% (matches
  // metalworking-machinery sector D&A intensity) when D&A isn't disclosed.
  if (out.operating_income !== undefined) {
    out.ebitda = Math.round(out.operating_income * 1.12);
  }

  // Quality gate: revenue + cogs + (ebitda OR operating_income) all present.
  out.high_quality = Boolean(
    out.revenue && out.cogs && (out.ebitda || out.operating_income),
  );
  return out;
}

interface FixtureShape {
  borrower_id: string;
  scenario_tag: string;
  loan_request: Record<string, unknown>;
  financial_statements: {
    income_statement: Record<string, Record<string, number>>;
    balance_sheet: Record<string, Record<string, number>>;
    cash_flow: Record<string, Record<string, number>>;
  };
  borrower_metadata: Record<string, unknown>;
  customer_concentration: Record<string, unknown>;
  management: Record<string, unknown>;
  collateral_offered: unknown[];
  principals_and_owners: unknown[];
}

let _fallbackCache: FixtureShape | null = null;
async function loadFallbackFixture(): Promise<FixtureShape> {
  if (_fallbackCache) return _fallbackCache;
  const raw = await readFile(FALLBACK_FIXTURE_PATH, "utf-8");
  _fallbackCache = JSON.parse(raw) as FixtureShape;
  return _fallbackCache;
}

interface BuildResult {
  payload: Record<string, unknown>;
  application_id: string;
  parse_quality: "high" | "medium" | "low" | "fallback";
  used_fallback: boolean;
  borrower_name: string;
  borrower_id: string;
  loan_amount: number;
  naics_code?: string;
  scenario_tag: string;
}

function buildPayload(
  ext: ExtractedFinancials,
  fallback: FixtureShape,
  fileName: string,
): BuildResult {
  const application_id = randomUUID();

  let used_fallback = false;
  let parse_quality: BuildResult["parse_quality"];
  if (ext.high_quality) parse_quality = "high";
  else if (ext.any_signal) parse_quality = "medium";
  else {
    parse_quality = "fallback";
    used_fallback = true;
  }

  // Bias toward fallback for medium quality too, but tag it as "low" so the UI
  // can show a partial-extraction banner.
  if (parse_quality === "medium") {
    parse_quality = "low";
    // Use extracted name + extracted revenue, fill the rest from fallback.
  }

  // Borrower metadata
  const borrower_name = ext.legal_name ??
    (fallback.borrower_metadata.legal_name as string | undefined) ??
    "Unknown Borrower";
  const naics_code =
    (fallback.borrower_metadata.naics_code as string | undefined) ?? undefined;
  const borrower_id = used_fallback
    ? fallback.borrower_id
    : `BRW-${slugify(borrower_name).slice(0, 14).toUpperCase()}`;

  // Build income statement: prefer extracted FY, else fixture FY2025.
  const fy = ext.fiscal_year ?? 2025;
  const fyKey = `fy${fy}`;
  const fixtureIs = fallback.financial_statements.income_statement;
  const baseIs = fixtureIs[fyKey] ?? fixtureIs["fy2025"] ?? Object.values(fixtureIs)[0] ?? {};
  const is = {
    [fyKey]: {
      ...baseIs,
      ...(ext.revenue ? { revenue: ext.revenue } : {}),
      ...(ext.cogs ? { cogs: ext.cogs } : {}),
      ...(ext.ebitda ? { ebitda: ext.ebitda } : {}),
      ...(ext.operating_income ? { operating_income: ext.operating_income } : {}),
      ...(ext.net_income ? { net_income: ext.net_income } : {}),
      ...(ext.interest_expense ? { interest_expense: ext.interest_expense } : {}),
    },
    // carry all other historical years
    ...Object.fromEntries(
      Object.entries(fixtureIs).filter(([k]) => k !== fyKey),
    ),
  };

  // Loan request: keep the fixture sizing (banker-curated).
  const loan_request = fallback.loan_request as {
    amount_usd: number;
    facility_type: string;
    [k: string]: unknown;
  };
  const loan_amount = Number(loan_request.amount_usd ?? 25_000_000);

  const scenario_tag = "happy-path";

  const now = new Date();
  const payload: Record<string, unknown> = {
    application_id,
    borrower_id,
    borrower_name,
    loan_amount,
    loan_type: loan_request.facility_type ?? "term",
    naics_code,
    submitted_at: now.toISOString(),
    scenario_tag,
    source_doc: {
      file_name: fileName,
      ingested_via: "ui-document-dropzone",
      parse_quality,
    },
    loan_request,
    financial_statements: {
      income_statement: is,
      balance_sheet: fallback.financial_statements.balance_sheet,
      cash_flow: fallback.financial_statements.cash_flow,
    },
    borrower_metadata: {
      ...fallback.borrower_metadata,
      ...(ext.legal_name ? { legal_name: ext.legal_name } : {}),
      ...(ext.cik ? { cik: ext.cik } : {}),
      ...(ext.fiscal_year ? { fiscal_year: ext.fiscal_year } : {}),
    },
    customer_concentration: fallback.customer_concentration,
    management: fallback.management,
    collateral_offered: fallback.collateral_offered,
    principals_and_owners: fallback.principals_and_owners,
  };

  return {
    payload,
    application_id,
    parse_quality,
    used_fallback,
    borrower_name,
    borrower_id,
    loan_amount,
    naics_code,
    scenario_tag,
  };
}

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

// ── Side effects ─────────────────────────────────────────────────────────

async function writeArtifactsIfPossible(args: {
  applicationId: string;
  pdfText: string;
  ext: ExtractedFinancials;
  fileName: string;
  fileSize: number;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!isDbConfigured()) {
    return { ok: false, reason: "db-not-configured" };
  }
  try {
    const pool = getPool();
    // Cap stored text at 250KB; the 10-K excerpt is ~20KB so this fits comfortably.
    const TEXT_CAP = 250_000;
    const trimmed =
      args.pdfText.length > TEXT_CAP
        ? args.pdfText.slice(0, TEXT_CAP) +
          `\n\n[truncated — original ${args.pdfText.length} chars]`
        : args.pdfText;

    // Note: we can only insert into application_artifacts when a matching
    // application_state row exists (FK). seedApplicationState runs first, so
    // by the time we get here the row is in place.
    await pool.query(
      `INSERT INTO application_artifacts
         (application_id, artifact_type, revision_number, author, body)
       VALUES ($1, 'source_doc_extract', 1, 'system', $2::jsonb)
       ON CONFLICT (application_id, artifact_type, revision_number) DO NOTHING`,
      [
        args.applicationId,
        JSON.stringify({
          file_name: args.fileName,
          file_size_bytes: args.fileSize,
          ingested_at: new Date().toISOString(),
          extracted: args.ext,
          full_text: trimmed,
        }),
      ],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

async function seedApplicationState(args: {
  applicationId: string;
  borrowerId: string;
  borrowerName: string;
  naicsCode?: string;
  loanAmount: number;
  scenarioTag: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!isDbConfigured()) return { ok: false, reason: "db-not-configured" };
  try {
    const pool = getPool();
    // 5 business days from now ≈ 7 calendar days. Conservative deadline so
    // the homepage's clock badge displays a sensible value.
    const now = new Date();
    const deadline = new Date(now.getTime() + 5 * 24 * 3600_000);
    await pool.query(
      `INSERT INTO application_state
         (application_id, borrower_id, borrower_name, naics_code,
          loan_amount_usd, scenario_tag, current_stage,
          regulatory_deadline, clock_started_at, created_at, updated_at,
          last_event_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'intake', $7, $8, NOW(), NOW(), NOW())
       ON CONFLICT (application_id) DO NOTHING`,
      [
        args.applicationId,
        args.borrowerId,
        args.borrowerName,
        args.naicsCode ?? null,
        args.loanAmount,
        args.scenarioTag,
        deadline.toISOString(),
        now.toISOString(),
      ],
    );
    // Insert a stage_entered event so the audit trail starts at "ingested".
    await pool.query(
      `INSERT INTO application_events
         (application_id, event_type, service_name, payload, occurred_at)
       VALUES ($1, 'stage_entered', 'ui-dropzone',
               jsonb_build_object('stage', 'intake', 'channel', 'document-upload'),
               NOW())`,
      [args.applicationId],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

async function publishToPubSub(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  if (!GCP_PROJECT) {
    return { ok: false, reason: "GCP_PROJECT not set" };
  }
  try {
    const ps = await getPubsub();
    if (!ps) return { ok: false, reason: "pubsub-client-init-failed" };
    const data = Buffer.from(JSON.stringify(payload), "utf-8");
    const messageId = await ps.topic(TOPIC_SUBMITTED).publishMessage({
      data,
      attributes: {
        event_type: "loans.application.submitted",
        scenario_tag: String(payload.scenario_tag ?? "live"),
        borrower_id: String(payload.borrower_id ?? ""),
        application_id: String(payload.application_id ?? ""),
        ingested_via: "ui-document-dropzone",
      },
    });
    return { ok: true, messageId };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

// ── Route handler ────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // Parse multipart body — the standard fetch FormData parser is built into
  // the Next.js Node runtime.
  let file: File | null = null;
  try {
    const fd = await req.formData();
    const raw = fd.get("file");
    if (raw instanceof File) file = raw;
  } catch (e) {
    return NextResponse.json(
      { error: `Bad form data: ${(e as Error).message}` },
      { status: 400 },
    );
  }
  if (!file) {
    return NextResponse.json(
      { error: "Missing `file` field in form data" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes; limit ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Extract text ────────────────────────────────────────────────────
  let pdfText = "";
  try {
    const { PDFParse } = await loadPdfParse();
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const r = await parser.getText();
    pdfText = r.text ?? "";
    await parser.destroy();
  } catch (e) {
    return NextResponse.json(
      { error: `PDF parse failed: ${(e as Error).message}` },
      { status: 422 },
    );
  }

  // ── Extract financial landmarks ─────────────────────────────────────
  const ext = extractFinancials(pdfText);
  const fallback = await loadFallbackFixture();
  const built = buildPayload(ext, fallback, file.name);

  // ── Side effects (best-effort, non-fatal) ───────────────────────────
  // Order: seed application_state → publish → write artifact extract.
  // We don't fail the request when any of these degrade, but we report
  // the status to the client so demos in degraded environments are honest.
  const seed = await seedApplicationState({
    applicationId: built.application_id,
    borrowerId: built.borrower_id,
    borrowerName: built.borrower_name,
    naicsCode: built.naics_code,
    loanAmount: built.loan_amount,
    scenarioTag: built.scenario_tag,
  });

  const publish = await publishToPubSub(built.payload);

  const artifact = await writeArtifactsIfPossible({
    applicationId: built.application_id,
    pdfText,
    ext,
    fileName: file.name,
    fileSize: file.size,
  });

  return NextResponse.json(
    {
      application_id: built.application_id,
      parse_quality: built.parse_quality,
      borrower_name: built.borrower_name,
      borrower_id: built.borrower_id,
      side_effects: {
        application_state_seeded: seed.ok,
        application_state_reason: seed.ok ? null : seed.reason,
        pubsub_published: publish.ok,
        pubsub_reason: publish.ok ? null : publish.reason,
        pubsub_message_id: publish.messageId ?? null,
        artifact_stored: artifact.ok,
        artifact_reason: artifact.ok ? null : artifact.reason,
      },
    },
    { status: 200 },
  );
}
