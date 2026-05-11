#!/usr/bin/env node
// scripts/build_meta_comparator.mjs
//
// Renders a single HTML page that puts multiple design-proposal runs of
// the same use case side-by-side. Used for:
//
//   - Tier 3 (variance): 3 runs of the same canvas; eyeball whether
//     same-axis options are consistent across runs and whether different
//     axes within a run are reliably distinct.
//
//   - Tier 4 (trial): after a fresh test run, compare against the
//     baseline run to see what changed.
//
//   - Cross-UC comparison: see how the same axes manifest in different
//     consoles (pipeline vs. investigations vs. real-time).
//
// Inputs come from archives/design-tests/<run-id>/. Each run-id directory
// has:
//
//   meta.yaml         — { use_case_id, canvas_sha256, tier, generated_at }
//   judge-report.json — Phase 0.1 output
//   option-A/ ... option-D/ — full option trees with manifest.yaml
//
// Usage:
//   node scripts/build_meta_comparator.mjs <run-id-1> [<run-id-2> ...]
//
//   # Convenience: --uc <uc> picks the most recent N runs for one UC
//   node scripts/build_meta_comparator.mjs --uc credit-memo-commercial --last 3
//
// Output:
//   archives/design-tests/_meta/<timestamp>/_meta_review.html
//
// Same forever-archive semantics as archives/design/.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ────────────────── tiny YAML loader (same shape as other scripts) ──
function loadYaml(text) {
  const raw = text.split(/\r?\n/).map(stripComment).filter(l => l.trim() !== "");
  const tokens = raw.map(l => ({ indent: l.match(/^\s*/)[0].length, content: l.trim() }));
  let i = 0;
  function parseBlock(p) { if (i >= tokens.length) return null; const f = tokens[i]; if (f.indent <= p) return null; if (f.content.startsWith("- ") || f.content === "-") return parseList(f.indent); return parseObject(f.indent); }
  function parseObject(my) { const o = {}; while (i < tokens.length) { const t = tokens[i]; if (t.indent < my) break; if (t.indent > my) { i++; continue; } const m = t.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/); if (!m) break; const k = m[1], v = m[2]; i++; if (!v) o[k] = parseBlock(my) ?? null; else if (v === "[]") o[k] = []; else if (v === "{}") o[k] = {}; else o[k] = parseScalar(v); } return o; }
  function parseList(my) { const a = []; while (i < tokens.length) { const t = tokens[i]; if (t.indent < my) break; if (t.indent > my) { i++; continue; } if (!t.content.startsWith("- ") && t.content !== "-") break; const ic = t.content === "-" ? "" : t.content.slice(2).trim(); i++; if (!ic) a.push(parseBlock(my) ?? null); else if (/^[A-Za-z_$][\w-]*\s*:/.test(ic)) { const m = ic.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/); const o = {}; const k = m[1], v = m[2]; if (!v) o[k] = parseBlock(my + 2) ?? null; else if (v === "[]") o[k] = []; else if (v === "{}") o[k] = {}; else o[k] = parseScalar(v); while (i < tokens.length && tokens[i].indent === my + 2) { const tt = tokens[i]; const mm = tt.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/); if (!mm) break; const k2 = mm[1], v2 = mm[2]; i++; if (!v2) o[k2] = parseBlock(my + 2) ?? null; else if (v2 === "[]") o[k2] = []; else if (v2 === "{}") o[k2] = {}; else o[k2] = parseScalar(v2); } a.push(o); } else a.push(parseScalar(ic)); } return a; }
  if (!tokens.length) return {};
  return tokens[0].content.startsWith("- ") ? parseList(tokens[0].indent) : parseObject(tokens[0].indent);
}
function stripComment(line) { let inQ = false; for (let k = 0; k < line.length; k++) { if (line[k] === '"') inQ = !inQ; if (line[k] === "#" && !inQ && (k === 0 || /\s/.test(line[k - 1]))) return line.slice(0, k).trimEnd(); } return line; }
function parseScalar(raw) { if (raw === "" || raw === "null" || raw === "~") return null; if (raw === "true") return true; if (raw === "false") return false; if (/^-?\d+$/.test(raw)) return parseInt(raw, 10); if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw); if ((raw[0] === '"' && raw.endsWith('"')) || (raw[0] === "'" && raw.endsWith("'"))) return raw.slice(1, -1); return raw; }

