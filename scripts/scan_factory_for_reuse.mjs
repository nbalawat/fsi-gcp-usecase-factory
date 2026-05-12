#!/usr/bin/env node
// scripts/scan_factory_for_reuse.mjs
//
// Given a (possibly partial) brief.yaml, scans the factory for reuse
// opportunities. Returns a JSON report the intake skill stamps into
// brief.reuse_map and brief.economics_projection.
//
// Two-pass match: (1) filename + manifest keyword match, (2) semantic
// keyword match against atomic service purposes / agent purposes /
// rule citations / UI primitive descriptions.
//
// Usage:
//   node scripts/scan_factory_for_reuse.mjs <path-to-brief.yaml>
//
// Output: JSON to stdout.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const ATOMIC_DIR = join(REPO_ROOT, "services/atomic");
const AGENT_LIB_DIR = join(REPO_ROOT, "libraries/agents");
const RULES_DIR = join(REPO_ROOT, "rules");
const UI_PRIMITIVE_DIR = join(REPO_ROOT, "ui/packages/components/src");

function parseYaml(yamlPath) {
  const cmd = `python3 -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(open('${yamlPath}'))))"`;
  // Silence stderr so malformed manifests don't spew tracebacks; caller
  // catches the throw and treats as "skip this file".
  return JSON.parse(execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }));
}

function readManifestSummary(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try {
    return parseYaml(manifestPath);
  } catch {
    return null;
  }
}

// Cost-per-component model (in cents). Sourced from product-build-discipline
// Rule 18 averages. Re-fit when you have better empirical data.
const COMPONENT_COST_CENTS = {
  atomic_service: 0.4,
  agent_call: 5.0,
  rule_eval: 0.05,
  workflow_step: 0.2,
};
const COMPONENT_LATENCY_MS = {
  atomic_service: 250,
  agent_call: 2500,
  rule_eval: 30,
  workflow_step: 50,
};

// ── tokeniser for semantic matching ──────────────────────────────────
const STOP = new Set([
  "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "with", "from",
  "by", "is", "are", "be", "this", "that", "we", "our", "uc", "use", "case",
]);
function tokens(text) {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const inter = new Set([...a].filter((x) => b.has(x)));
  const uni = new Set([...a, ...b]);
  return inter.size / uni.size;
}

// ── scan atomic services ─────────────────────────────────────────────
function scanAtomic() {
  if (!existsSync(ATOMIC_DIR)) return [];
  return readdirSync(ATOMIC_DIR)
    .filter((d) => statSync(join(ATOMIC_DIR, d)).isDirectory())
    .map((name) => {
      const manifestPath = join(ATOMIC_DIR, name, "manifest.json");
      const summary = existsSync(manifestPath)
        ? (() => {
            try {
              return JSON.parse(readFileSync(manifestPath, "utf-8"));
            } catch {
              return null;
            }
          })()
        : null;
      return {
        kind: "atomic-service",
        name,
        path: join("services/atomic", name),
        keywords: tokens(`${name} ${summary?.purpose || ""} ${summary?.description || ""}`),
      };
    });
}

// ── scan agent archetypes ────────────────────────────────────────────
function scanAgents() {
  if (!existsSync(AGENT_LIB_DIR)) return [];
  return readdirSync(AGENT_LIB_DIR)
    .filter((d) => statSync(join(AGENT_LIB_DIR, d)).isDirectory())
    .map((name) => {
      const manifestPath = join(AGENT_LIB_DIR, name, "manifest.yaml");
      const summary = readManifestSummary(manifestPath);
      return {
        kind: "agent-archetype",
        name,
        path: join("libraries/agents", name),
        keywords: tokens(`${name} ${summary?.purpose || ""} ${summary?.description || ""}`),
      };
    });
}

// ── scan rules ───────────────────────────────────────────────────────
function scanRules() {
  if (!existsSync(RULES_DIR)) return [];
  const out = [];
  for (const f of readdirSync(RULES_DIR)) {
    const fp = join(RULES_DIR, f);
    if (statSync(fp).isDirectory()) {
      out.push({
        kind: "rule",
        name: f,
        path: join("rules", f),
        keywords: tokens(f.replace(/[_-]/g, " ")),
      });
    }
  }
  return out;
}

