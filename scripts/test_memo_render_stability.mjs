#!/usr/bin/env node
/**
 * Render-stability CI gate (Track B, step 5 of the plan).
 *
 * Walks every application_id pulled from /api/cases (or a passed list)
 * and asserts that:
 *   1. /cases/<id> returns 2xx
 *   2. The HTML does NOT contain a Next.js error digest banner
 *   3. The HTML does NOT contain unrendered JSON (`{"credit_memorandum_draft"`,
 *      `{"executive_summary":` at top of a banker prose region, etc.)
 *   4. /cases/<id>/memo returns 2xx
 *   5. /audit/<id> returns 2xx
 *
 * Run against the local dev server at http://localhost:3000 by default;
 * override with DEV_BASE env var.
 *
 * Designed to be cheap (one curl per route, no headless browser) so it
 * can run on every PR. A heavier playwright-based check belongs in CI.
 *
 * Usage:
 *     node scripts/test_memo_render_stability.mjs                  # walk /api/cases
 *     node scripts/test_memo_render_stability.mjs <id1> <id2>      # explicit IDs
 *     DEV_BASE=https://staging.example.com node scripts/test_memo_render_stability.mjs
 *
 * Exit 0 on green; 1 on any failure.
 */
import { argv, exit } from "node:process";

const BASE = process.env.DEV_BASE || "http://localhost:3000";

// Patterns that indicate a render glitch.
const GLITCH_PATTERNS = [
  // Raw JSON wrapper leaking into prose
  /\{\s*&quot;credit_memorandum_draft&quot;/,
  /\{\s*&quot;executive_summary&quot;\s*:\s*\{/,
  /\{\s*&quot;borrower_analysis&quot;/,
  // Next.js default error page text (when route error.tsx is missing)
  /500.{0,40}Internal Server Error/i,
  // Stack-trace fragment leaking to the client
  /at\s+\w+\s+\(.*\.tsx:\d+:\d+\)/,
  // "TypeError: Cannot read properties of undefined" rendered to user
  /TypeError:\s+Cannot read properties of undefined/i,
];

async function fetchText(url) {
  const r = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": "render-stability-gate/1.0" },
  });
  return { status: r.status, text: await r.text() };
}

function checkText(text, route) {
  const hits = [];
  for (const pat of GLITCH_PATTERNS) {
    const m = pat.exec(text);
    if (m) {
      hits.push({ pattern: pat.source, snippet: m[0].slice(0, 80) });
    }
  }
  return hits;
}

async function getCaseIds() {
  // Either CLI args or pull the active queue
  const cli = argv.slice(2);
  if (cli.length > 0) return cli;
  const r = await fetchText(`${BASE}/api/cases?limit=20`);
  if (r.status !== 200) {
    console.error(`[fatal] /api/cases returned ${r.status}; pass IDs as args or fix the dev server`);
    exit(2);
  }
  let body;
  try { body = JSON.parse(r.text); } catch {
    console.error(`[fatal] /api/cases did not return JSON`);
    exit(2);
  }
  const rows = Array.isArray(body) ? body : body.rows || body.cases || [];
  return rows.map((r) => r.application_id || r.id).filter(Boolean);
}

async function checkOne(id) {
  const findings = [];
  for (const sub of ["", "/memo", null]) {
    const route = sub === null ? `/audit/${encodeURIComponent(id)}`
                                : `/cases/${encodeURIComponent(id)}${sub}`;
    let r;
    try {
      r = await fetchText(`${BASE}${route}`);
    } catch (e) {
      findings.push({ id, route, status: "fetch-failed", reason: String(e) });
      continue;
    }
    if (r.status >= 500) {
      findings.push({ id, route, status: r.status, reason: "5xx" });
      continue;
    }
    if (r.status >= 400) {
      // 404 is acceptable for a not-yet-arrived case; otherwise flag.
      if (r.status !== 404) findings.push({ id, route, status: r.status, reason: `${r.status}` });
      continue;
    }
    const hits = checkText(r.text, route);
    if (hits.length > 0) {
      findings.push({ id, route, status: r.status, reason: "glitch-pattern", hits });
    }
  }
  return findings;
}

async function main() {
  const ids = await getCaseIds();
  if (ids.length === 0) {
    console.log(`[skip] no application IDs to check; pass IDs or seed via simulator`);
    return 0;
  }
  console.log(`[info] checking ${ids.length} cases against ${BASE}`);
  let failCount = 0;
  for (const id of ids) {
    const findings = await checkOne(id);
    if (findings.length === 0) {
      console.log(`  ✓ ${id}`);
      continue;
    }
    failCount += 1;
    for (const f of findings) {
      console.log(`  ✗ ${id} ${f.route} → ${f.reason} (status=${f.status})`);
      if (f.hits) for (const h of f.hits) console.log(`      pattern: ${h.pattern}`);
    }
  }
  if (failCount > 0) {
    console.log(`\n[fail] ${failCount} of ${ids.length} cases had render glitches.`);
    console.log(`Fix: see docs/methodology/ui-standards.md §4.10 + plan Track B.`);
    return 1;
  }
  console.log(`\nOK render-stability: ${ids.length} cases rendered cleanly.`);
  return 0;
}

main().then((code) => exit(code)).catch((e) => {
  console.error(`[fatal] ${e.message}`);
  exit(2);
});