function htmlEscape(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function loadRun(runId) {
  const dir = join(REPO, "archives", "design-tests", runId);
  if (!existsSync(dir)) {
    return { runId, ok: false, error: `not found: ${dir}` };
  }
  let meta = {};
  if (existsSync(join(dir, "meta.yaml"))) {
    try { meta = loadYaml(readFileSync(join(dir, "meta.yaml"), "utf-8")); } catch { /* ignore */ }
  }
  let judge = null;
  if (existsSync(join(dir, "judge-report.json"))) {
    try { judge = JSON.parse(readFileSync(join(dir, "judge-report.json"), "utf-8")); } catch { /* ignore */ }
  }
  const options = {};
  for (const opt of ["a", "b", "c", "d", "e", "f"]) {
    const optDir = join(dir, `option-${opt}`);
    if (!existsSync(optDir)) continue;
    const mfPath = join(optDir, "manifest.yaml");
    let manifest = {};
    if (existsSync(mfPath)) {
      try { manifest = loadYaml(readFileSync(mfPath, "utf-8")); } catch { /* ignore */ }
    }
    const urlPath = join(optDir, "url.txt");
    const url = existsSync(urlPath) ? readFileSync(urlPath, "utf-8").trim() : null;
    options[opt] = { manifest, url };
  }
  return { runId, ok: true, dir, meta, judge, options };
}

function jaccard(a, b) {
  const A = new Set(a ?? []);
  const B = new Set(b ?? []);
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 1.0 : inter / union;
}

function compNames(manifest) {
  return (manifest.components_used ?? []).map(c => c?.name).filter(Boolean);
}

function meanStd(xs) {
  if (!xs.length) return { mean: 0, std: 0 };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return { mean, std: Math.sqrt(variance) };
}

// ────────────────── CLI parsing ──────────────────
const argv = process.argv.slice(2);
let runIds = [];

if (argv[0] === "--uc") {
  const uc = argv[1];
  let n = 3;
  const lastIdx = argv.indexOf("--last");
  if (lastIdx !== -1) n = parseInt(argv[lastIdx + 1] ?? "3", 10);
  // Discover the N most recent test runs for this UC by walking the dir
  const root = join(REPO, "archives", "design-tests");
  if (!existsSync(root)) {
    console.error(`no archives/design-tests/ yet — run /fsi-design-proposals first`);
    process.exit(1);
  }
  const candidates = readdirSync(root)
    .filter(d => d !== "_meta" && d !== "README.md" && !d.startsWith("."))
    .map(d => {
      const m = loadRun(d);
      return m.ok && m.meta?.use_case_id === uc ? { runId: d, mtime: statSync(join(root, d)).mtime.getTime() } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n);
  runIds = candidates.map(c => c.runId);
  if (runIds.length === 0) {
    console.error(`no test runs found for use case "${uc}"`);
    process.exit(1);
  }
} else {
  runIds = argv.filter(a => !a.startsWith("--"));
}

if (runIds.length < 2) {
  console.error("usage: build_meta_comparator.mjs <run-id-1> <run-id-2> [<run-id-3> …]");
  console.error("   or: build_meta_comparator.mjs --uc <use-case> [--last N]   (default N=3)");
  process.exit(2);
}

const runs = runIds.map(loadRun);
const goodRuns = runs.filter(r => r.ok);
if (goodRuns.length < 2) {
  console.error("need at least 2 readable runs; got:");
  runs.forEach(r => console.error(`  ${r.runId}: ${r.ok ? "ok" : r.error}`));
  process.exit(1);
}

// ────────────────── cross-run analysis ──────────────────
// Two questions:
//   1. CONVERGENCE within a run — pairwise Jaccard across A/B/C/D (the
//      in-run divergence the skill already tracks).
//   2. CONSISTENCY across runs — for each variation axis (density,
//      metaphor, affordance, wildcard), how similar are the options
//      across runs? Same-axis-across-runs should be similar; cross-axis
//      should be distinct.

const axes = ["density", "metaphor", "affordance", "wildcard"];

// Index: optionByRunAndAxis[runId][axis] = { option, manifest }
const optionByRunAndAxis = {};
for (const r of goodRuns) {
  optionByRunAndAxis[r.runId] = {};
  for (const [opt, data] of Object.entries(r.options)) {
    const axis = data.manifest.variation_axis;
    if (axes.includes(axis)) {
      optionByRunAndAxis[r.runId][axis] = { option: opt, ...data };
    }
  }
}

const axisConsistency = {};
for (const axis of axes) {
  const compsByRun = goodRuns
    .map(r => optionByRunAndAxis[r.runId]?.[axis] ? compNames(optionByRunAndAxis[r.runId][axis].manifest) : null)
    .filter(Boolean);
  if (compsByRun.length < 2) continue;
  const pairs = [];
  for (let i = 0; i < compsByRun.length; i++) {
    for (let j = i + 1; j < compsByRun.length; j++) {
      pairs.push(jaccard(compsByRun[i], compsByRun[j]));
    }
  }
  axisConsistency[axis] = meanStd(pairs);
}

// Cross-axis-within-run divergence (averaged across runs)
const crossAxisDivergence = [];
for (const r of goodRuns) {
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const a = optionByRunAndAxis[r.runId]?.[axes[i]];
      const b = optionByRunAndAxis[r.runId]?.[axes[j]];
      if (a && b) {
        crossAxisDivergence.push(jaccard(compNames(a.manifest), compNames(b.manifest)));
      }
    }
  }
}
const crossAxisStat = meanStd(crossAxisDivergence);