// ── scan UI primitives ───────────────────────────────────────────────
function scanUIPrimitives() {
  if (!existsSync(UI_PRIMITIVE_DIR)) return [];
  return readdirSync(UI_PRIMITIVE_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => {
      const name = f.replace(/\.tsx$/, "");
      return {
        kind: "ui-primitive",
        name,
        path: join("ui/packages/components/src", f),
        keywords: tokens(name.replace(/([A-Z])/g, " $1")),
      };
    });
}

// ── match brief against catalog ──────────────────────────────────────
function matchBriefAgainst(brief, catalog) {
  // Build per-field token sets out of brief
  const queries = [];
  for (const s of brief.atomic_services || []) {
    queries.push({ field: `atomic_services[${s.name}]`, tokens: tokens(`${s.name} ${s.purpose}`) });
  }
  for (const r of brief.rules || []) {
    queries.push({ field: `rules[${r.name}]`, tokens: tokens(`${r.name} ${r.purpose}`) });
  }
  for (const a of brief.agent_envelope?.agent_sketches || []) {
    queries.push({ field: `agent_envelope.agent_sketches[${a.role}]`, tokens: tokens(`${a.role} ${a.purpose}`) });
  }
  for (const m of brief.console?.moments_of_truth || []) {
    queries.push({ field: `console.moments_of_truth[${m.screen}]`, tokens: tokens(`${m.screen} ${m.user_sees}`) });
  }

  const matches = [];
  for (const q of queries) {
    for (const c of catalog) {
      const score = jaccard(q.tokens, c.keywords);
      if (score >= 0.2) {
        matches.push({ candidate: c.name, kind: c.kind, matched_brief_field: q.field, match_confidence: Number(score.toFixed(2)) });
      }
    }
  }
  // de-dupe, keep best confidence per (candidate, field)
  const dedup = new Map();
  for (const m of matches) {
    const key = `${m.candidate}|${m.matched_brief_field}`;
    if (!dedup.has(key) || dedup.get(key).match_confidence < m.match_confidence) {
      dedup.set(key, m);
    }
  }
  return [...dedup.values()];
}

// ── economics projection ─────────────────────────────────────────────
function project(brief, reusedAtomic, reusedAgents, reusedRules) {
  // Naive model:
  //   cost = atomic_calls * atomic_unit + agent_calls * agent_unit + rule_evals * rule_unit + workflow_steps * step_unit
  //   p99  = sum of dominant-path component latencies (worst case ≈ workflow stages × max(stage component))
  const atomicCalls = (brief.atomic_services || []).length;
  const agentCalls = (brief.agent_envelope?.agent_sketches || []).length;
  const ruleEvals = (brief.rules || []).length;
  const workflowSteps = (brief.process?.stages || []).length;

  const costCents =
    atomicCalls * COMPONENT_COST_CENTS.atomic_service +
    agentCalls * COMPONENT_COST_CENTS.agent_call +
    ruleEvals * COMPONENT_COST_CENTS.rule_eval +
    workflowSteps * COMPONENT_COST_CENTS.workflow_step;

  // p99 latency: assume stages run sequentially; per stage = max component latency
  let p99 = 0;
  for (const _ of brief.process?.stages || []) {
    p99 += Math.max(
      COMPONENT_LATENCY_MS.agent_call,
      COMPONENT_LATENCY_MS.atomic_service,
      COMPONENT_LATENCY_MS.workflow_step
    );
  }

  return {
    projected_cost_per_case_usd: Number((costCents / 100).toFixed(3)),
    projected_p99_ms: Math.round(p99),
    cost_breakdown_by_component: {
      atomic_services: Number(((atomicCalls * COMPONENT_COST_CENTS.atomic_service) / 100).toFixed(4)),
      agents: Number(((agentCalls * COMPONENT_COST_CENTS.agent_call) / 100).toFixed(4)),
      rules: Number(((ruleEvals * COMPONENT_COST_CENTS.rule_eval) / 100).toFixed(4)),
      workflow_steps: Number(((workflowSteps * COMPONENT_COST_CENTS.workflow_step) / 100).toFixed(4)),
    },
    assumptions: [
      "Naive sequential workflow (no parallelism)",
      `Atomic service unit cost ${COMPONENT_COST_CENTS.atomic_service}¢; agent call ${COMPONENT_COST_CENTS.agent_call}¢`,
      "p99 latency estimated as sum of per-stage worst components",
      "Real numbers may diverge ±30% on first deployment; tune after week-1 telemetry",
    ],
  };
}

