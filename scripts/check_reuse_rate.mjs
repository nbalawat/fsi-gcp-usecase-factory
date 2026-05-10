#!/usr/bin/env node
// scripts/check_reuse_rate.mjs
//
// Hard gate enforced by /fsi-onboard at Step 9 and by /review-uc on every
// commit. Reads an onboarding canvas (or a use case's reasons.yaml that
// embeds the same fields) and computes per-layer reuse percentage. Exits
// non-zero if the bank's targets are not met.
//
// Targets:
//   atomic_pct  >= 0.80   — Layer 1 (BLOCKING)
//   agents_pct  >= 0.70   — Layer 3 (BLOCKING)
//   rules_pct   >= 0.60   — Layer 2 (warn-only — some UCs are rule-novel)
//   hitl_count  <= 4      — soft warn
//
// Usage:
//   node scripts/check_reuse_rate.mjs <onboarding.yaml>
//
// Honours an explicit override:
//   reuse_gate_override:
//     approver: <email>
//     ticket:   <jira ref>
//     date:     2026-05-10
//
// Exit codes: 0=pass, 1=blocked, 2=usage error.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TARGETS = {
  atomic: { min: 0.80, hard: true,  label: "atomic services" },
  agents: { min: 0.70, hard: true,  label: "agent archetypes" },
  rules:  { min: 0.60, hard: false, label: "shared rules" },
  hitl:   { max: 4,    hard: false, label: "HITL gates" },
};

// ────────────────── tiny YAML loader ──────────────────
// Two-pass parser tolerant of /fsi-onboard's emitted shapes.
//
// Limitations: no anchors, no merge keys, no flow scalars, no folded blocks,
// no tags. Comments stripped. Indentation must be a multiple of 2 spaces.
function loadYaml(text) {
  const rawLines = text.split(/\r?\n/);
  // Strip trailing inline comments (preserve quoted hashes).
  const stripped = rawLines.map(l => stripComment(l));
  const lines = stripped.filter(l => l.trim() !== "");

  // Tokenize into {indent, content}.
  const tokens = lines.map(l => ({
    indent: l.match(/^\s*/)[0].length,
    content: l.trim(),
    raw: l,
  }));

  // Recursive descent.
  let i = 0;

  function parseBlock(parentIndent) {
    // Decide list vs object by inspecting the next token at indent > parentIndent.
    if (i >= tokens.length) return null;
    const first = tokens[i];
    if (first.indent <= parentIndent) return null;
    if (first.content.startsWith("- ") || first.content === "-") {
      return parseList(first.indent);
    }
    return parseObject(first.indent);
  }

  function parseObject(myIndent) {
    const obj = {};
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.indent < myIndent) break;
      if (t.indent > myIndent) {
        // Should be consumed by a recursive call — but if we get here it's
        // dangling. Skip defensively.
        i++;
        continue;
      }
      // t.indent === myIndent — consume key.
      const m = t.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
      if (!m) {
        // Could be a list item at this indent level; bail to caller.
        break;
      }
      const key = m[1];
      const inline = m[2];
      i++;
      if (inline === "" || inline === undefined) {
        // Look ahead for nested block.
        const child = parseBlock(myIndent);
        obj[key] = child ?? null;
      } else if (inline === "[]") {
        obj[key] = [];
      } else if (inline === "{}") {
        obj[key] = {};
      } else {
        obj[key] = parseScalar(inline);
      }
    }
    return obj;
  }

  function parseList(myIndent) {
    const arr = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.indent < myIndent) break;
      if (t.indent > myIndent) { i++; continue; }
      if (!t.content.startsWith("- ") && t.content !== "-") {
        // No more list items at this indent — break to caller.
        break;
      }
      const itemContent = t.content === "-" ? "" : t.content.slice(2).trim();
      i++;
      if (itemContent === "") {
        // Bare "- " — block-form item follows.
        const child = parseBlock(myIndent);
        arr.push(child ?? null);
      } else if (/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/.test(itemContent)) {
        // First key of an inline object: "- name: foo"
        // The remainder of the keys live at indent = myIndent + 2.
        const m = itemContent.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
        const obj = {};
        const key = m[1];
        const inline = m[2];
        if (inline === "" || inline === undefined) {
          // First key has block child.
          const child = parseBlock(myIndent + 2);
          obj[key] = child ?? null;
        } else if (inline === "[]") {
          obj[key] = [];
        } else if (inline === "{}") {
          obj[key] = {};
        } else {
          obj[key] = parseScalar(inline);
        }
        // Continue absorbing keys at indent = myIndent + 2.
        while (i < tokens.length && tokens[i].indent === myIndent + 2) {
          const tt = tokens[i];
          const mm = tt.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
          if (!mm) break;
          const k2 = mm[1];
          const v2 = mm[2];
          i++;
          if (v2 === "" || v2 === undefined) {
            const child = parseBlock(myIndent + 2);
            obj[k2] = child ?? null;
          } else if (v2 === "[]") {
            obj[k2] = [];
          } else if (v2 === "{}") {
            obj[k2] = {};
          } else {
            obj[k2] = parseScalar(v2);
          }
        }
        arr.push(obj);
      } else {
        arr.push(parseScalar(itemContent));
      }
    }
    return arr;
  }

  // Top-level can be either an object or a list; /fsi-onboard always emits an object.
  if (tokens.length === 0) return {};
  if (tokens[0].content.startsWith("- ")) {
    return parseList(tokens[0].indent);
  }
  return parseObject(tokens[0].indent);
}

