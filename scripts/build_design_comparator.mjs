#!/usr/bin/env node
// scripts/build_design_comparator.mjs
//
// Renders usecases/<uc>/ui/proposals/_review.html — the side-by-side
// comparator the user opens locally to evaluate the 4 design options.
//
// Reads each option's manifest.yaml, hero_screenshot, rationale.md,
// tradeoffs.md, and ephemeral URL (from .fsi-state/<uc>/proposals/<x>.url),
// and emits a single self-contained HTML page with:
//
//   - 2x2 iframe grid of the deployed options (click-through real)
//   - per-option scoring strip (density, motion, affordance, metaphor)
//   - per-option rationale + tradeoffs side-by-side
//   - per-option components-used table (reuse evidence)
//   - one-click "open standalone" link per option for full-screen review
//   - failure banners for options that didn't build or deploy
//
// Self-contained: vanilla HTML + inline CSS + zero runtime deps. Safe to
// open from file:// (relevant for offline review on a plane).
//
// Usage:
//   node scripts/build_design_comparator.mjs <use_case>

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ────────────────── tiny YAML loader (same shape as other scripts) ──
function loadYaml(text) {
  const raw = text.split(/\r?\n/).map(stripComment).filter(l => l.trim() !== "");
  const tokens = raw.map(l => ({ indent: l.match(/^\s*/)[0].length, content: l.trim() }));
  let i = 0;
  function parseBlock(p) { if (i >= tokens.length) return null; const f = tokens[i]; if (f.indent <= p) return null; if (f.content.startsWith("- ") || f.content === "-") return parseList(f.indent); return parseObject(f.indent); }
  // Collect a YAML block scalar (literal `|` or folded `>`) — the lines deeper than `parentIndent`
  // form the scalar body. Returns the joined string and advances `i` past them.
  function parseBlockScalar(parentIndent, style) {
    const lines = [];
    while (i < tokens.length && tokens[i].indent > parentIndent) {
      lines.push(tokens[i].content);
      i++;
    }
    if (style === ">") return lines.join(" ");      // folded
    return lines.join("\n");                         // literal `|`
  }
  function parseObject(my) {
    const o = {};
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.indent < my) break;
      if (t.indent > my) { i++; continue; }
      const m = t.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/);
      if (!m) break;
      const k = m[1], v = m[2];
      i++;
      if (v === "|" || v === ">") {
        // YAML block scalar — collect deeper-indented lines as the value
        o[k] = parseBlockScalar(my, v);
      } else if (!v) {
        o[k] = parseBlock(my) ?? null;
      } else if (v === "[]") o[k] = [];
      else if (v === "{}") o[k] = {};
      else o[k] = parseScalar(v);
    }
    return o;
  }
  function parseList(my) { const a = []; while (i < tokens.length) { const t = tokens[i]; if (t.indent < my) break; if (t.indent > my) { i++; continue; } if (!t.content.startsWith("- ") && t.content !== "-") break; const ic = t.content === "-" ? "" : t.content.slice(2).trim(); i++; if (!ic) a.push(parseBlock(my) ?? null); else if (/^[A-Za-z_$][\w-]*\s*:/.test(ic)) { const m = ic.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/); const o = {}; const k = m[1], v = m[2]; if (!v) o[k] = parseBlock(my + 2) ?? null; else if (v === "[]") o[k] = []; else if (v === "{}") o[k] = {}; else o[k] = parseScalar(v); while (i < tokens.length && tokens[i].indent === my + 2) { const tt = tokens[i]; const mm = tt.content.match(/^([A-Za-z_$][\w-]*)\s*:\s*(.*)$/); if (!mm) break; const k2 = mm[1], v2 = mm[2]; i++; if (!v2) o[k2] = parseBlock(my + 2) ?? null; else if (v2 === "[]") o[k2] = []; else if (v2 === "{}") o[k2] = {}; else o[k2] = parseScalar(v2); } a.push(o); } else a.push(parseScalar(ic)); } return a; }
  if (!tokens.length) return {};
  return tokens[0].content.startsWith("- ") ? parseList(tokens[0].indent) : parseObject(tokens[0].indent);
}
function stripComment(line) { let inQ = false; for (let k = 0; k < line.length; k++) { if (line[k] === '"') inQ = !inQ; if (line[k] === "#" && !inQ && (k === 0 || /\s/.test(line[k - 1]))) return line.slice(0, k).trimEnd(); } return line; }
function parseScalar(raw) { if (raw === "" || raw === "null" || raw === "~") return null; if (raw === "true") return true; if (raw === "false") return false; if (/^-?\d+$/.test(raw)) return parseInt(raw, 10); if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw); if ((raw[0] === '"' && raw.endsWith('"')) || (raw[0] === "'" && raw.endsWith("'"))) return raw.slice(1, -1); return raw; }

