#!/usr/bin/env node
/**
 * Rule 4.10 — defensive UI everywhere; schema drift is real.
 *
 * Flags any `.map()` / `.replace()` / `.startsWith()` / `.toFixed()` /
 * `.toLocaleString()` invocation whose receiver is NOT either:
 *   (a) inside a try/catch
 *   (b) preceded on the same expression by `?? []` / `?? ""` / `?? 0`
 *       / `Number(...)` / `String(...)` coercion
 *   (c) accessed via optional chaining `?.`
 *
 * Why: every `TypeError: Cannot read properties of undefined` crash on
 * the credit-memo build traced to a UI section assuming agent output is
 * schema-perfect. The fix is uniform null-safety at the use site.
 *
 * Usage:
 *     node scripts/lint_ui_defensive.mjs ui/apps/
 *     node scripts/lint_ui_defensive.mjs ui/apps/pipeline-console/components/
 *
 * Allowed exceptions: a comment `// rule-4.10-exception: <reason>` on the
 * same line whitelists the match.
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one defensive-coding violation
 *   2 — usage error
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { argv, exit } from "node:process";

const TARGETS = ["ui/apps", "ui/packages"];
const FILE_EXTS = new Set([".tsx", ".ts", ".jsx", ".js"]);

// Methods we care about — they fail loudly on undefined receivers.
const RISKY = ["map", "filter", "forEach", "reduce", "replace", "startsWith",
               "endsWith", "toFixed", "toLocaleString", "split", "trim",
               "join", "slice"];

const RISKY_PAT = new RegExp(
  // (something).method(   where method is in our list
  `(\\b[\\w\\]\\)\\.\\?]+)\\.(${RISKY.join("|")})\\s*\\(`,
  "g",
);

// Patterns that mark the call site as safe.
const SAFE_PRECEDED_BY = [
  // optional chaining: foo?.method(
  /\?\s*\.\s*(map|filter|forEach|reduce|replace|startsWith|endsWith|toFixed|toLocaleString|split|trim|join|slice)\s*\(/,
  // nullish coalescing: (foo ?? []).method(
  /\?\?\s*(\[\s*\]|"[^"]*"|''|0|\{\})\s*\)\s*\.\s*(map|filter|forEach|reduce|replace|startsWith|endsWith|toFixed|toLocaleString|split|trim|join|slice)/,
  // explicit array: [].concat(maybeArr).map(
  /\[\s*\]\s*\.\s*concat\s*\([^)]*\)\s*\.\s*(map|filter|forEach|reduce|join|slice)/,
];

const NEVER_FLAG_RECEIVERS = new Set([
  // The literal arrays / strings — always safe
  "[]", "''", '""', "{}",
  // String / Array / Number / Object as TYPES are safe
  "String", "Array", "Number", "Object",
  "JSON",
  // Ubiquitous globals
  "console", "window", "document", "process", "Math",
  "React",
]);

function isLineSafe(line, matchStart, matchEnd) {
  // 1) explicit exception comment
  if (line.includes("rule-4.10-exception")) return true;

  // 2) optional chaining on the receiver: `foo?.method(`
  const before = line.slice(Math.max(0, matchStart - 3), matchStart + 1);
  if (before.includes("?.")) return true;

  // 3) preceded by ?? coercion: `(foo ?? []).method(`
  const window = line.slice(Math.max(0, matchStart - 80), matchEnd + 5);
  for (const safePat of SAFE_PRECEDED_BY) {
    if (safePat.test(window)) return true;
  }

  return false;
}

function scanFile(path, results) {
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    return;
  }
  // Skip generated files
  if (path.includes("node_modules") || path.includes(".next") ||
      path.includes("dist") || path.includes("build")) return;

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Quick filter — only scan lines containing a method we care about
    if (!RISKY.some((m) => line.includes("." + m + "("))) continue;

    // Skip type annotations + import/export lines
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") ||
        trimmed.startsWith("import ") || trimmed.startsWith("export ")) continue;
    if (/^\s*type\s+|^\s*interface\s+/.test(line)) continue;

    RISKY_PAT.lastIndex = 0;
    let m;
    while ((m = RISKY_PAT.exec(line)) !== null) {
      const receiver = m[1];
      const method = m[2];
      // Whitelist receivers that can never be undefined
      const lastToken = receiver.replace(/.*[\.\)\]]/, "");
      if (NEVER_FLAG_RECEIVERS.has(lastToken)) continue;
      if (NEVER_FLAG_RECEIVERS.has(receiver)) continue;
      // String / number literals
      if (/^["'`].*["'`]$/.test(receiver)) continue;
      if (/^\d/.test(receiver)) continue;
      // Already-coerced via Array.isArray check upstream — heuristic: receiver
      // is a function call or property access including a clear coercion.
      if (/^(Array\.from|Object\.values|Object\.keys|Object\.entries)\b/.test(receiver)) continue;

      if (isLineSafe(line, m.index, m.index + m[0].length)) continue;

      results.push({
        file: path,
        line: i + 1,
        method,
        receiver: receiver.slice(-40),
        snippet: line.trim().slice(0, 120),
      });
    }
  }
}

function walkDir(dir, files) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch { return; }
  for (const e of entries) {
    if (e.startsWith(".") || e === "node_modules" || e === ".next" ||
        e === "dist" || e === "build") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      walkDir(full, files);
    } else if (FILE_EXTS.has(extname(full))) {
      files.push(full);
    }
  }
}

function main() {
  const args = argv.slice(2);
  const targets = args.length > 0 ? args : TARGETS;
  const files = [];
  for (const t of targets) {
    let st;
    try { st = statSync(t); } catch {
      console.error(`[skip] ${t} does not exist`);
      continue;
    }
    if (st.isDirectory()) walkDir(t, files);
    else files.push(t);
  }

  if (files.length === 0) {
    console.error("usage: lint_ui_defensive.mjs <path-or-dir> [more...]");
    exit(2);
  }

  const results = [];
  for (const f of files) scanFile(f, results);

  if (results.length === 0) {
    console.log(`OK rule 4.10: ${files.length} files scanned, no defensive-coding violations.`);
    exit(0);
  }

  console.log(`[fail] rule 4.10 — ${results.length} unsafe ${RISKY.join("/")} calls:\n`);
  for (const r of results.slice(0, 40)) {
    console.log(`  ${r.file}:${r.line}  .${r.method}() on ${r.receiver}`);
    console.log(`    ${r.snippet}`);
  }
  if (results.length > 40) console.log(`  …and ${results.length - 40} more`);
  console.log(`\nFix patterns:`);
  console.log(`  arr.map(...)              → (arr ?? []).map(...)`);
  console.log(`  str.replace(...)          → (str ?? "").replace(...)`);
  console.log(`  obj.method(...)           → obj?.method(...)`);
  console.log(`  num.toFixed(2)            → Number(num ?? 0).toFixed(2)`);
  console.log(`\nWhitelist with: // rule-4.10-exception: <reason>`);
  console.log(`See docs/methodology/ui-standards.md §4.10.`);
  exit(1);
}

main();
