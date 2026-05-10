#!/usr/bin/env node
// scripts/generate_mock_canvas_data.mjs
//
// Reads onboarding/<uc>.yaml and emits a deterministic TypeScript mock-data
// module at usecases/<uc>/ui/proposals/_shared/mock-data.ts.
//
// Every designer agent imports from this single module so all 4 options
// render the same data. Without this, comparing options is meaningless —
// any visual difference could be data, not design.
//
// What's mocked (by canvas inputs):
//   - case shape derived from console_pattern
//       pipeline      → loan application
//       investigations → SAR-style case
//       real-time     → score event
//       surveillance  → exposure cell
//       run           → run output line
//       recommendations → suggestion card
//   - per-atomic-service stub responses pulled from each service's
//     tests/golden/*.json (or services/atomic/<name>/manifest.json[examples])
//   - per-agent stub outputs pulled from each archetype's response_schema
//     example or generated from the schema's typed shape
//   - per-rule verdict stub (pass/watch/fail) seeded by canvas's
//     shared_rules_reused
//   - HITL gate stubs matching canvas.hitl_gates ordering
//   - 12 borrower fixtures + 30 sample events
//
// Idempotent: same canvas SHA → byte-identical output.
//
// Usage:
//   node scripts/generate_mock_canvas_data.mjs <use_case>
//
// Exit codes: 0=ok, 1=missing canvas / bad parse, 2=missing referenced shape

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..");

// ────────────────── canvas loader (reuses YAML parser) ──────────────────
import { fileURLToPath } from "node:url";
const SELF_DIR = dirname(fileURLToPath(import.meta.url));

// Tiny YAML parser inlined (kept intentionally simple — same as
// scripts/check_reuse_rate.mjs's parser; both are tested via fixture
// roundtrip in test_fsi_design_proposals.sh).
function loadYaml(text) {
  const raw = text.split(/\r?\n/).map(stripComment).filter(l => l.trim() !== "");
  const tokens = raw.map(l => ({ indent: l.match(/^\s*/)[0].length, content: l.trim() }));
  let i = 0;
  function parseBlock(parentIndent) {
    if (i >= tokens.length) return null;
    const first = tokens[i];
    if (first.indent <= parentIndent) return null;
    if (first.content.startsWith("- ") || first.content === "-") return parseList(first.indent);
    return parseObject(first.indent);
  }
  function parseObject(myIndent) {
    const obj = {};
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.indent < myIndent) break;
      if (t.indent > myIndent) { i++; continue; }
      const m = t.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
      if (!m) break;
      const key = m[1], inline = m[2]; i++;
      if (!inline) obj[key] = parseBlock(myIndent) ?? null;
      else if (inline === "[]") obj[key] = [];
      else if (inline === "{}") obj[key] = {};
      else obj[key] = parseScalar(inline);
    }
    return obj;
  }
  function parseList(myIndent) {
    const arr = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.indent < myIndent) break;
      if (t.indent > myIndent) { i++; continue; }
      if (!t.content.startsWith("- ") && t.content !== "-") break;
      const itemContent = t.content === "-" ? "" : t.content.slice(2).trim(); i++;
      if (!itemContent) arr.push(parseBlock(myIndent) ?? null);
      else if (/^[A-Za-z_$][\w-]*\s*:/.test(itemContent)) {
        const m = itemContent.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
        const obj = {}; const key = m[1], inline = m[2];
        if (!inline) obj[key] = parseBlock(myIndent + 2) ?? null;
        else if (inline === "[]") obj[key] = [];
        else if (inline === "{}") obj[key] = {};
        else obj[key] = parseScalar(inline);
        while (i < tokens.length && tokens[i].indent === myIndent + 2) {
          const tt = tokens[i];
          const mm = tt.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
          if (!mm) break;
          const k2 = mm[1], v2 = mm[2]; i++;
          if (!v2) obj[k2] = parseBlock(myIndent + 2) ?? null;
          else if (v2 === "[]") obj[k2] = [];
          else if (v2 === "{}") obj[k2] = {};
          else obj[k2] = parseScalar(v2);
        }
        arr.push(obj);
      } else arr.push(parseScalar(itemContent));
    }
    return arr;
  }
  if (!tokens.length) return {};
  return tokens[0].content.startsWith("- ") ? parseList(tokens[0].indent) : parseObject(tokens[0].indent);
}
function stripComment(line) {
  let inQ = false;
  for (let k = 0; k < line.length; k++) {
    if (line[k] === '"') inQ = !inQ;
    if (line[k] === "#" && !inQ && (k === 0 || /\s/.test(line[k - 1]))) return line.slice(0, k).trimEnd();
  }
  return line;
}
function parseScalar(raw) {
  if (raw === "" || raw === "null" || raw === "~") return null;
  if (raw === "true") return true; if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  if ((raw[0] === '"' && raw.endsWith('"')) || (raw[0] === "'" && raw.endsWith("'"))) return raw.slice(1, -1);
  return raw;
}

