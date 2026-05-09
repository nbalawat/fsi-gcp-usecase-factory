#!/usr/bin/env node
/**
 * test_ui_smoke.mjs — Atrium console interaction-correctness gate.
 *
 * Crawls each console route via fetch (no headless browser needed) and
 * asserts the seven UI authoring rules from docs/methodology/ui-authoring.md
 * are upheld:
 *
 *   1. Every <button> has type/onClick context (or is type="submit").
 *   2. Every <a>/Link has href, and href is non-empty / not "#".
 *   3. Every table row that LOOKS clickable has role="link" or wraps a Link.
 *   4. Search inputs are real <input type="search">, not styled <div>s.
 *   5. Nav items have href.
 *   6. No legacy class aliases on changed lines (warn, not fail).
 *   7. Page returns HTTP 200 and serves CSS that includes Atrium tokens.
 *
 * Usage:
 *   node scripts/test_ui_smoke.mjs                          # all consoles
 *   node scripts/test_ui_smoke.mjs --console=pipeline-console
 *   PORT=3000 node scripts/test_ui_smoke.mjs                # against running dev server
 *   node scripts/test_ui_smoke.mjs --no-server              # skip starting a server
 *
 * Exits non-zero with a list of violations on failure. Designed to run in CI.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;

const CONSOLES = [
  {
    name: "pipeline-console",
    routes: [
      { path: "/", expect: ["atrium", "Approval queue", "<input type=\"search\""] },
      // Case-detail route is exercised dynamically below: we discover an id
      // from the live `/api/cases` feed. Skipped automatically on an empty DB.
    ],
    caseDetailExpect: ["Application progress", "Credit memo summary"],
  },
];

const violations = [];

function violate(route, rule, detail) {
  violations.push({ route, rule, detail });
}

async function fetchRoute(path) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { redirect: "manual" });
  const status = r.status;
  const html = await r.text();
  return { status, html, url };
}

async function fetchCSS(layoutCssHref) {
  const r = await fetch(`${BASE}${layoutCssHref}`);
  return r.text();
}

function checkButtonsHaveAction(html, route) {
  // React onClick handlers are NOT visible in server-rendered HTML — they
  // attach during client hydration. So we can't detect dead buttons reliably
  // from HTML alone. We flag a button only when it's CLEARLY anonymous:
  //  - no type="submit"
  //  - no disabled
  //  - no aria-label
  //  - no hover class (hint of intent)
  //  - no `data-action` (server-action marker)
  // and emit as a WARNING. The developer walks the page per rule 7.
  const buttonRe = /<button\b([^>]*)>/g;
  let m;
  while ((m = buttonRe.exec(html))) {
    const attrs = m[1];
    if (/type=["']submit["']/.test(attrs)) continue;
    if (/\bdisabled(\s|=|>)/.test(attrs)) continue;
    if (/aria-label=/.test(attrs)) continue;
    if (/data-action/.test(attrs)) continue;
    if (/class(Name)?="[^"]*hover/.test(attrs)) continue;
    violate(route, "rule-1-button-no-action-warn", attrs.trim().slice(0, 80));
  }
}

function checkLinksHaveHref(html, route) {
  const linkRe = /<a\b([^>]*)>/g;
  let m;
  while ((m = linkRe.exec(html))) {
    const attrs = m[1];
    const hrefMatch = /href=["']([^"']*)["']/.exec(attrs);
    if (!hrefMatch) {
      violate(route, "rule-2-anchor-no-href", attrs.trim().slice(0, 80));
      continue;
    }
    const href = hrefMatch[1];
    if (href === "" || href === "#") {
      violate(route, "rule-2-anchor-empty-href", attrs.trim().slice(0, 80));
    }
  }
}

function checkSearchIsRealInput(html, route) {
  // Heuristic: the AppShell search is identified by placeholder text.
  if (!/<input[^>]*type=["']search["']/.test(html)) {
    // Allow pages that don't show a search box; only flag if we see the visual.
    if (/Search executions, agents, rules/.test(html) && !/<input/.test(html)) {
      violate(
        route,
        "rule-1-search-not-input",
        "Page shows search affordance but no <input> element",
      );
    }
  }
}

function checkRowsAreLinks(html, route) {
  // Find <tr> elements inside <tbody> that contain a <td> with a <Link>/<a>
  // but the <tr> itself is NOT role="link". This is the "only-one-cell-clicks"
  // anti-pattern.
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html);
  if (!tbodyMatch) return;
  const tbody = tbodyMatch[1];
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(tbody))) {
    const attrs = m[1];
    const inner = m[2];
    const rowIsLink = /role=["']link["']/.test(attrs);
    const innerHasLink = /<a\b[^>]*href/.test(inner);
    if (innerHasLink && !rowIsLink) {
      violate(
        route,
        "rule-1-row-only-cell-clicks",
        "Row has a link in a cell but tr is not role=link — wrap whole row in <CaseRow>",
      );
    }
  }
}

function checkCssTokens(css, route) {
  const required = [
    "--paper", "--accent", "--ink-1", "--rule",
    "Inter Tight", "Source Serif", "JetBrains",
  ];
  for (const tok of required) {
    if (!css.includes(tok)) {
      violate(route, "rule-5-missing-token", `CSS does not include ${tok}`);
    }
  }
}

function warnLegacyAliases(html, route) {
  const legacy = [
    "bg-brand-primary", "text-text-primary", "border-surface-border",
    "bg-status-okBg", "bg-surface-panel",
  ];
  for (const cls of legacy) {
    if (html.includes(`"${cls}`) || html.includes(` ${cls}`)) {
      violate(
        route,
        "rule-6-legacy-alias-warn",
        `${cls} — migrate to Atrium-native (warning only)`,
      );
    }
  }
}

async function checkRoute(route) {
  let res;
  try {
    res = await fetchRoute(route.path);
  } catch (e) {
    violate(route.path, "rule-7-fetch-failed", e.message);
    return;
  }

  if (res.status !== 200) {
    violate(route.path, "rule-7-non-200", `HTTP ${res.status}`);
    return;
  }

  // Expected substrings
  for (const ex of route.expect ?? []) {
    if (!res.html.includes(ex)) {
      violate(route.path, "rule-7-missing-substring", `expected "${ex}"`);
    }
  }

  checkButtonsHaveAction(res.html, route.path);
  checkLinksHaveHref(res.html, route.path);
  checkSearchIsRealInput(res.html, route.path);
  checkRowsAreLinks(res.html, route.path);
  warnLegacyAliases(res.html, route.path);

  const cssMatch = /\/_next\/static\/css\/[^"]+\.css\?v=\d+/.exec(res.html);
  if (cssMatch) {
    const css = await fetchCSS(cssMatch[0]);
    checkCssTokens(css, route.path);
  } else {
    violate(route.path, "rule-7-no-css-link", "No layout.css link in <head>");
  }
}

async function pingServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const consoleArg = args.find((a) => a.startsWith("--console="))?.split("=")[1];
  const skipServer = args.includes("--no-server");

  let serverProc = null;
  let started = await pingServer();
  if (!started && !skipServer) {
    console.error(
      `→ no server on ${BASE}, starting pipeline-console (may take 15s)…`,
    );
    serverProc = spawn(
      "pnpm",
      ["--filter", "pipeline-console", "dev"],
      { cwd: "ui", stdio: "ignore", detached: true },
    );
    started = await pingServer();
  }

  if (!started) {
    console.error(`✗ server unreachable on ${BASE}`);
    process.exit(2);
  }

  const consoles = consoleArg
    ? CONSOLES.filter((c) => c.name === consoleArg)
    : CONSOLES;

  for (const c of consoles) {
    console.log(`\n=== ${c.name} ===`);
    for (const route of c.routes) {
      console.log(`  • ${route.path}`);
      await checkRoute(route);
    }
    // Optional case-detail smoke: discover an id from /api/cases. Empty DB
    // = no detail check (homepage is the truth source for an empty queue).
    if (c.caseDetailExpect) {
      try {
        const r = await fetch(`${BASE}/api/cases`);
        if (r.ok) {
          const list = await r.json();
          const id = Array.isArray(list) && list.length > 0 ? list[0].loan_id ?? list[0].application_id : null;
          if (id) {
            const path = `/cases/${encodeURIComponent(id)}`;
            console.log(`  • ${path} (live)`);
            await checkRoute({ path, expect: c.caseDetailExpect });
          } else {
            console.log("  • case-detail skipped — empty queue (no rows in application_state)");
          }
        }
      } catch (e) {
        console.log(`  • case-detail skipped — /api/cases unreachable (${e.message})`);
      }
    }
  }

  if (serverProc) {
    try { process.kill(-serverProc.pid); } catch {}
  }

  // Group violations by rule
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule).push(v);
  }

  const warns = [
    "rule-6-legacy-alias-warn",
    "rule-1-button-no-action-warn",
  ];
  const fails = [];
  const ws = [];
  for (const [rule, vs] of byRule) {
    if (warns.includes(rule)) ws.push([rule, vs]);
    else fails.push([rule, vs]);
  }

  if (ws.length > 0) {
    console.log("\n⚠  Warnings:");
    for (const [rule, vs] of ws) {
      console.log(`  ${rule}: ${vs.length}`);
      for (const v of vs.slice(0, 3)) console.log(`    · ${v.route} — ${v.detail}`);
    }
  }

  if (fails.length === 0) {
    console.log(
      `\n✓ All ${consoles.length} console(s) pass UI smoke (${ws.reduce((s, [, vs]) => s + vs.length, 0)} warnings)`,
    );
    process.exit(0);
  }

  console.log("\n✗ UI smoke violations:");
  for (const [rule, vs] of fails) {
    console.log(`  ${rule}: ${vs.length}`);
    for (const v of vs.slice(0, 5)) {
      console.log(`    · ${v.route} — ${v.detail}`);
    }
    if (vs.length > 5) console.log(`    … +${vs.length - 5} more`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("test_ui_smoke crashed:", e);
  process.exit(2);
});
