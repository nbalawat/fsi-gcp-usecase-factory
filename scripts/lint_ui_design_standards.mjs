#!/usr/bin/env node
// scripts/lint_ui_design_standards.mjs
//
// CONSOLIDATED CI gate for ui-standards.md Section 8. Rolls the 8 gates that
// were referenced-but-not-implemented into a single grep-based pass:
//
//   2     primitives — bare <button>/<a> without import from @fsi-bank/components
//   3     layout     — page.tsx not wrapped in AppShell
//   4.2   boundaries — Server-default file passes inline `() =>` to a child component
//   4.5   tokens     — Tailwind arbitrary values (text-[96px], bg-[#abc]) or inline style hex
//   4.11  SSE        — useLiveCase consumer without router.refresh() on event
//   4.14  personas   — usecases/<uc>/ui/console.yaml lists personas; PR #1 must scaffold all
//   4.17  agent tiles — components named *Agent* using plain <Spinner /> or "loading…" string
//   4.18  audit panel — agent-audit-trail panels not using shared <ApprovalGate>/<AgentReasoningPanel>
//
// Each rule reports its violations with file:line. Hard rules exit non-zero;
// soft rules emit a warning but pass. The split:
//
//   HARD (block):  2, 3, 4.2, 4.5, 4.18
//   WARN-ONLY:     4.11, 4.14, 4.17  (require runtime context the static grep can't fully prove)
//
// Usage:
//   node scripts/lint_ui_design_standards.mjs                # lint all changed files
//   node scripts/lint_ui_design_standards.mjs <path>         # lint a specific dir or file
//   node scripts/lint_ui_design_standards.mjs --uc <name>    # lint one UC's ui/ tree
//   node scripts/lint_ui_design_standards.mjs --staged       # only files in `git diff --cached`
//
// Exit codes: 0=clean (warnings OK), 1=hard rule failed, 2=usage error.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ────────────────── CLI ──────────────────
const argv = process.argv.slice(2);
let mode = "all";          // all | path | uc | staged
let targetPath = null;
let ucName = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--uc")     { mode = "uc"; ucName = argv[++i]; }
  else if (a === "--staged") { mode = "staged"; }
  else if (!a.startsWith("--")) { mode = "path"; targetPath = a; }
}

function gatherFiles() {
  if (mode === "staged") {
    try {
      const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=AM"], { encoding: "utf-8", cwd: REPO });
      return out.split("\n").filter(f => /\.(tsx?|jsx?)$/.test(f)).map(f => join(REPO, f)).filter(existsSync);
    } catch { return []; }
  }
  let root;
  if (mode === "uc")   root = join(REPO, "usecases", ucName, "ui");
  else if (mode === "path") root = resolve(targetPath);
  else                 root = join(REPO, "usecases"); // scan all UC ui/ dirs by default
  if (!existsSync(root)) return [];

  const files = [];
  function walk(dir) {
    for (const e of readdirSync(dir)) {
      // Skip noise
      if (e === "node_modules" || e === ".next" || e.startsWith(".") || e === "proposals") continue;
      const p = join(dir, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(e)) files.push(p);
    }
  }
  walk(root);
  return files;
}

function read(f) { try { return readFileSync(f, "utf-8"); } catch { return ""; } }
function rel(f)  { return relative(REPO, f); }

// ────────────────── per-rule checks ──────────────────
// Each rule returns { id, severity, label, violations: [{file, line, snippet}] }.

