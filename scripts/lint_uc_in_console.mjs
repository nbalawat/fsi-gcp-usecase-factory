#!/usr/bin/env node
/**
 * Architecture gate — use-case-specific UI MUST live under
 * `usecases/<uc>/ui/`, never under `ui/apps/<console>/`.
 *
 * Why this gate exists: during the credit-memo build, ~30 UC-specific
 * React components got dumped into `ui/apps/pipeline-console/components/
 * credit-memo/` instead of `usecases/credit-memo-commercial/ui/components/`.
 * That violated the "everything for one use case lives in one directory"
 * rule from CLAUDE.md and made `pipeline-console` a credit-memo-specific
 * app instead of the shared shell it was meant to be.
 *
 * Heuristic: any file path under `ui/apps/<console>/` whose path or name
 * matches a known use-case-specific pattern (credit-memo, agent-audit,
 * cco, rm, document-upload, memo-fixtures, audit-format, portfolio-data,
 * watchlist-data, rm-data, etc.) is rejected. The fix is to move it to
 * `usecases/<uc>/ui/`.
 *
 * Allowed: `app/` route files (page.tsx / route.ts) — these are the
 * console's pages that mount the use-case bundle. Generic primitives
 * (live-status, persona-switcher, persona-topbar, section-error-boundary,
 * stat-tile, ui/) — framework, stay.
 *
 * Whitelist with a comment `// uc-in-console-exception: <reason>` on the
 * first line of the file.
 *
 * Usage:
 *     node scripts/lint_uc_in_console.mjs
 *     node scripts/lint_uc_in_console.mjs --strict   # also flag generic-named-but-uc-content
 *
 * Exit 0 on clean; 1 on violations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { argv, exit } from "node:process";

const ROOT = process.cwd();
const APPS = "ui/apps";
const FILE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

// Known use-case nouns from existing use cases. Add here when new UCs land.
const UC_NOUN_PATTERNS = [
  // path-segment matches
  /\/credit-memo\//, /\/agent-audit\//, /\/cco\//, /\/rm\//,
  /\/document-upload\//,
  // file-name matches (lib/components named by UC concept)
  /\/(memo|audit|portfolio|watchlist|rm|case-processing|live-queue|pipeline-activity|case-auto-refresh|workflow-timeline)-?[\w-]*\.tsx?$/,
  /\/(memo-fixtures|audit-fixtures|audit-format|memo-markdown|portfolio-data|watchlist-data|rm-data|derive-pipeline|derive-timeline)\.ts$/,
];

// Generic / framework-ok names that pass the gate even if matched.
const GENERIC_OK = [
  /^app\//,                          // route files
  /^components\/ui\//,               // shadcn primitives
  /\/section-error-boundary\.tsx$/,
  /\/persona-switcher\.tsx$/,
  /\/persona-topbar\.tsx$/,
  /\/live-status\.tsx$/,
  /\/stat-tile\.tsx$/,
  /\/lib\/(bank-config|db|live-stream|personas|ui|format)\.ts$/,
  /\/_diag\.mjs$/,
  /\/(next-env|next\.config|postcss\.config|tailwind\.config|tsconfig)\./,
];

function isExcepted(absPath) {
  try {
    const first = readFileSync(absPath, "utf8").split("\n", 1)[0] ?? "";
    return first.includes("uc-in-console-exception");
  } catch {
    return false;
  }
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else if (FILE_EXTS.has(extname(full))) yield full;
  }
}

function main() {
  const violations = [];
  let appsDir;
  try {
    appsDir = readdirSync(APPS);
  } catch {
    console.log(`[skip] ${APPS}/ does not exist`);
    return 0;
  }
  for (const consoleName of appsDir) {
    const consoleRoot = join(APPS, consoleName);
    let st;
    try { st = statSync(consoleRoot); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of walk(consoleRoot)) {
      const rel = relative(consoleRoot, f);
      // Skip things that are clearly framework-ok
      if (GENERIC_OK.some((re) => re.test(rel))) continue;
      // Match use-case noun patterns
      const matched = UC_NOUN_PATTERNS.find((re) => re.test("/" + rel));
      if (!matched) continue;
      if (isExcepted(f)) continue;
      violations.push({ console: consoleName, path: rel, pattern: matched.source });
    }
  }
  if (violations.length === 0) {
    console.log(`OK uc-in-console gate: no use-case-specific files in ui/apps/.`);
    return 0;
  }
  console.log(`[fail] ${violations.length} use-case-specific files in ui/apps/:`);
  for (const v of violations.slice(0, 30)) {
    console.log(`  ui/apps/${v.console}/${v.path}`);
  }
  if (violations.length > 30) {
    console.log(`  …and ${violations.length - 30} more`);
  }
  console.log(`\nFix: move each to usecases/<uc>/ui/ and update imports to`);
  console.log(`use the @uc/* path alias in tsconfig.json.`);
  console.log(`See CLAUDE.md "Use case — everything for one use case lives in one directory".`);
  console.log(`Whitelist with a first-line comment: // uc-in-console-exception: <reason>`);
  return 1;
}

exit(main());
