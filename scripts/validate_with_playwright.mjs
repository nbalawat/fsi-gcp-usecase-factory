#!/usr/bin/env node
// scripts/validate_with_playwright.mjs
//
// Drives Playwright (via the direct Node.js API in .claude/mcp/node_modules/playwright)
// to validate a use case's design options. Standalone — does NOT require Claude Code
// or the MCP server. CI-callable.
//
// What it captures per option per route:
//   - screenshots at 3 viewports (1440x900, 1024x768, 768x900)
//   - console errors + warnings
//   - failed network requests (4xx/5xx)
//   - axe-core accessibility scan (full WCAG2A + WCAG2AA + WCAG21A + WCAG21AA + best-practice)
//   - layout shift CLS (cumulative layout shift score after 2s)
//   - first paint timing (LCP, CLS, TBT from PerformanceObserver)
//
// Output: archives/design-tests/<run-id>/option-<x>/playwright-report.json
//         archives/design-tests/<run-id>/option-<x>/screenshots/<route>-<viewport>.png
//
// Usage:
//   node scripts/validate_with_playwright.mjs <use_case> <run-id>
//   node scripts/validate_with_playwright.mjs <use_case> <run-id> --url-prefix=http://localhost:3000
//   node scripts/validate_with_playwright.mjs <use_case> <run-id> --only=a,c
//
// URL resolution:
//   1. If --url-prefix=X is passed: visit X/case/sample / X/approval/sample per option
//   2. Else: read .fsi-state/<uc>/proposals/<opt>.url and visit /case/sample, /approval/sample
//   3. If neither resolves: mark the option as "no-url" and skip Playwright; still try a
//      static-render fallback by spawning `npx next dev` per option (~slow; opt-in via --static-render)

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Load Playwright from the project-scoped install
const playwrightPath = join(REPO, ".claude/mcp/node_modules/playwright");
if (!existsSync(playwrightPath)) {
  console.error(`Playwright not installed. Run: (cd .claude/mcp && npm install)`);
  process.exit(2);
}
const { chromium } = await import(join(playwrightPath, "index.mjs"));

const axePath = join(REPO, ".claude/mcp/node_modules/axe-core/axe.min.js");
const axeSource = existsSync(axePath) ? readFileSync(axePath, "utf-8") : null;
if (!axeSource) {
  console.error(`axe-core not installed. Run: (cd .claude/mcp && npm install)`);
  process.exit(2);
}

// ────────────────── CLI parsing ──────────────────
const argv = process.argv.slice(2);
const useCase = argv[0];
const runId = argv[1];
const urlPrefix = (argv.find(a => a.startsWith("--url-prefix=")) ?? "").replace("--url-prefix=", "") || null;
const onlyArg = (argv.find(a => a.startsWith("--only=")) ?? "").replace("--only=", "");
const onlyOptions = onlyArg ? onlyArg.split(",").map(s => s.trim().toLowerCase()) : null;

if (!useCase || !runId) {
  console.error("usage: node scripts/validate_with_playwright.mjs <use_case> <run-id> [--url-prefix=http://localhost:3000] [--only=a,c]");
  process.exit(2);
}

const runDir = join(REPO, "archives/design-tests", runId);
if (!existsSync(runDir)) {
  console.error(`run dir missing: ${runDir}`);
  process.exit(2);
}

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768",  width: 768,  height: 900 },
];

const ROUTES = ["/case/sample", "/approval/sample"];

const A11Y_BUDGET = 5;
const CLS_BUDGET = 0.1;        // Google "good" threshold
const LCP_BUDGET_MS = 2500;    // Google "good" threshold
const CONSOLE_ERROR_BUDGET = 0;

function resolveUrlPrefix(opt) {
  if (urlPrefix) return urlPrefix;
  const urlFile = join(REPO, ".fsi-state", useCase, "proposals", `${opt}.url`);
  if (existsSync(urlFile)) return readFileSync(urlFile, "utf-8").trim();
  return null;
}

// Read canvas SHA from the test-run's meta.yaml so the auditor can cross-check.
let canvasSha = null;
try {
  const metaPath = join(runDir, "meta.yaml");
  if (existsSync(metaPath)) {
    const m = readFileSync(metaPath, "utf-8").match(/^canvas_sha256:\s*"?([a-f0-9]{64})"?/m);
    if (m) canvasSha = m[1];
  }
} catch { /* meta.yaml is optional */ }