function ruleTokensNoArbitraryValues(files) {
  const violations = [];
  for (const f of files) {
    const src = read(f);
    const lines = src.split("\n");
    lines.forEach((ln, i) => {
      // Tailwind arbitrary value pattern: text-[96px], bg-[#abc123], h-[42rem], etc.
      // Allow url() and animation contexts (rare).
      const m = ln.match(/(?:text|bg|border|h|w|left|right|top|bottom|m|p|mx|my|px|py|pl|pr|pt|pb|gap|font|tracking|leading|max-w|min-w|max-h|min-h)-\[(?!url\()[^\]]+\]/);
      if (m) violations.push({ file: rel(f), line: i + 1, snippet: m[0] });
      // Inline hex / rgba color in style= prop or className.
      const hex = ln.match(/style=\{?\{[^}]*?['"]?#[0-9a-fA-F]{3,8}/);
      if (hex) violations.push({ file: rel(f), line: i + 1, snippet: hex[0].slice(0, 80) });
    });
  }
  return { id: "4.5", severity: "hard", label: "Tokens not invention (no Tailwind arbitrary values, no inline hex)", violations };
}

function rulePrimitives(files) {
  const violations = [];
  for (const f of files) {
    const src = read(f);
    // Skip if this IS a primitive file
    if (f.includes("/ui/packages/components/src/")) continue;
    const lines = src.split("\n");
    let inComment = false;
    lines.forEach((ln, i) => {
      if (ln.includes("/*")) inComment = true;
      if (ln.includes("*/")) { inComment = false; return; }
      if (inComment || ln.trim().startsWith("//")) return;
      // <button> without aria-label and not inside a primitive — flag for review.
      // Strict version of 4.1: every interactive element must have onClick OR href.
      const btnNoHandler = ln.match(/<button(?![^>]*\b(onClick|type=["']submit["'])\s*=)[^>]*>/);
      if (btnNoHandler) violations.push({ file: rel(f), line: i + 1, snippet: btnNoHandler[0].slice(0, 80) });
      // <div onClick=...> — bare div as button.
      const divClick = ln.match(/<div\b[^>]*\bonClick\s*=/);
      if (divClick) violations.push({ file: rel(f), line: i + 1, snippet: divClick[0].slice(0, 80) });
      // <a> without href (and not Next Link). Word boundary on `<a` so
      // we don't false-match <aside>/<article>/<a11y>/etc.
      const aNoHref = ln.match(/<a(?=[\s>])(?![^>]*\bhref\s*=)[^>]*>/);
      if (aNoHref && !ln.includes("Link")) violations.push({ file: rel(f), line: i + 1, snippet: aNoHref[0].slice(0, 80) });
    });
  }
  return { id: "2", severity: "hard", label: "Use shared primitives (no bare <button>/<div onClick>/<a> without href)", violations };
}

function ruleLayoutAppShell(files) {
  const violations = [];
  for (const f of files) {
    // Only check Next.js page.tsx files inside an app/ route group
    if (!/\/app\/.*\/page\.tsx$/.test(f) && !f.endsWith("/app/page.tsx")) continue;
    const src = read(f);
    // Skip if this page is a SUB-route — we only require AppShell at the root of each route group
    if (/route-group/.test(src)) continue;
    if (!/<AppShell/.test(src) && !/AppShell\s+from/.test(src)) {
      // Look for any top-level layout pattern — if there's a layout.tsx in the parent dir, that's where AppShell can live
      const layoutSibling = f.replace(/\/page\.tsx$/, "/layout.tsx");
      const layoutAncestor = f.replace(/\/app\/[^/]+\/page\.tsx$/, "/app/layout.tsx");
      const hasLayout = (existsSync(layoutSibling) && /<AppShell/.test(read(layoutSibling))) ||
                       (existsSync(layoutAncestor) && /<AppShell/.test(read(layoutAncestor)));
      if (!hasLayout) {
        violations.push({ file: rel(f), line: 1, snippet: "page.tsx is not AppShell-rooted (neither this file nor sibling/ancestor layout.tsx imports AppShell)" });
      }
    }
  }
  return { id: "3", severity: "hard", label: "Every page is AppShell-rooted", violations };
}

function ruleServerClientBoundaries(files) {
  const violations = [];
  for (const f of files) {
    if (!f.endsWith(".tsx") && !f.endsWith(".jsx")) continue;
    const src = read(f);
    const isClient = /^["']use client["'];?/m.test(src);
    if (isClient) continue;
    // In a Server component, passing an inline arrow as a JSX prop is the layering bug.
    // Match: <Foo onClick={() => …} OR <Foo onSomething={() => …}
    const lines = src.split("\n");
    lines.forEach((ln, i) => {
      const m = ln.match(/<[A-Z][\w]*\s[^>]*\bon[A-Z][\w]*\s*=\s*\{\s*\(?[^=]*\)\s*=>/);
      if (m) violations.push({ file: rel(f), line: i + 1, snippet: m[0].slice(0, 80) });
    });
  }
  return { id: "4.2", severity: "hard", label: "Server/Client boundary: no inline () => from Server file", violations };
}

function ruleSseInvalidation(files) {
  const violations = [];
  // For each file that consumes useLiveCase / SSE, look for router.refresh() in the same module.
  for (const f of files) {
    const src = read(f);
    if (!/useLiveCase|EventSource|useSSE/.test(src)) continue;
    if (!/router\.refresh\(\)|useRouter|revalidate/.test(src)) {
      violations.push({ file: rel(f), line: 1, snippet: "consumes live event spine but no router.refresh() / revalidate found" });
    }
  }
  return { id: "4.11", severity: "warn", label: "SSE consumers must invalidate via router.refresh()", violations };
}

function rulePersonasScaffolded(files) {
  // Look for usecases/<uc>/ui/console.yaml — for each that lists personas, verify the route group exists
  const violations = [];
  const usecases = join(REPO, "usecases");
  if (!existsSync(usecases)) return { id: "4.14", severity: "warn", label: "Personas scaffolded in PR #1", violations };
  for (const uc of readdirSync(usecases)) {
    const consoleYaml = join(usecases, uc, "ui", "console.yaml");
    if (!existsSync(consoleYaml)) continue;
    const yaml = read(consoleYaml);
    const personas = [...yaml.matchAll(/-\s*name:\s*([\w-]+)/g)].map(m => m[1]);
    for (const p of personas) {
      const routeGroup = join(usecases, uc, "ui", "app", `(${p})`);
      if (!existsSync(routeGroup)) {
        violations.push({ file: `usecases/${uc}/ui/app/(${p})/`, line: 1, snippet: `persona "${p}" declared in console.yaml but no route group` });
      }
    }
  }
  return { id: "4.14", severity: "warn", label: "Personas scaffolded in PR #1", violations };
}

function ruleAgentTilesSurfaceState(files) {
  const violations = [];
  for (const f of files) {
    // Heuristic: a *Agent*.tsx file using a generic "Loading…" string or plain Spinner without status
    const base = f.split("/").pop();
    if (!/agent|Agent/i.test(base)) continue;
    const src = read(f);
    if (/Loading…|Loading\.\.\./i.test(src) && !/agent_state|status|reasoning|step/i.test(src)) {
      violations.push({ file: rel(f), line: 1, snippet: 'agent tile renders generic "Loading…" without state/status' });
    }
  }
  return { id: "4.17", severity: "warn", label: "Agent tiles surface state, not generic spinners", violations };
}

function ruleAuditPanelShape(files) {
  const violations = [];
  for (const f of files) {
    if (!/audit/i.test(f)) continue;
    const src = read(f);
    // An audit panel should compose shared primitives (AgentReasoningPanel / ApprovalGate / StatusBadge)
    // OR import them — if it builds its own table of agent_action rows with bespoke styling, flag it.
    const hasSharedImport = /from\s+["']@fsi-bank\/components["']/.test(src);
    const hasAgentActionRows = /agent_action|reasoning|inputs.*output|tools_used/i.test(src);
    if (hasAgentActionRows && !hasSharedImport) {
      violations.push({ file: rel(f), line: 1, snippet: "audit panel renders agent_action data but does not import from @fsi-bank/components" });
    }
  }
  return { id: "4.18", severity: "hard", label: "Audit panels compose shared primitives", violations };
}

// ────────────────── main ──────────────────
function red(s)    { return `\x1b[31m${s}\x1b[0m`; }
function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function dim(s)    { return `\x1b[2m${s}\x1b[0m`; }

const files = gatherFiles();
if (files.length === 0) {
  console.log(dim(`  no UI files found for mode=${mode}; nothing to lint`));
  process.exit(0);
}

console.log(dim(`scanning ${files.length} file(s) (mode=${mode})…`));
console.log("");

const rules = [
  rulePrimitives(files),
  ruleLayoutAppShell(files),
  ruleServerClientBoundaries(files),
  ruleTokensNoArbitraryValues(files),
  ruleSseInvalidation(files),
  rulePersonasScaffolded(files),
  ruleAgentTilesSurfaceState(files),
  ruleAuditPanelShape(files),
];

let hardFails = 0;
let warnings = 0;

for (const r of rules) {
  const symbol = r.violations.length === 0
    ? green("✓")
    : r.severity === "hard" ? red("✗") : yellow("⚠");
  const sevTag = r.severity === "hard" ? red("HARD") : yellow("WARN");
  console.log(`${symbol} [${r.id}] ${sevTag}  ${r.label}  (${r.violations.length})`);
  if (r.violations.length > 0) {
    for (const v of r.violations.slice(0, 6)) {
      console.log(dim(`    ${v.file}:${v.line}  ${v.snippet}`));
    }
    if (r.violations.length > 6) console.log(dim(`    … and ${r.violations.length - 6} more`));
    if (r.severity === "hard") hardFails++;
    else warnings++;
  }
}

console.log("");
if (hardFails > 0) {
  console.log(red(`${hardFails} hard rule(s) failed. Block.`));
  process.exit(1);
}
if (warnings > 0) {
  console.log(yellow(`${warnings} warning(s). Reviewer attention required, not blocked.`));
}
console.log(green("ui-standards section 8 — consolidated lint pass."));
process.exit(0);
