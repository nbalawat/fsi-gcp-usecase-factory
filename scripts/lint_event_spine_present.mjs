#!/usr/bin/env node
/**
 * Rule 4.16 — live event spine visible on case-detail pages.
 *
 * Every `app/cases/[id]/page.tsx` (or equivalent case-detail route)
 * that fetches live state must include a `<PipelineActivity>` (or
 * equivalent named-event-spine) panel rendered by default. A page
 * that fetches live data but doesn't show the user the events
 * landing is one bug report away from "the page is hung".
 *
 * Heuristic: every page file under `app/cases/[id]/` and
 * `app/(<persona>)/cases/[id]/` must either:
 *   (a) import a known event-spine component
 *       (PipelineActivity / EventStreamPanel / WorkflowTimeline)
 *   (b) carry a first-line comment `// rule-4.16-exception: <reason>`
 *
 * Usage:
 *     node scripts/lint_event_spine_present.mjs
 *     node scripts/lint_event_spine_present.mjs ui/apps/pipeline-console
 *
 * Exit 0 on clean; 1 on violations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { argv, exit } from "node:process";

const DEFAULT_ROOTS = ["ui/apps"];
const KNOWN_SPINES = [
  "PipelineActivity",
  "EventStreamPanel",
  "WorkflowTimeline",
  "CaseProcessingPanel",  // common for in-flight case state
];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else if (extname(full) === ".tsx") yield full;
  }
}

function isCaseDetailPage(rel) {
  // Match app/cases/[id]/page.tsx, app/(persona)/cases/[id]/page.tsx, etc.
  if (!rel.endsWith("page.tsx")) return false;
  return /\/cases\/\[(id|application_id|app_id)\]\//.test("/" + rel) ||
         /\/cases\/\[\w+\]\/page\.tsx$/.test(rel);
}

function hasEventSpine(src) {
  if (src.includes("rule-4.16-exception")) return true;
  return KNOWN_SPINES.some((name) =>
    new RegExp(`<${name}\\b`).test(src) ||
    new RegExp(`import\\s+\\{[^}]*\\b${name}\\b`).test(src),
  );
}

function main() {
  const args = argv.slice(2);
  const roots = args.length > 0 ? args : DEFAULT_ROOTS;
  const violations = [];
  let checked = 0;

  for (const root of roots) {
    let st;
    try { st = statSync(root); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of walk(root)) {
      const rel = relative(".", f);
      if (!isCaseDetailPage(rel)) continue;
      checked += 1;
      let src;
      try { src = readFileSync(f, "utf8"); } catch { continue; }
      if (!hasEventSpine(src)) violations.push(rel);
    }
  }

  if (violations.length === 0) {
    console.log(`OK rule 4.16: ${checked} case-detail pages have an event-spine panel.`);
    return 0;
  }
  console.log(`[fail] rule 4.16 — ${violations.length} case-detail page(s) missing an event-spine panel:`);
  for (const v of violations) console.log(`  ${v}`);
  console.log(`\nFix: import and render <PipelineActivity> (or another known spine).`);
  console.log(`Whitelist with first-line: // rule-4.16-exception: <reason>`);
  console.log(`See docs/methodology/ui-standards.md §4.16 + .claude/skills/event-spine-ui/`);
  return 1;
}

exit(main());