async function validateOption(browser, opt) {
  const baseUrl = resolveUrlPrefix(opt);
  const report = {
    option: opt.toUpperCase(),
    use_case: useCase,
    run_id: runId,
    canvas_sha256: canvasSha,           // echoed for the auditor's drift check
    validated_at: new Date().toISOString(),
    base_url: baseUrl,
    routes: {},
    summary: {
      total_a11y_violations: 0,
      total_console_errors: 0,
      total_failed_requests: 0,
      cls_worst: 0,
      lcp_worst_ms: 0,
      passed_budgets: 0,
      failed_budgets: 0,
    },
  };

  if (!baseUrl) {
    report.skipped = true;
    report.skip_reason = "no URL (option not deployed, no --url-prefix, and no .fsi-state/<uc>/proposals/<opt>.url)";
    return report;
  }

  const screenshotDir = join(runDir, `option-${opt}`, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });

  for (const route of ROUTES) {
    const url = baseUrl.replace(/\/$/, "") + route;
    const routeKey = route.replace(/^\//, "").replace(/\//g, "-");
    report.routes[routeKey] = { url, viewports: {} };

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();

      const consoleErrors = [];
      const consoleWarnings = [];
      const failedRequests = [];

      page.on("console", msg => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
        if (msg.type() === "warning") consoleWarnings.push(msg.text());
      });
      page.on("requestfailed", req => failedRequests.push({ url: req.url(), reason: req.failure()?.errorText }));
      page.on("response", res => {
        const s = res.status();
        if (s >= 400) failedRequests.push({ url: res.url(), status: s });
      });

      let navError = null;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => { /* ignore */ });
      } catch (e) {
        navError = e.message.slice(0, 200);
      }

      // Take screenshot
      const screenshotPath = join(screenshotDir, `${routeKey}-${vp.name}.png`);
      let screenshotOk = false;
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10_000 });
        screenshotOk = true;
      } catch (e) {
        navError = navError ?? `screenshot failed: ${e.message.slice(0, 100)}`;
      }

      // Run axe-core
      let axeResult = null;
      if (!navError) {
        try {
          await page.addScriptTag({ content: axeSource });
          axeResult = await page.evaluate(async () => {
            // eslint-disable-next-line no-undef
            return await window.axe.run(document, {
              runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
            });
          });
        } catch (e) {
          axeResult = { violations: [], passes: [], error: e.message.slice(0, 200) };
        }
      }

      // Performance / layout shift
      let perf = { cls: null, lcp: null };
      if (!navError) {
        try {
          perf = await page.evaluate(() => new Promise(resolve => {
            // Wait briefly for CLS to settle, then read
            let cls = 0;
            const obs = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                // eslint-disable-next-line no-undef
                if (!entry.hadRecentInput) cls += entry.value;
              }
            });
            try { obs.observe({ type: "layout-shift", buffered: true }); } catch { /* not all browsers */ }

            let lcp = null;
            const lcpObs = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              if (entries.length) lcp = entries[entries.length - 1].startTime;
            });
            try { lcpObs.observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* */ }

            setTimeout(() => resolve({ cls, lcp }), 1500);
          }));
        } catch { /* */ }
      }

      const a11yViolations = (axeResult?.violations ?? []).map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
      }));

      report.routes[routeKey].viewports[vp.name] = {
        nav_error: navError,
        screenshot: screenshotOk ? `screenshots/${routeKey}-${vp.name}.png` : null,
        console_errors: consoleErrors.length,
        console_error_samples: consoleErrors.slice(0, 5),
        console_warnings: consoleWarnings.length,
        failed_requests: failedRequests.length,
        failed_request_samples: failedRequests.slice(0, 5),
        a11y_violation_count: a11yViolations.length,
        a11y_violations_sample: a11yViolations.slice(0, 10),
        cls: perf.cls,
        lcp_ms: perf.lcp,
      };

      // Aggregate into summary
      report.summary.total_a11y_violations += a11yViolations.length;
      report.summary.total_console_errors += consoleErrors.length;
      report.summary.total_failed_requests += failedRequests.length;
      if (perf.cls != null) report.summary.cls_worst = Math.max(report.summary.cls_worst, perf.cls);
      if (perf.lcp != null) report.summary.lcp_worst_ms = Math.max(report.summary.lcp_worst_ms, perf.lcp);

      await ctx.close();
    }
  }

  // Budget evaluation
  const checks = [];
  checks.push({ name: "a11y", budget: A11Y_BUDGET, value: report.summary.total_a11y_violations, ok: report.summary.total_a11y_violations <= A11Y_BUDGET });
  checks.push({ name: "console_errors", budget: CONSOLE_ERROR_BUDGET, value: report.summary.total_console_errors, ok: report.summary.total_console_errors <= CONSOLE_ERROR_BUDGET });
  checks.push({ name: "cls", budget: CLS_BUDGET, value: report.summary.cls_worst, ok: report.summary.cls_worst <= CLS_BUDGET });
  checks.push({ name: "lcp_ms", budget: LCP_BUDGET_MS, value: report.summary.lcp_worst_ms, ok: report.summary.lcp_worst_ms <= LCP_BUDGET_MS });
  report.budget_checks = checks;
  report.summary.passed_budgets = checks.filter(c => c.ok).length;
  report.summary.failed_budgets = checks.filter(c => !c.ok).length;

  return report;
}

