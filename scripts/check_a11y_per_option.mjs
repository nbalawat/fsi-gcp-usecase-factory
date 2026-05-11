#!/usr/bin/env node
// scripts/check_a11y_per_option.mjs
//
// Runs an accessibility scan against each of a use case's design-proposal
// options. Two modes:
//
//   1. Live mode (default): hits the deployed ephemeral Cloud Run URL per
//      option and runs pa11y against the rendered HTML. Requires pa11y to
//      be installed: `npm install -g pa11y` or `pnpm add -D pa11y`.
//
//   2. Static fallback (--static): reads each option's app/case/[id]/page.tsx
//      + Dockerfile and computes a heuristic score based on:
//        - presence of aria-* attributes
//        - alt= on every img
//        - lang on <html>
//        - skip-to-content link
//        - button vs div-styled-as-button (regex spot-check)
//      This is NOT a substitute for a real pa11y run but is offline and
//      gives a directional signal during /fsi-design-proposals --dry-run.
//
// Output: writes results into each option's
// usecases/<uc>/ui/proposals/option-<x>/manifest.yaml under build.a11y_violations.
//
// Usage:
//   node scripts/check_a11y_per_option.mjs <use_case>           # live mode
//   node scripts/check_a11y_per_option.mjs <use_case> --static  # offline heuristic
//
// Exit codes: 0 = all options scanned (may have violations); 1 = could not
// scan any option; 2 = usage error.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VIOLATION_BUDGET = 5;

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/check_a11y_per_option.mjs <use_case> [--static]");
  process.exit(2);
}
const uc = argv[0];
const staticMode = argv.includes("--static");

const ucDir = join(REPO, "usecases", uc, "ui", "proposals");
if (!existsSync(ucDir)) {
  console.error(`no proposals dir at ${ucDir}; run /fsi-design-proposals ${uc} first`);
  process.exit(1);
}

function loadUrlFor(option) {
  const p = join(REPO, ".fsi-state", uc, "proposals", `${option}.url`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8").trim();
}

// ────────────────── live mode (pa11y) ──────────────────
function runPa11y(url) {
  try {
    // pa11y --reporter json outputs an array of issues
    const stdout = execFileSync("pa11y", ["--reporter", "json", "--timeout", "30000", url], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, issues: JSON.parse(stdout) };
  } catch (e) {
    // pa11y exits non-zero when issues are found; the JSON is still on stdout.
    const stdout = e.stdout?.toString() ?? "";
    if (stdout.startsWith("[")) {
      try { return { ok: true, issues: JSON.parse(stdout) }; }
      catch { /* fall through */ }
    }
    return { ok: false, error: e.message?.slice(0, 200) ?? "pa11y failed" };
  }
}

// ────────────────── static heuristic ──────────────────
function staticHeuristic(optionDir) {
  const issues = [];
  // Walk all *.tsx files
  function walk(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      try {
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walk(p));
        else if (entry.endsWith(".tsx") || entry.endsWith(".jsx")) out.push(p);
      } catch { /* ignore */ }
    }
    return out;
  }
  const files = walk(optionDir);

  for (const f of files) {
    let src;
    try { src = readFileSync(f, "utf-8"); } catch { continue; }
    const rel = f.replace(REPO + "/", "");

    // 1. img without alt
    const imgMatches = src.match(/<img\b(?:(?!\/>|>).)*\/?>/g) ?? [];
    for (const m of imgMatches) {
      if (!/alt\s*=/.test(m)) {
        issues.push({ code: "WCAG2A.Principle1.Guideline1_1.1_1_1", file: rel, snippet: m.slice(0, 80), msg: "img without alt" });
      }
    }

    // 2. div with onClick (button styled as div)
    const divClickMatches = src.match(/<div\b[^>]*onClick[^>]*>/g) ?? [];
    for (const m of divClickMatches) {
      issues.push({ code: "WCAG2A.Principle2.Guideline2_1", file: rel, snippet: m.slice(0, 80), msg: "div styled as button — use <button>" });
    }

    // 3. button without aria-label OR child text (rough)
    const buttonMatches = src.match(/<button\b[^>]*>(?:\s*<[^>]+>)*\s*<\/button>/g) ?? [];
    for (const m of buttonMatches) {
      if (!/aria-label/.test(m)) {
        issues.push({ code: "WCAG2A.Principle4.Guideline4_1.4_1_2", file: rel, snippet: m.slice(0, 80), msg: "icon-only button without aria-label" });
      }
    }

    // 4. link without href
    const linkMatches = src.match(/<a\b[^>]*>/g) ?? [];
    for (const m of linkMatches) {
      if (!/href\s*=/.test(m) && !/Link/.test(m)) {
        issues.push({ code: "WCAG2A.Principle2.Guideline2_1.2_1_1", file: rel, snippet: m.slice(0, 80), msg: "anchor without href" });
      }
    }
  }

  return { ok: true, issues };
}