// ── main ─────────────────────────────────────────────────────────────
function main() {
  const briefPath = process.argv[2];
  if (!briefPath) {
    console.error("Usage: scan_factory_for_reuse.mjs <path-to-brief.yaml>");
    process.exit(1);
  }
  if (!existsSync(briefPath)) {
    console.error(`Brief not found: ${briefPath}`);
    process.exit(1);
  }
  const brief = parseYaml(briefPath);

  const catalog = [
    ...scanAtomic(),
    ...scanAgents(),
    ...scanRules(),
    ...scanUIPrimitives(),
  ];

  const matches = matchBriefAgainst(brief, catalog);

  const reusedAtomic = (brief.atomic_services || [])
    .filter((s) => s.reuse_status?.startsWith("reuse") || s.reuse_status?.startsWith("extend"))
    .map((s) => s.name);
  const netNewAtomic = (brief.atomic_services || [])
    .filter((s) => s.reuse_status === "net-new")
    .map((s) => s.name);
  const reusedAgents = (brief.agent_envelope?.agent_sketches || [])
    .filter((a) => a.reuse_status?.startsWith("reuse") || a.reuse_status?.startsWith("extend"))
    .map((a) => a.archetype_id)
    .filter(Boolean);
  const netNewAgents = (brief.agent_envelope?.agent_sketches || [])
    .filter((a) => a.reuse_status === "net-new")
    .map((a) => a.role);
  const reusedRules = (brief.rules || [])
    .filter((r) => r.reuse_status?.startsWith("reuse") || r.reuse_status?.startsWith("extend"))
    .map((r) => r.name);
  const netNewRules = (brief.rules || [])
    .filter((r) => r.reuse_status === "net-new")
    .map((r) => r.name);

  const totalAtomic = reusedAtomic.length + netNewAtomic.length || 1;
  const totalAgents = reusedAgents.length + netNewAgents.length || 1;

  const reuseMap = {
    generated_at: new Date().toISOString(),
    atomic_services_reused: reusedAtomic,
    atomic_services_net_new: netNewAtomic,
    agent_archetypes_reused: reusedAgents,
    agent_archetypes_net_new: netNewAgents,
    rules_reused: reusedRules,
    rules_net_new: netNewRules,
    ui_primitives_used: [],
    reuse_rate_atomic_pct: Number(((reusedAtomic.length * 100) / totalAtomic).toFixed(1)),
    reuse_rate_agents_pct: Number(((reusedAgents.length * 100) / totalAgents).toFixed(1)),
    candidates_to_review: matches
      .filter((m) => {
        // Only surface candidates the user didn't already adopt
        if (m.kind === "atomic-service" && reusedAtomic.includes(m.candidate)) return false;
        if (m.kind === "agent-archetype" && reusedAgents.includes(m.candidate)) return false;
        if (m.kind === "rule" && reusedRules.includes(m.candidate)) return false;
        return true;
      })
      .sort((a, b) => b.match_confidence - a.match_confidence)
      .slice(0, 20),
  };

  const economics = project(brief, reusedAtomic, reusedAgents, reusedRules);
  economics.generated_at = reuseMap.generated_at;

  console.log(JSON.stringify({ reuse_map: reuseMap, economics_projection: economics }, null, 2));
}

main();