// Judge score variance per axis (does the judge consistently score the
// same axis at the same level?)
const judgeByAxis = {};
for (const axis of axes) {
  const scores = goodRuns
    .map(r => optionByRunAndAxis[r.runId]?.[axis]?.manifest?.judge?.composite_score)
    .filter(s => typeof s === "number");
  if (scores.length >= 2) judgeByAxis[axis] = meanStd(scores);
}

// ────────────────── render ──────────────────
function scoreClass(s) { return s == null ? "" : (s >= 4 ? "high" : s >= 3 ? "mid" : "low"); }
function densityStars(n) { const x = Math.max(1, Math.min(5, parseInt(n ?? 3, 10))); return "★".repeat(x) + "☆".repeat(5 - x); }

function renderCell(run, axis) {
  const data = optionByRunAndAxis[run.runId]?.[axis];
  if (!data) {
    return `<td class="cell missing"><div class="missing-badge">axis missing</div></td>`;
  }
  const m = data.manifest;
  const j = m.judge ?? {};
  const a11y = m.build?.a11y_violations;
  const reuseOk = m.build?.reuse_floor_met !== false;
  const reuseCount = m.build?.reuse_count_shared ?? compNames(m).length;
  const failed = !reuseOk || m.build?.build_succeeded === false;
  return `
    <td class="cell ${failed ? "failed" : ""}">
      <div class="cell-head">
        <span class="opt-letter">${(data.option ?? "?").toUpperCase()}</span>
        <span class="cell-axis">${htmlEscape(axis)}</span>
        ${j.recommended ? '<span class="judge-pick">★ pick</span>' : ""}
      </div>
      <div class="cell-summary">${htmlEscape((m.design_summary ?? "").slice(0, 220))}</div>
      <div class="cell-stats">
        ${j.composite_score != null ? `<span class="stat ${scoreClass(j.composite_score)}">judge ${j.composite_score.toFixed(1)}</span>` : ""}
        ${typeof a11y === "number" ? `<span class="stat ${a11y > 5 ? "warn" : "ok"}">a11y ${a11y}</span>` : ""}
        ${reuseOk ? `<span class="stat ok">reuse ${reuseCount}</span>` : `<span class="stat err">reuse ${reuseCount} ✗</span>`}
        <span class="stat dim">density ${densityStars(m.density_score)}</span>
      </div>
      ${data.url ? `<a class="cell-link" href="${htmlEscape(data.url)}" target="_blank" rel="noopener">↗ open</a>` : ""}
    </td>
  `;
}