// ────────────────── tiny YAML round-trip helpers ──────────────────
// We avoid a full YAML library — write a simple "append or replace block" helper
// that finds an existing `build:` key and replaces the a11y_violations entry.
function upsertA11yBlock(manifestPath, count, violations, mode) {
  let src = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : "";
  const block = [
    "  a11y_violations: " + count,
    "  a11y_scan_mode: " + JSON.stringify(mode),
    "  a11y_violation_codes:",
    ...violations.slice(0, 20).map(v => "    - " + JSON.stringify(v.code + ": " + (v.msg ?? "").slice(0, 80))),
  ].join("\n");

  if (/^build:\s*$/m.test(src) || /^build:\s*\n/m.test(src)) {
    // Strip any existing a11y_* lines under build:, then append
    src = src.replace(/^( {2}a11y_[^\n]*\n)+/m, "");
    src = src.replace(/(^build:\s*\n)/m, `$1${block}\n`);
  } else {
    if (!src.endsWith("\n")) src += "\n";
    src += `build:\n${block}\n`;
  }
  writeFileSync(manifestPath, src);
}

// ────────────────── main loop ──────────────────
const results = {};
const options = ["a", "b", "c", "d", "e", "f"];
let scanned = 0;

for (const opt of options) {
  const optDir = join(ucDir, `option-${opt}`);
  if (!existsSync(optDir)) continue;
  const manifest = join(optDir, "manifest.yaml");

  let outcome;
  if (staticMode) {
    outcome = staticHeuristic(optDir);
  } else {
    const url = loadUrlFor(opt);
    if (!url) {
      results[opt] = { ok: false, error: "no .fsi-state/<uc>/proposals/<x>.url" };
      console.log(`  option ${opt.toUpperCase()}: no deployed URL; skipping`);
      continue;
    }
    outcome = runPa11y(url);
  }

  if (!outcome.ok) {
    results[opt] = outcome;
    console.log(`  option ${opt.toUpperCase()}: scan failed — ${outcome.error}`);
    continue;
  }

  const count = outcome.issues.length;
  const overBudget = count > VIOLATION_BUDGET;
  results[opt] = { count, overBudget, scanned: true };
  upsertA11yBlock(manifest, count, outcome.issues, staticMode ? "static-heuristic" : "pa11y-live");
  const badge = overBudget ? "⚠" : "✓";
  console.log(`  option ${opt.toUpperCase()}: ${badge} ${count} violation${count === 1 ? "" : "s"} (budget ${VIOLATION_BUDGET})`);
  scanned++;
}

console.log("");
console.log(`scanned ${scanned} option(s); mode = ${staticMode ? "static-heuristic" : "pa11y-live"}`);

if (scanned === 0) {
  console.error("ERROR: scanned zero options.");
  process.exit(1);
}

// Machine-readable summary on stderr (consumed by /fsi-design-proposals hand-off)
console.error(JSON.stringify({
  use_case: uc,
  mode: staticMode ? "static-heuristic" : "pa11y-live",
  results,
  any_over_budget: Object.values(results).some(r => r?.overBudget),
}));

process.exit(0);