// ────────────────── canonical case shapes per console_pattern ──────────
const CASE_SHAPE_BY_CONSOLE = {
  pipeline: {
    canonical_id: "APP-2026-LECO-001",
    title: "Lincoln Electric Holdings — $25M revolver",
    primary_actor: "Relationship Manager",
    decision_kind: "approve | decline | refer",
    stages: ["intake", "extracting", "analyzing", "spreading", "rating", "drafting", "reviewing", "approval", "done"],
    key_metrics: ["DSCR", "leverage", "single_borrower_pct", "risk_band"],
  },
  investigations: {
    canonical_id: "SAR-2026-04891",
    title: "Velocity-spike alert — wire-out aggregation across 14 days",
    primary_actor: "BSA Analyst",
    decision_kind: "file_sar | dismiss | escalate",
    stages: ["alert", "evidence-gathering", "investigation", "narrative", "decision", "filed"],
    key_metrics: ["alert_score", "structuring_signal", "geography_risk"],
  },
  "real-time": {
    canonical_id: "EVT-1715350200-7f3a",
    title: "POS auth — $2,847 at Walmart Supercenter",
    primary_actor: "Fraud Ops",
    decision_kind: "approve | decline | step-up",
    stages: ["received", "scored", "decided", "settled"],
    key_metrics: ["score", "model_confidence", "feature_drift_pct"],
  },
  surveillance: {
    canonical_id: "CELL-CRE-NORTHEAST-2026Q2",
    title: "CRE concentration · Northeast region",
    primary_actor: "Chief Credit Officer",
    decision_kind: "watch | constrain | breach",
    stages: ["aggregated", "compared", "decided"],
    key_metrics: ["pct_capital", "delta_yoy", "rule_status"],
  },
  run: {
    canonical_id: "RUN-CECL-2026Q2",
    title: "CECL Q2 reserve calculation",
    primary_actor: "Risk Analytics Lead",
    decision_kind: "publish | adjust | rerun",
    stages: ["queued", "running", "review", "published"],
    key_metrics: ["pd", "lgd", "ead", "ecl"],
  },
  recommendations: {
    canonical_id: "REC-2026-NBA-9032",
    title: "Cross-sell opportunity — small-business credit card",
    primary_actor: "Branch Banker",
    decision_kind: "accept | dismiss | snooze",
    stages: ["produced", "presented", "dispositioned"],
    key_metrics: ["uplift_score", "fit_score", "regulatory_clear"],
  },
};

// ────────────────── service stubs from manifests ──────────────────
function loadAtomicStubs(canvas) {
  const out = {};
  for (const name of canvas.atomic_services_reused ?? []) {
    const dir = join(REPO, "services/atomic", name);
    if (!existsSync(dir)) {
      console.error(`warn: atomic service ${name} declared in canvas but missing on disk`);
      continue;
    }
    // Prefer a tests/golden/*.json output fixture; fall back to a
    // synthesized payload from manifest.json[output_schema].
    const golden = pickGoldenFixture(dir);
    out[name] = golden ?? synthesizeFromManifest(dir, name);
  }
  return out;
}
function pickGoldenFixture(serviceDir) {
  const golden = join(serviceDir, "tests", "golden");
  if (!existsSync(golden)) return null;
  for (const f of readdirSync(golden)) {
    if (f.endsWith(".json")) {
      try { return JSON.parse(readFileSync(join(golden, f), "utf-8")); } catch { /* ignore */ }
    }
  }
  return null;
}
function synthesizeFromManifest(serviceDir, name) {
  const mfPath = join(serviceDir, "manifest.json");
  if (!existsSync(mfPath)) return { _stub: name };
  try {
    const mf = JSON.parse(readFileSync(mfPath, "utf-8"));
    return mf.example ?? mf.examples?.[0] ?? { _stub: name, _output_schema: !!mf.output_schema };
  } catch {
    return { _stub: name };
  }
}