function htmlEscape(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function readMaybe(p) {
  try { return existsSync(p) ? readFileSync(p, "utf-8") : ""; } catch { return ""; }
}

function densityStars(score) {
  const n = Math.max(1, Math.min(5, parseInt(score ?? 3, 10)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function loadOption(uc, option) {
  const dir = join(REPO, "usecases", uc, "ui", "proposals", `option-${option}`);
  if (!existsSync(dir)) return null;
  const mfPath = join(dir, "manifest.yaml");
  const manifest = existsSync(mfPath) ? loadYaml(readFileSync(mfPath, "utf-8")) : {};
  const rationale = readMaybe(join(dir, "rationale.md"));
  const tradeoffs = readMaybe(join(dir, "tradeoffs.md"));
  const urlFile = join(REPO, ".fsi-state", uc, "proposals", `${option}.url`);
  const url = readMaybe(urlFile).trim();
  const heroScreenshot = manifest.hero_screenshot
    ? join("usecases", uc, "ui", "proposals", `option-${option}`, manifest.hero_screenshot)
    : null;
  // Playwright report — written by scripts/validate_with_playwright.mjs into
  // either the proposals dir (for live comparator) or the archive (for trail).
  // Comparator looks in both locations and prefers the proposals copy when
  // both exist (it's the most recent).
  let playwright = null;
  let playwrightScreenshot = null;
  for (const candidate of [
    join(dir, "playwright-report.json"),
    join(REPO, "archives/design-tests", "_latest", `option-${option}`, "playwright-report.json"),
  ]) {
    if (existsSync(candidate)) {
      try {
        playwright = JSON.parse(readFileSync(candidate, "utf-8"));
        const screenshotsDir = join(dirname(candidate), "screenshots");
        const heroPath = join(screenshotsDir, "case-id-sample-1440.png");
        if (existsSync(heroPath)) {
          // Render as relative path from the comparator HTML location
          const reviewHtmlDir = join(REPO, "usecases", uc, "ui", "proposals");
          // Compute relative path manually (no path.relative for safety)
          playwrightScreenshot = heroPath.startsWith(reviewHtmlDir)
            ? heroPath.slice(reviewHtmlDir.length + 1)
            : heroPath;
        }
        break;
      } catch { /* try next */ }
    }
  }
  return { option, dir, manifest, rationale, tradeoffs, url, heroScreenshot, playwright, playwrightScreenshot };
}

const HTML_HEADER = (uc, sha) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Design proposals · ${htmlEscape(uc)}</title>
  <style>
    :root {
      --bg: #0b0d10;
      --panel: #15181c;
      --panel-2: #1c2026;
      --border: #2a2f37;
      --text: #e6e9ee;
      --text-dim: #98a0aa;
      --accent: #4f8cff;
      --warn: #ffaa44;
      --error: #ff5577;
      --ok: #44dd99;
      --mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html, body { background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; margin: 0; }
    a { color: var(--accent); }
    .header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .header h1 { font-size: 16px; margin: 0; font-weight: 600; }
    .header .sha { font-family: var(--mono); font-size: 12px; color: var(--text-dim); }
    .toolbar { display: flex; gap: 8px; }
    .toolbar button { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .toolbar button:hover { background: var(--border); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 1px; background: var(--border); height: calc(100vh - 65px); }
    .panel { background: var(--panel); display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    .panel-head { padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .panel-head h2 { margin: 0; font-size: 13px; font-weight: 600; }
    .panel-head .axis { font-family: var(--mono); font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
    .panel-head .open { font-size: 11px; }
    /* Panel content area — dark by default; only the iframe + screenshot get a white background. */
    .panel-iframe { flex: 1 1 auto; background: var(--bg); min-height: 0; }
    .panel-iframe iframe { width: 100%; height: 100%; border: 0; background: white; }
    .panel-iframe .hero-screenshot { width: 100%; height: auto; max-height: 100%; object-fit: contain; object-position: top; display: block; background: #fff; }
    .panel-failed { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; padding: 24px; color: var(--text-dim); outline-offset: -2px; }
    /* Higher-contrast error badge so axe-core / WCAG 2.1 contrast rule is satisfied (4.5+:1). */
    .panel-failed .badge { background: rgba(255, 85, 119, 0.18); color: #ffb3c1; font-weight: 600; padding: 4px 10px; border-radius: 99px; border: 1px solid var(--error); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    /* Static-review empty state — turns the dead iframe area into a useful evaluation surface. */
    .static-review { flex: 1; display: flex; flex-direction: column; padding: 24px 28px; gap: 12px; min-height: 0; overflow-y: auto; outline-offset: -2px; }
    .static-review-label { font-family: var(--mono); font-size: 10px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.08em; }
    .static-review-body { color: var(--text); line-height: 1.55; font-size: 13px; white-space: pre-wrap; }
    .static-review-footer { font-family: var(--mono); font-size: 10px; color: var(--text-dim); border-top: 1px dashed var(--border); padding-top: 8px; margin-top: auto; }
    .static-review-footer code { background: var(--panel-2); padding: 2px 5px; border-radius: 3px; }
    .panel-summary { padding: 8px 14px; border-top: 1px solid var(--border); font-size: 12px; line-height: 1.45; max-height: 30%; overflow-y: auto; outline-offset: -2px; }
    .panel-summary:focus-visible { outline: 2px solid var(--accent); }
    .panel-summary .strip { display: flex; gap: 12px; color: var(--text-dim); margin-bottom: 6px; flex-wrap: wrap; }
    .panel-summary .strip span { white-space: nowrap; }
    .panel-summary p { margin: 4px 0; color: var(--text); }
    .panel-summary .pillrow { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 99px; background: var(--panel-2); border: 1px solid var(--border); font-family: var(--mono); font-size: 10px; color: var(--text-dim); text-transform: uppercase; }
    .pill.warn { color: var(--warn); border-color: var(--warn); }
    .pill.ok { color: var(--ok); border-color: var(--ok); }
    .judge-row { display: flex; gap: 10px; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); }
    .judge-score { font-family: var(--mono); font-size: 11px; }
    .judge-score.high { color: var(--ok); }
    .judge-score.mid  { color: var(--warn); }
    .judge-score.low  { color: var(--error); }
    .judge-badge { background: var(--ok); color: #001; padding: 1px 6px; border-radius: 99px; font-size: 10px; font-weight: 600; }
    .judge-violations { color: var(--error); font-size: 10px; }
    .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: none; align-items: stretch; }
    .modal.open { display: flex; }
    .modal iframe { flex: 1; border: 0; }
    .modal .close { position: absolute; top: 16px; right: 16px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: 4px; cursor: pointer; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; grid-template-rows: repeat(4, 50vh); } }
  </style>
</head>
<body>`;

function renderPanel(opt) {
  if (!opt) return `<section class="panel"><div class="panel-failed"><div class="badge">option missing</div></div></section>`;

  const { option, manifest, rationale, tradeoffs, url, playwright, playwrightScreenshot } = opt;
  const axis = manifest.variation_axis ?? "—";
  const persona = manifest.persona?.primary ?? "—";
  const density = densityStars(manifest.density_score);
  const motion = manifest.motion_budget ?? "—";
  const affordance = manifest.affordance_pattern ?? "—";
  const metaphor = manifest.primary_metaphor ?? "—";

  // Build status defaults — treat undefined as "not deployed yet" rather than "build failed".
  // Only the explicit `false` flips us into a hard-failed panel.
  const buildExplicitlyFailed = manifest.build?.build_succeeded === false;
  const components = manifest.components_used ?? [];
  const reuseCount = components.filter(c => c?.source === "shared" || c?.source === "use-case").length;
  const netNewCount = components.filter(c => c?.source === "net-new").length;

  // Reuse-floor hard gate (Phase 0.3): explicit false ⇒ hard fail.
  const reuseFloorFailed = manifest.build?.reuse_floor_met === false;
  const reuseFloorShared = manifest.build?.reuse_count_shared;

  // Excerpt of rationale.md for the "static review" empty state.
  const rationaleExcerpt = (rationale ?? "").trim().split(/\n+/).slice(0, 8).join("\n").slice(0, 480);

  let body;
  if (reuseFloorFailed) {
    body = `<div class="panel-failed" tabindex="0"><div class="badge">reuse floor failed</div><div>${reuseFloorShared ?? "?"} shared components; floor is 5</div></div>`;
  } else if (buildExplicitlyFailed) {
    body = `<div class="panel-failed" tabindex="0"><div class="badge">build failed</div><div>tsc / Docker error — see option dir</div></div>`;
  } else if (url) {
    body = `<iframe src="${htmlEscape(url)}" loading="lazy" referrerpolicy="no-referrer" title="Option ${option.toUpperCase()} — ${htmlEscape(axis)} variant deployed at ${htmlEscape(url)}"></iframe>`;
  } else if (playwrightScreenshot) {
    body = `<img class="hero-screenshot" src="${htmlEscape(playwrightScreenshot)}" alt="Playwright capture of option ${option.toUpperCase()} case detail at 1440px" />`;
  } else {
    // Static-review empty state: show design intent inline rather than a giant "not deployed" blob.
    // This is what an evaluator sees when picking before any deploy/Playwright run.
    body = `
      <div class="static-review" tabindex="0">
        <div class="static-review-label">static review · no deploy yet</div>
        <div class="static-review-body">${htmlEscape(rationaleExcerpt) || htmlEscape(manifest.design_summary ?? "")}</div>
        <div class="static-review-footer">Source: <code>usecases/&lt;uc&gt;/ui/proposals/option-${option}/</code></div>
      </div>`;
  }

  const summary = (manifest.design_summary ?? "").slice(0, 600);
  const optimisedFor = (manifest.tradeoffs?.optimised_for ?? []).slice(0, 4);
  const sacrifices = (manifest.tradeoffs?.sacrifices ?? []).slice(0, 4);

  // Judge row — populated when Stage 2.5 ran.
  const j = manifest.judge ?? null;
  const scoreClass = (s) => s == null ? "" : (s >= 4 ? "high" : s >= 3 ? "mid" : "low");
  const judgeRow = j ? `
    <div class="judge-row">
      ${j.recommended ? '<span class="judge-badge">judge pick</span>' : ""}
      <span class="judge-score ${scoreClass(j.composite_score)}">composite ${j.composite_score?.toFixed(1) ?? "—"}/5</span>
      <span class="judge-score ${scoreClass(j.ui_standards)}">ui-std ${j.ui_standards?.toFixed(1) ?? "—"}</span>
      <span class="judge-score ${scoreClass(j.agentic_principles)}">principles ${j.agentic_principles?.toFixed(1) ?? "—"}</span>
      ${j.reuse_floor_met ? '<span class="pill ok">reuse ≥5</span>' : '<span class="pill warn">reuse &lt;5</span>'}
      ${j.hitl_gates_wired ? '<span class="pill ok">HITL wired</span>' : '<span class="pill warn">HITL gap</span>'}
      ${j.violations?.length ? `<span class="judge-violations">${j.violations.length} violation${j.violations.length === 1 ? "" : "s"}</span>` : ""}
    </div>` : "";

  // a11y row — populated when Stage 3.5 ran.
  const a11yCount = manifest.build?.a11y_violations;
  const a11yMode = manifest.build?.a11y_scan_mode;
  const a11yRow = (a11yCount != null) ? `
    <div class="judge-row">
      ${a11yCount > 5
        ? `<span class="pill warn">a11y ${a11yCount} ⚠</span>`
        : `<span class="pill ok">a11y ${a11yCount}</span>`}
      <span class="judge-score">${htmlEscape(a11yMode ?? "scan")}</span>
    </div>` : "";

  // Playwright row — populated when validate_with_playwright.mjs has run.
  const pw = playwright?.summary;
  const pwRow = pw ? `
    <div class="judge-row">
      ${pw.total_a11y_violations > 5 ? `<span class="pill warn">live-a11y ${pw.total_a11y_violations} ⚠</span>` : `<span class="pill ok">live-a11y ${pw.total_a11y_violations}</span>`}
      ${pw.total_console_errors > 0 ? `<span class="pill warn">console ${pw.total_console_errors} ⚠</span>` : `<span class="pill ok">console 0</span>`}
      ${typeof pw.cls_worst === "number" ? `<span class="pill ${pw.cls_worst > 0.1 ? "warn" : "ok"}">CLS ${pw.cls_worst.toFixed(2)}</span>` : ""}
      ${typeof pw.lcp_worst_ms === "number" ? `<span class="pill ${pw.lcp_worst_ms > 2500 ? "warn" : "ok"}">LCP ${Math.round(pw.lcp_worst_ms)}ms</span>` : ""}
      <span class="judge-score">playwright · ${pw.passed_budgets}/${pw.passed_budgets + pw.failed_budgets} budgets</span>
    </div>` : "";

  return `
    <section class="panel" data-option="${option}">
      <div class="panel-head">
        <h2>Option ${option.toUpperCase()} <span class="axis">· ${htmlEscape(axis)}</span></h2>
        <div>
          ${url ? `<a class="open" href="${htmlEscape(url)}" target="_blank" rel="noopener">↗ open standalone</a>` : ""}
        </div>
      </div>
      <div class="panel-iframe">${body}</div>
      <div class="panel-summary" tabindex="0" aria-label="Design summary and scoring for option ${option.toUpperCase()}">
        <div class="strip">
          <span>density ${density}</span>
          <span>motion · ${htmlEscape(motion)}</span>
          <span>aff · ${htmlEscape(affordance)}</span>
          <span>metaphor · ${htmlEscape(metaphor)}</span>
          <span>persona · ${htmlEscape(persona)}</span>
        </div>
        <p>${htmlEscape(summary)}</p>
        <div class="pillrow">
          <span class="pill ok">reuse ${reuseCount}</span>
          ${netNewCount > 0 ? `<span class="pill ${netNewCount > 5 ? "warn" : ""}">net-new ${netNewCount}</span>` : ""}
          ${optimisedFor.map(o => `<span class="pill">+ ${htmlEscape(o)}</span>`).join("")}
          ${sacrifices.map(s => `<span class="pill warn">− ${htmlEscape(s)}</span>`).join("")}
        </div>
        ${judgeRow}
        ${a11yRow}
        ${pwRow}
      </div>
    </section>
  `;
}

const HTML_FOOTER = `
  </div>
  <script>
    // Simple shortcuts: 1/2/3/4 to fullscreen each option
    document.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "IFRAME" || e.target.tagName === "INPUT")) return;
      const k = e.key;
      if (["1","2","3","4"].includes(k)) {
        const idx = parseInt(k, 10) - 1;
        const panel = document.querySelectorAll(".panel")[idx];
        const url = panel?.querySelector("iframe")?.src;
        if (url) window.open(url, "_blank");
      }
    });
  </script>
</body>
</html>
`;

function buildComparator(uc) {
  const sha = readMaybe(join(REPO, ".fsi-state", uc, "proposals", "preflight.json"));
  let canvasSha = "";
  try { canvasSha = JSON.parse(sha)?.canvas_sha256 ?? ""; } catch { /* ignore */ }
  const opts = ["a", "b", "c", "d"].map(x => loadOption(uc, x));

  const html = HTML_HEADER(uc, canvasSha) +
    `<header class="header">
      <h1>${htmlEscape(uc)} · 4 design options · pick one via /fsi-design-review</h1>
      <div class="sha">canvas ${htmlEscape(canvasSha.slice(0, 16))}…</div>
      <div class="toolbar">
        <button onclick="document.querySelectorAll('iframe').forEach(f=>f.src=f.src)">↻ reload all</button>
      </div>
    </header>
    <main class="grid" aria-label="Design option comparison">
      ${opts.map(renderPanel).join("\n")}
    </main>` + HTML_FOOTER;

  const out = join(REPO, "usecases", uc, "ui", "proposals", "_review.html");
  writeFileSync(out, html);
  console.log(`✓ wrote ${out}`);
  console.log(`  open: file://${out}`);
}

const uc = process.argv[2];
if (!uc) {
  console.error("usage: node scripts/build_design_comparator.mjs <use_case>");
  process.exit(1);
}
buildComparator(uc);