function stripComment(line) {
  // Strip "# …" but only when not inside double quotes.
  let inQuote = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (ch === '"') inQuote = !inQuote;
    if (ch === "#" && !inQuote && (k === 0 || /\s/.test(line[k - 1]))) {
      return line.slice(0, k).trimEnd();
    }
  }
  return line;
}

function parseScalar(raw) {
  if (raw === "" || raw === "null" || raw === "~") return null;
  if (raw === "true")  return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw))     return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  if ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

// ────────────────── reuse computation ──────────────────
function computeReuse(canvas) {
  const reusedAtomic = (canvas.atomic_services_reused ?? []).length;
  const newAtomic    = (canvas.net_new_atomic_services ?? []).length;
  const totalAtomic  = reusedAtomic + newAtomic;
  const atomicPct    = totalAtomic === 0 ? 1.0 : reusedAtomic / totalAtomic;

  const reusedAgents = (canvas.agent_archetypes_reused ?? []).length;
  const newAgents    = (canvas.net_new_agents ?? []).length;
  const totalAgents  = reusedAgents + newAgents;
  const agentsPct    = totalAgents === 0 ? 1.0 : reusedAgents / totalAgents;

  const reusedRules  = (canvas.shared_rules_reused ?? []).length;
  const newRules     = (canvas.net_new_rules ?? []).length;
  const totalRules   = reusedRules + newRules;
  const rulesPct     = totalRules === 0 ? 1.0 : reusedRules / totalRules;

  const hitlCount    = (canvas.hitl_gates ?? []).filter(g => g !== "none").length;

  return {
    atomic: { reused: reusedAtomic, total: totalAtomic, pct: atomicPct },
    agents: { reused: reusedAgents, total: totalAgents, pct: agentsPct },
    rules:  { reused: reusedRules,  total: totalRules,  pct: rulesPct  },
    hitl:   { count: hitlCount },
  };
}

function pct(n) { return `${(n * 100).toFixed(0)}%`; }

function checkGate(canvas, metrics) {
  const failures = [];
  const warnings = [];

  if (metrics.atomic.pct < TARGETS.atomic.min) {
    failures.push(
      `atomic ${pct(metrics.atomic.pct)} < ${pct(TARGETS.atomic.min)} (target). ` +
      `${metrics.atomic.total - metrics.atomic.reused} net-new service(s); see net_new_atomic_services[].`
    );
  }
  if (metrics.agents.pct < TARGETS.agents.min) {
    failures.push(
      `agents ${pct(metrics.agents.pct)} < ${pct(TARGETS.agents.min)} (target). ` +
      `${metrics.agents.total - metrics.agents.reused} net-new agent(s); see net_new_agents[].`
    );
  }
  if (metrics.rules.total > 0 && metrics.rules.pct < TARGETS.rules.min) {
    warnings.push(`rules ${pct(metrics.rules.pct)} < ${pct(TARGETS.rules.min)} (warn-only target).`);
  }
  if (metrics.hitl.count > TARGETS.hitl.max) {
    warnings.push(
      `HITL gates ${metrics.hitl.count} > ${TARGETS.hitl.max} (cookbook practical max — every gate adds UX surface + Cloud SQL row + action bar).`
    );
  }

  const override = canvas.reuse_gate_override;
  const overridden = !!(override && override.approver && override.ticket && override.date);

  return { failures, warnings, overridden, override };
}