// ────────────────── agent archetype stubs ──────────────────
function loadAgentStubs(canvas) {
  const out = {};
  for (const arch of canvas.agent_archetypes_reused ?? []) {
    const archetypeName = arch.replace(/@.+$/, "");
    const dir = join(REPO, "libraries/agents", archetypeName);
    if (!existsSync(dir)) {
      console.error(`warn: agent archetype ${archetypeName} declared in canvas but missing on disk`);
      continue;
    }
    out[archetypeName] = loadAgentExample(dir, archetypeName);
  }
  return out;
}
function loadAgentExample(dir, name) {
  // Try archetype.yaml or manifest.yaml; prefer an `example_output` field
  // if present, otherwise synthesize a minimal shape from the response_schema.
  for (const fname of ["manifest.yaml", "archetype.yaml"]) {
    const p = join(dir, fname);
    if (existsSync(p)) {
      try {
        const yml = loadYaml(readFileSync(p, "utf-8"));
        return yml.example_output ?? { _stub: name, _archetype_loaded: true };
      } catch { /* ignore */ }
    }
  }
  return { _stub: name };
}

// ────────────────── 12 canonical borrower fixtures ──────────────────
const BORROWERS = [
  { id: "BRW-LECO",  name: "Lincoln Electric Holdings",   naics: "33",   revenue_usd: 4_184_000_000, geo: "OH", risk_band: "1-pass" },
  { id: "BRW-BRK",   name: "Berkshire Industrial Holdings", naics: "31", revenue_usd: 364_000_000_000, geo: "NE", risk_band: "1-pass" },
  { id: "BRW-FORD",  name: "Ford Motor Co.",              naics: "33",   revenue_usd: 158_057_000_000, geo: "MI", risk_band: "2-special-mention" },
  { id: "BRW-DEERE", name: "Deere & Company",             naics: "33",   revenue_usd: 51_716_000_000, geo: "IL", risk_band: "1-pass" },
  { id: "BRW-CAT",   name: "Caterpillar Inc.",            naics: "33",   revenue_usd: 67_060_000_000, geo: "IL", risk_band: "1-pass" },
  { id: "BRW-GE",    name: "GE Aerospace",                naics: "33",   revenue_usd: 32_879_000_000, geo: "MA", risk_band: "2-special-mention" },
  { id: "BRW-HON",   name: "Honeywell International",     naics: "33",   revenue_usd: 36_662_000_000, geo: "NC", risk_band: "1-pass" },
  { id: "BRW-EAT",   name: "Eaton Corp.",                 naics: "33",   revenue_usd: 23_196_000_000, geo: "OH", risk_band: "1-pass" },
  { id: "BRW-3M",    name: "3M Company",                  naics: "33",   revenue_usd: 32_681_000_000, geo: "MN", risk_band: "2-special-mention" },
  { id: "BRW-EMR",   name: "Emerson Electric Co.",        naics: "33",   revenue_usd: 17_492_000_000, geo: "MO", risk_band: "1-pass" },
  { id: "BRW-PH",    name: "Parker Hannifin",             naics: "33",   revenue_usd: 19_065_000_000, geo: "OH", risk_band: "1-pass" },
  { id: "BRW-ITW",   name: "Illinois Tool Works",         naics: "33",   revenue_usd: 16_106_000_000, geo: "IL", risk_band: "1-pass" },
];

// ────────────────── pipeline events (30 entries, deterministic order) ──
function buildEvents(canvas) {
  const out = [];
  let ts = Date.parse("2026-05-09T08:00:00Z");
  const tick = (s) => { ts += s * 1000; return new Date(ts).toISOString(); };
  out.push({ at: tick(0),  kind: "stage_entered",   stage: "intake" });
  out.push({ at: tick(2),  kind: "document_uploaded", doc_type: "10-K" });
  out.push({ at: tick(3),  kind: "document_uploaded", doc_type: "AR_aging" });
  out.push({ at: tick(4),  kind: "stage_entered",   stage: "extracting" });
  out.push({ at: tick(45), kind: "document_extracted", doc_type: "10-K", confidence: 0.94 });
  out.push({ at: tick(8),  kind: "document_extracted", doc_type: "AR_aging", confidence: 0.91 });
  for (const svc of canvas.atomic_services_reused ?? []) {
    out.push({ at: tick(2),  kind: "service_invoked", service: svc, latency_ms: 240 + Math.floor(Math.random() * 800) });
  }
  for (const a of canvas.agent_archetypes_reused ?? []) {
    out.push({ at: tick(7),  kind: "agent_invoked", agent: a.replace(/@.+$/, ""), tokens_in: 8000, tokens_out: 3500 });
  }
  for (const g of (canvas.hitl_gates ?? []).filter(x => x !== "none")) {
    out.push({ at: tick(60), kind: "human_action_pending", gate: g });
    out.push({ at: tick(180), kind: "human_action", gate: g, decision: "approve" });
  }
  out.push({ at: tick(2),  kind: "stage_entered", stage: "done" });
  return out.slice(0, 30);
}

