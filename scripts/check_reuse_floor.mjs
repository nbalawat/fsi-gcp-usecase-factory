#!/usr/bin/env node
// scripts/check_reuse_floor.mjs
//
// Hard gate: every design-proposal option must reuse ≥5 shared/use-case
// components from ui/packages/components/ or usecases/<uc>/ui/components/.
//
// Options below the floor fail and do NOT deploy. The skill captures the
// failure in .fsi-state/<uc>/proposals/<option>.failed and the comparator
// renders the option as failed-to-build (with the reuse-floor reason
// instead of a tsc/Docker error).
//
// Rationale: the whole point of running 4 sealed agents is that they each
// produce a DIFFERENT layout/density/affordance — using the SAME primitive
// components. Without a reuse floor, designers re-invent buttons and cards,
// which (a) creates drift, (b) loses Atrium token consistency, (c) makes
// the 4 options harder to compare (the data confound is now 'different
// primitives' instead of 'different design').
//
// Usage:
//   node scripts/check_reuse_floor.mjs <use_case>
//
// Exit codes:
//   0 = every present option meets the floor
//   1 = at least one option failed
//   2 = usage error

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOOR = 5;

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

function upsertBuildField(manifestPath, key, value) {
  let src = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : "";
  const newLine = `  ${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`;
  // If build: already exists, append under it (and remove any prior occurrence of this key)
  if (/^build:\s*$/m.test(src) || /^build:\s*\n/m.test(src)) {
    const keyPattern = new RegExp(`^\\s{2}${key}:[^\n]*\n`, "m");
    src = src.replace(keyPattern, "");
    src = src.replace(/(^build:\s*\n)/m, `$1${newLine}\n`);
  } else {
    if (!src.endsWith("\n")) src += "\n";
    src += `build:\n${newLine}\n`;
  }
  writeFileSync(manifestPath, src);
}

const uc = process.argv[2];
if (!uc) {
  console.error("usage: node scripts/check_reuse_floor.mjs <use_case>");
  process.exit(2);
}

const ucDir = join(REPO, "usecases", uc, "ui", "proposals");
if (!existsSync(ucDir)) {
  console.error(`no proposals dir at ${ucDir}; run /fsi-design-proposals ${uc} first`);
  process.exit(2);
}

const results = {};
let anyFailed = false;
const optionDirs = readdirSync(ucDir).filter(d => /^option-[a-f]$/.test(d)).sort();

for (const optDir of optionDirs) {
  const opt = optDir.slice(-1);
  const manifestPath = join(ucDir, optDir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    results[opt] = { ok: false, error: "no manifest.yaml" };
    anyFailed = true;
    console.log(`  option ${opt.toUpperCase()}: ✗ manifest missing`);
    continue;
  }

  let manifest;
  try { manifest = loadYaml(readFileSync(manifestPath, "utf-8")); }
  catch (e) {
    results[opt] = { ok: false, error: `manifest parse: ${e.message}` };
    anyFailed = true;
    console.log(`  option ${opt.toUpperCase()}: ✗ manifest unparseable`);
    continue;
  }

  const components = manifest.components_used ?? [];
  const sharedCount = components.filter(c => c?.source === "shared" || c?.source === "use-case").length;
  const netNewCount = components.filter(c => c?.source === "net-new").length;
  const meets = sharedCount >= FLOOR;

  results[opt] = { ok: meets, sharedCount, netNewCount };

  upsertBuildField(manifestPath, "reuse_floor_met", meets);
  upsertBuildField(manifestPath, "reuse_count_shared", sharedCount);
  upsertBuildField(manifestPath, "reuse_count_net_new", netNewCount);

  if (!meets) {
    anyFailed = true;
    // Stamp .failed sentinel under .fsi-state so the deploy stage skips this option
    const stateDir = join(REPO, ".fsi-state", uc, "proposals");
    if (existsSync(stateDir)) {
      writeFileSync(join(stateDir, `${opt}.failed`),
        `reuse-floor: ${sharedCount} shared components, need ≥${FLOOR}\n`);
    }
    console.log(`  option ${opt.toUpperCase()}: ✗ FAIL — ${sharedCount} shared (floor ${FLOOR}); net-new ${netNewCount}`);
  } else {
    console.log(`  option ${opt.toUpperCase()}: ✓ ${sharedCount} shared (floor ${FLOOR}); net-new ${netNewCount}`);
  }
}

console.log("");
console.log(`floor=${FLOOR}; ${Object.values(results).filter(r => r.ok).length}/${optionDirs.length} options pass`);

console.error(JSON.stringify({ use_case: uc, floor: FLOOR, results, any_failed: anyFailed }));

process.exit(anyFailed ? 1 : 0);