function render(canvas, metrics, result) {
  const lines = [];
  lines.push("");
  lines.push(`╔═══════════════════════════════════════════════════════════════╗`);
  lines.push(`║  Factory reuse-rate gate — ${(canvas.use_case_id ?? "<unknown>").padEnd(36)}║`);
  lines.push(`╚═══════════════════════════════════════════════════════════════╝`);
  lines.push("");
  const fmtRow = (lbl, m, target) => {
    const ok = m.pct >= target ? "✓" : "✗";
    return `  ${ok} ${lbl.padEnd(20)} ${pct(m.pct).padStart(4)}  (${m.reused}/${m.total})`;
  };
  lines.push(fmtRow("Atomic services",  metrics.atomic, TARGETS.atomic.min));
  lines.push(fmtRow("Agent archetypes", metrics.agents, TARGETS.agents.min));
  lines.push(fmtRow("Shared rules",     metrics.rules,  TARGETS.rules.min));
  lines.push(`  • ${"HITL gates".padEnd(20)} ${String(metrics.hitl.count).padStart(4)}  (target ≤ ${TARGETS.hitl.max})`);
  lines.push("");

  if (result.warnings.length) {
    lines.push("  Warnings:");
    for (const w of result.warnings) lines.push(`    ⚠  ${w}`);
    lines.push("");
  }

  if (result.failures.length) {
    lines.push("  Failures (BLOCKING):");
    for (const f of result.failures) lines.push(`    ✗  ${f}`);
    lines.push("");
    if (result.overridden) {
      lines.push(`  Override: approved by ${result.override.approver} on ${result.override.date}`);
      lines.push(`            ticket ${result.override.ticket}`);
      lines.push(`            (gate exits 0 due to override; /review-uc verifies ticket exists)`);
      lines.push("");
    } else {
      lines.push(`  Next:`);
      lines.push(`    1. Revisit Round 4 / Round 5 of /fsi-onboard and consolidate net-new shapes.`);
      lines.push(`    2. Or run /fsi-promote-to-library to grow the library so the same shape is reusable next UC.`);
      lines.push(`    3. Or get arch-review approval and add reuse_gate_override block to onboarding.yaml.`);
      lines.push("");
    }
  } else {
    lines.push("  All hard gates green.");
    lines.push("");
  }

  return lines.join("\n");
}

// ────────────────── main ──────────────────
const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/check_reuse_rate.mjs <onboarding.yaml>");
  process.exit(2);
}

const path = resolve(argv[0]);
if (!existsSync(path)) {
  console.error(`canvas file not found: ${path}`);
  process.exit(2);
}

let canvas;
try {
  canvas = loadYaml(readFileSync(path, "utf-8"));
} catch (e) {
  console.error(`yaml parse failed: ${e.message}`);
  process.exit(2);
}

const metrics = computeReuse(canvas);
const result  = checkGate(canvas, metrics);
console.log(render(canvas, metrics, result));

const summary = {
  use_case_id:   canvas.use_case_id,
  atomic_pct:    metrics.atomic.pct,
  agents_pct:    metrics.agents.pct,
  rules_pct:     metrics.rules.pct,
  hitl_count:    metrics.hitl.count,
  gate_passed:   result.failures.length === 0 || result.overridden,
  gate_failures: result.failures,
  warnings:      result.warnings,
  overridden:    !!result.overridden,
};
console.error(JSON.stringify(summary));

if (result.failures.length > 0 && !result.overridden) {
  process.exit(1);
}
process.exit(0);