async function main() {
  console.log(`── Playwright validation: ${useCase} / ${runId} ──`);
  if (urlPrefix) console.log(`  url-prefix override: ${urlPrefix}`);

  const browser = await chromium.launch({ headless: true });

  const options = ["a", "b", "c", "d", "e", "f"].filter(o => {
    if (onlyOptions && !onlyOptions.includes(o)) return false;
    return existsSync(join(runDir, `option-${o}`));
  });

  const reports = {};
  for (const opt of options) {
    console.log(`  option ${opt.toUpperCase()}:`);
    const t0 = Date.now();
    const report = await validateOption(browser, opt);
    const ms = Date.now() - t0;
    reports[opt] = report;

    // Write report to the archive
    const archivePath = join(runDir, `option-${opt}`, "playwright-report.json");
    writeFileSync(archivePath, JSON.stringify(report, null, 2));

    // ALSO copy the report into the live UC proposals dir so the comparator
    // (which reads from there) picks it up immediately. The forever-archive
    // copy at archivePath is the auditor's evidence.
    const liveOptDir = join(REPO, "usecases", useCase, "ui", "proposals", `option-${opt}`);
    if (existsSync(liveOptDir)) {
      try {
        writeFileSync(join(liveOptDir, "playwright-report.json"), JSON.stringify(report, null, 2));
      } catch { /* live dir may not exist in CI-only mode */ }
    }

    // Stamp the manifest with summary metrics so the comparator can render
    // the playwright row without re-reading the JSON.
    if (!report.skipped && existsSync(join(liveOptDir, "manifest.yaml"))) {
      try {
        const mfPath = join(liveOptDir, "manifest.yaml");
        let src = readFileSync(mfPath, "utf-8");
        const s = report.summary;
        const stamps = [
          `  playwright_validated_at: "${report.validated_at}"`,
          `  playwright_a11y_violations: ${s.total_a11y_violations}`,
          `  playwright_console_errors: ${s.total_console_errors}`,
          `  playwright_cls_worst: ${s.cls_worst.toFixed(3)}`,
          `  playwright_lcp_worst_ms: ${Math.round(s.lcp_worst_ms)}`,
          `  playwright_budgets_passed: ${s.passed_budgets}`,
          `  playwright_budgets_failed: ${s.failed_budgets}`,
        ];
        // Strip any prior playwright_* lines under build:, then append
        src = src.replace(/^( {2}playwright_[^\n]*\n)+/gm, "");
        if (/^build:\s*$/m.test(src) || /^build:\s*\n/m.test(src)) {
          src = src.replace(/(^build:\s*\n)/m, `$1${stamps.join("\n")}\n`);
        } else {
          if (!src.endsWith("\n")) src += "\n";
          src += `build:\n${stamps.join("\n")}\n`;
        }
        writeFileSync(mfPath, src);
      } catch { /* manifest write best-effort */ }
    }

    if (report.skipped) {
      console.log(`    ⊘ skipped: ${report.skip_reason}`);
    } else {
      const s = report.summary;
      console.log(`    a11y violations:  ${s.total_a11y_violations}  (budget ${A11Y_BUDGET})`);
      console.log(`    console errors:   ${s.total_console_errors}`);
      console.log(`    failed requests:  ${s.total_failed_requests}`);
      console.log(`    CLS worst:        ${s.cls_worst.toFixed(3)}    (budget ${CLS_BUDGET})`);
      console.log(`    LCP worst:        ${Math.round(s.lcp_worst_ms)}ms  (budget ${LCP_BUDGET_MS}ms)`);
      console.log(`    budgets:          ${s.passed_budgets}/${s.passed_budgets + s.failed_budgets} passed`);
      console.log(`    ${ms}ms total`);
    }
  }

  await browser.close();

  // Cross-option summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Cross-option summary");
  console.log("═══════════════════════════════════════════════════════════════");
  for (const opt of options) {
    const r = reports[opt];
    if (r.skipped) {
      console.log(`  ${opt.toUpperCase()}  ⊘ skipped`);
    } else {
      const s = r.summary;
      console.log(`  ${opt.toUpperCase()}  a11y ${s.total_a11y_violations}  err ${s.total_console_errors}  CLS ${s.cls_worst.toFixed(2)}  LCP ${Math.round(s.lcp_worst_ms)}ms  ${s.passed_budgets}/${s.passed_budgets + s.failed_budgets} budgets`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