function renderHeader() {
  return `<thead>
    <tr>
      <th class="row-head">run</th>
      ${axes.map(a => `<th>${htmlEscape(a)}</th>`).join("")}
    </tr>
  </thead>`;
}

function renderBody() {
  return `<tbody>
    ${goodRuns.map(r => `
      <tr>
        <th class="row-head">
          <div class="run-id">${htmlEscape(r.runId.slice(0, 24))}…</div>
          <div class="run-meta">${htmlEscape(r.meta?.tier ?? "")} ${htmlEscape(r.meta?.use_case_id ?? "")}</div>
        </th>
        ${axes.map(a => renderCell(r, a)).join("")}
      </tr>
    `).join("")}
  </tbody>`;
}

function renderStatsStrip() {
  const lines = [];
  for (const axis of axes) {
    const c = axisConsistency[axis];
    if (!c) continue;
    const j = judgeByAxis[axis];
    const consistencyLabel = c.mean >= 0.5 ? "consistent" : c.mean >= 0.3 ? "drifting" : "chaotic";
    const consistencyClass = c.mean >= 0.5 ? "ok" : c.mean >= 0.3 ? "warn" : "err";
    lines.push(`
      <div class="axis-stat">
        <div class="axis-name">${htmlEscape(axis)}</div>
        <div class="axis-row">
          <span class="stat ${consistencyClass}">same-axis ${c.mean.toFixed(2)}</span>
          <span class="stat dim">σ ${c.std.toFixed(2)}</span>
          <span class="stat dim">${consistencyLabel}</span>
        </div>
        ${j ? `<div class="axis-row"><span class="stat ${scoreClass(j.mean)}">judge μ ${j.mean.toFixed(1)}</span><span class="stat dim">σ ${j.std.toFixed(2)}</span></div>` : ""}
      </div>
    `);
  }
  const crossLabel = crossAxisStat.mean <= 0.4 ? "distinct" : crossAxisStat.mean <= 0.6 ? "fuzzy" : "converging";
  const crossClass = crossAxisStat.mean <= 0.4 ? "ok" : crossAxisStat.mean <= 0.6 ? "warn" : "err";
  return `
    <section class="stats">
      <div class="stats-row">
        ${lines.join("")}
      </div>
      <div class="cross-axis">
        <span class="cross-label">cross-axis within-run divergence:</span>
        <span class="stat ${crossClass}">${crossAxisStat.mean.toFixed(2)}</span>
        <span class="stat dim">σ ${crossAxisStat.std.toFixed(2)}</span>
        <span class="stat dim">${crossLabel}</span>
        <span class="legend">(lower = more distinct = good)</span>
      </div>
    </section>
  `;
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Meta-comparator · ${goodRuns.length} runs · ${goodRuns[0].meta?.use_case_id ?? ""}</title>
  <style>
    :root {
      --bg: #0b0d10; --panel: #15181c; --panel-2: #1c2026; --border: #2a2f37;
      --text: #e6e9ee; --text-dim: #98a0aa; --accent: #4f8cff;
      --warn: #ffaa44; --err: #ff5577; --ok: #44dd99;
      --mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html, body { background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; margin: 0; }
    .header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .header h1 { font-size: 17px; margin: 0; font-weight: 600; }
    .header .sub { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
    .stats { padding: 16px 24px; background: var(--panel); border-bottom: 1px solid var(--border); }
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .axis-stat { background: var(--panel-2); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); }
    .axis-name { font-size: 11px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.05em; margin-bottom: 6px; font-family: var(--mono); }
    .axis-row { display: flex; gap: 6px; margin-bottom: 3px; flex-wrap: wrap; }
    .cross-axis { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .cross-label { font-size: 12px; color: var(--text-dim); }
    .legend { font-size: 11px; color: var(--text-dim); font-style: italic; }
    table { width: 100%; border-collapse: collapse; background: var(--bg); }
    th, td { border: 1px solid var(--border); padding: 10px 12px; vertical-align: top; text-align: left; }
    th { background: var(--panel); font-size: 12px; font-weight: 600; }
    .row-head { width: 180px; background: var(--panel); }
    .run-id { font-family: var(--mono); font-size: 11px; color: var(--text); }
    .run-meta { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
    .cell { background: var(--panel); min-width: 240px; max-width: 320px; position: relative; }
    .cell.failed { background: rgba(255, 85, 119, 0.08); }
    .cell.missing { background: var(--panel-2); color: var(--text-dim); text-align: center; font-style: italic; font-size: 12px; }
    .missing-badge { padding: 8px; }
    .cell-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .opt-letter { font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--accent); }
    .cell-axis { font-size: 10px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.05em; }
    .judge-pick { background: var(--ok); color: #001; padding: 1px 6px; border-radius: 99px; font-size: 9px; font-weight: 700; }
    .cell-summary { font-size: 11px; line-height: 1.4; color: var(--text); margin-bottom: 8px; max-height: 4.2em; overflow: hidden; }
    .cell-stats { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
    .stat { padding: 1px 6px; border-radius: 99px; font-size: 10px; font-family: var(--mono); border: 1px solid var(--border); color: var(--text); }
    .stat.high, .stat.ok { color: var(--ok); border-color: var(--ok); }
    .stat.mid, .stat.warn { color: var(--warn); border-color: var(--warn); }
    .stat.low, .stat.err { color: var(--err); border-color: var(--err); }
    .stat.dim { color: var(--text-dim); }
    .cell-link { font-size: 10px; color: var(--accent); text-decoration: none; font-family: var(--mono); }
    .cell-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Meta-comparator</h1>
    <div class="sub">${goodRuns.length} runs · ${htmlEscape(goodRuns[0].meta?.use_case_id ?? "—")}</div>
  </div>
  ${renderStatsStrip()}
  <table>
    ${renderHeader()}
    ${renderBody()}
  </table>
</body>
</html>
`;

// Output directory — under archives/design-tests/_meta/<timestamp>/
const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const outDir = join(REPO, "archives", "design-tests", "_meta", ts);
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "_meta_review.html");
writeFileSync(out, html);

// Also write the analysis as JSON for downstream consumers
writeFileSync(join(outDir, "analysis.json"), JSON.stringify({
  runs: goodRuns.map(r => r.runId),
  use_case_id: goodRuns[0].meta?.use_case_id,
  axis_consistency: axisConsistency,
  cross_axis_divergence: crossAxisStat,
  judge_by_axis: judgeByAxis,
}, null, 2));

console.log(`✓ wrote ${out}`);
console.log(`  file://${out}`);
console.log("");
console.log(`runs analysed:`);
for (const r of goodRuns) console.log(`  • ${r.runId}`);
console.log("");
console.log("same-axis consistency (higher = more consistent across runs; threshold ≥0.5):");
for (const axis of axes) {
  if (axisConsistency[axis]) {
    const c = axisConsistency[axis];
    const label = c.mean >= 0.5 ? "✓ consistent" : c.mean >= 0.3 ? "⚠ drifting" : "✗ chaotic";
    console.log(`  ${axis.padEnd(12)} μ ${c.mean.toFixed(2)}  σ ${c.std.toFixed(2)}  ${label}`);
  }
}
console.log("");
console.log(`cross-axis within-run divergence: μ ${crossAxisStat.mean.toFixed(2)}  σ ${crossAxisStat.std.toFixed(2)}`);
console.log(`  ${crossAxisStat.mean <= 0.4 ? "✓ distinct (good)" : crossAxisStat.mean <= 0.6 ? "⚠ fuzzy" : "✗ converging (bad)"}`);