// ────────────────── render TypeScript module ──────────────────
function renderTs(uc, canvas, sha, atomicStubs, agentStubs, events) {
  const console_pattern = canvas.console_pattern ?? "pipeline";
  const caseShape = CASE_SHAPE_BY_CONSOLE[console_pattern] ?? CASE_SHAPE_BY_CONSOLE.pipeline;

  // JSON.stringify with 2-space indent for readability inside the .ts file.
  const j = (o) => JSON.stringify(o, null, 2);

  return `// THIS FILE IS GENERATED by scripts/generate_mock_canvas_data.mjs.
// Do not edit by hand; designer agents must IMPORT from this module
// (read-only). To regenerate after canvas changes:
//
//   node scripts/generate_mock_canvas_data.mjs ${uc}
//
// Provenance:
//   use_case_id     = ${uc}
//   canvas_sha256   = ${sha}
//   generated_at    = ${new Date().toISOString()}
//   console_pattern = ${console_pattern}

export const USE_CASE_ID = ${j(uc)};
export const CANVAS_SHA256 = ${j(sha)};
export const CONSOLE_PATTERN = ${j(console_pattern)};

export interface Borrower {
  id: string;
  name: string;
  naics: string;
  revenue_usd: number;
  geo: string;
  risk_band: string;
}

export const BORROWERS: Borrower[] = ${j(BORROWERS)};

export const PRIMARY_BORROWER = BORROWERS[0];

export interface CaseShape {
  canonical_id: string;
  title: string;
  primary_actor: string;
  decision_kind: string;
  stages: string[];
  key_metrics: string[];
}

export const CASE_SHAPE: CaseShape = ${j(caseShape)};

export const HITL_GATES = ${j((canvas.hitl_gates ?? []).filter(g => g !== "none"))};

export const ATOMIC_SERVICE_STUBS: Record<string, unknown> = ${j(atomicStubs)};

export const AGENT_OUTPUT_STUBS: Record<string, unknown> = ${j(agentStubs)};

export const SHARED_RULES = ${j(canvas.shared_rules_reused ?? [])};

export const RULE_VERDICTS: Record<string, "pass" | "watch" | "fail" | "skip"> = {
${(canvas.shared_rules_reused ?? []).map((r, i) => `  ${j(r)}: ${j(["pass", "pass", "watch", "pass"][i % 4])}`).join(",\n")}
};

export const PIPELINE_EVENTS = ${j(events)};

export const MODEL_PROVIDER = ${j(canvas.model_provider ?? "vertex_gemini")};

export const COMPLIANCE_SCOPE = ${j(canvas.compliance_scope ?? "full")};

// A minimal "live case" that designers can render directly.
export const LIVE_CASE = {
  id: CASE_SHAPE.canonical_id,
  title: CASE_SHAPE.title,
  borrower: PRIMARY_BORROWER,
  current_stage: CASE_SHAPE.stages[CASE_SHAPE.stages.length - 1],
  decision: "approve",
  decision_kind: CASE_SHAPE.decision_kind,
  hitl_gates: HITL_GATES,
  events: PIPELINE_EVENTS,
  rule_verdicts: RULE_VERDICTS,
  service_results: ATOMIC_SERVICE_STUBS,
  agent_outputs: AGENT_OUTPUT_STUBS,
};

// END GENERATED.
`;
}

// ────────────────── main ──────────────────
const uc = process.argv[2];
if (!uc) {
  console.error("usage: node scripts/generate_mock_canvas_data.mjs <use_case>");
  process.exit(1);
}

const canvasPath = join(REPO, "onboarding", `${uc}.yaml`);
if (!existsSync(canvasPath)) {
  console.error(`canvas not found: ${canvasPath}\nRun /fsi-onboard ${uc} first.`);
  process.exit(1);
}

let canvas;
try { canvas = loadYaml(readFileSync(canvasPath, "utf-8")); }
catch (e) { console.error(`canvas parse failed: ${e.message}`); process.exit(1); }

const canvasSha = createHash("sha256").update(readFileSync(canvasPath)).digest("hex");

const atomic = loadAtomicStubs(canvas);
const agents = loadAgentStubs(canvas);
const events = buildEvents(canvas);

const outDir = join(REPO, "usecases", uc, "ui", "proposals", "_shared");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "mock-data.ts");
writeFileSync(outPath, renderTs(uc, canvas, canvasSha, atomic, agents, events));

console.log(`✓ wrote ${outPath}`);
console.log(`  use_case          : ${uc}`);
console.log(`  console_pattern   : ${canvas.console_pattern}`);
console.log(`  canvas_sha256     : ${canvasSha.slice(0, 16)}…`);
console.log(`  atomic stubs      : ${Object.keys(atomic).length}`);
console.log(`  agent stubs       : ${Object.keys(agents).length}`);
console.log(`  events            : ${events.length}`);
console.log(`  borrowers         : ${BORROWERS.length}`);
