#!/usr/bin/env node
// scripts/validate_brief.mjs
//
// Validates a use case brief against brief-schema.json.
// Belt-and-suspenders: JSON-schema structural validation + word-count check
// on required prose fields. Used by /fsi-onboard's hard save-gate.
//
// Exit codes:
//   0 — brief passes both gates
//   1 — schema validation failed
//   2 — word-count / stub-content failed
//   3 — invalid invocation
//
// Usage:
//   node scripts/validate_brief.mjs <path-to-brief.yaml>
//
// Output: JSON to stdout summarising pass/fail + per-field diagnostics

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SCHEMA_PATH = join(
  REPO_ROOT,
  ".claude/skills/fsi-onboard/assets/brief-schema.json"
);

// Minimal YAML parser — we only need to handle the subset the brief produces.
// To avoid adding a runtime dep, we shell out to python3 -c "import yaml; ..."
// which is universal on dev + CI machines.
import { execSync } from "node:child_process";

function parseYaml(yamlPath) {
  const cmd = `python3 -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(open('${yamlPath}'))))"`;
  try {
    const out = execSync(cmd, { encoding: "utf-8" });
    return JSON.parse(out);
  } catch (e) {
    throw new Error(`Failed to parse YAML at ${yamlPath}: ${e.message}`);
  }
}

// ── stub detection (word-count + bad phrases) ────────────────────────
const STUB_PATTERNS = [
  /^\s*tbd\s*$/i,
  /^\s*todo\s*$/i,
  /^\s*n\/?a\s*$/i,
  /^\s*see above\s*$/i,
  /^\s*\?+\s*$/,
  /^\s*xxx\s*$/i,
  /^\s*placeholder\s*$/i,
];

function isStub(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return STUB_PATTERNS.some((p) => p.test(trimmed));
}

function wordCount(value) {
  if (typeof value !== "string") return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// Walks the schema; if a field has a minLength, asserts content meets it AND
// isn't a stub phrase.
function walkAndCheckProse(data, schema, path = "") {
  const errors = [];

  if (!schema || typeof schema !== "object") return errors;

  if (schema.type === "string" && schema.minLength && data !== undefined && data !== null) {
    if (isStub(data)) {
      errors.push({ path, message: `stub phrase ("${data.trim()}") rejected; provide real content` });
    } else if (typeof data === "string" && data.trim().length < schema.minLength) {
      errors.push({
        path,
        message: `field too short (${data.trim().length} chars; need ≥${schema.minLength})`,
      });
    }
  }

  if (schema.type === "object" && data && typeof data === "object") {
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      walkAndCheckProse(data[k], sub, path ? `${path}.${k}` : k).forEach((e) =>
        errors.push(e)
      );
    }
  }

  if (schema.type === "array" && Array.isArray(data) && schema.items) {
    data.forEach((item, idx) => {
      walkAndCheckProse(item, schema.items, `${path}[${idx}]`).forEach((e) =>
        errors.push(e)
      );
    });
  }

  return errors;
}

// ── JSON schema validation (minimal, no AJV dep) ──────────────────────
//
// Implements: required, type, enum, const, minLength, minItems, maxItems,
// pattern, additionalProperties. Skips $ref / oneOf / format (we don't use
// them in brief-schema.json).
function validateAgainstSchema(data, schema, path = "") {
  const errors = [];

  if (!schema || typeof schema !== "object") return errors;

  if (schema.const !== undefined && data !== schema.const) {
    errors.push({ path, message: `expected const ${JSON.stringify(schema.const)}; got ${JSON.stringify(data)}` });
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `value ${JSON.stringify(data)} not in enum [${schema.enum.join(", ")}]` });
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
    const matches = types.some((t) => {
      if (t === "integer") return Number.isInteger(data);
      if (t === "number") return typeof data === "number";
      return t === actual;
    });
    if (!matches && data !== undefined) {
      errors.push({ path, message: `wrong type: expected ${types.join("|")}; got ${actual}` });
    }
  }

  if (schema.type === "object" && data && typeof data === "object") {
    (schema.required || []).forEach((req) => {
      if (data[req] === undefined) {
        errors.push({ path: path ? `${path}.${req}` : req, message: "required field missing" });
      }
    });

    if (schema.additionalProperties === false) {
      for (const k of Object.keys(data)) {
        if (!schema.properties || !(k in schema.properties)) {
          errors.push({ path: path ? `${path}.${k}` : k, message: "unknown property (additionalProperties: false)" });
        }
      }
    }

    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (data[k] !== undefined) {
        validateAgainstSchema(data[k], sub, path ? `${path}.${k}` : k).forEach((e) =>
          errors.push(e)
        );
      }
    }
  }

  if (schema.type === "array" && Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) {
      errors.push({ path, message: `too few items: ${data.length} (need ≥${schema.minItems})` });
    }
    if (schema.maxItems != null && data.length > schema.maxItems) {
      errors.push({ path, message: `too many items: ${data.length} (max ${schema.maxItems})` });
    }
    if (schema.items) {
      data.forEach((item, idx) => {
        validateAgainstSchema(item, schema.items, `${path}[${idx}]`).forEach((e) =>
          errors.push(e)
        );
      });
    }
  }

  if (schema.pattern && typeof data === "string") {
    if (!new RegExp(schema.pattern).test(data)) {
      errors.push({ path, message: `string does not match pattern ${schema.pattern}` });
    }
  }

  return errors;
}

// ── persona library cross-check ──────────────────────────────────────
function validatePersonaReferences(data) {
  const errors = [];
  const personas = data?.stakeholders?.personas;
  if (!Array.isArray(personas)) return errors;
  const personasDir = join(REPO_ROOT, "libraries/personas");
  for (const [idx, p] of personas.entries()) {
    if (!p.library_id) continue;
    const expected = join(personasDir, `${p.library_id}.yaml`);
    if (!existsSync(expected)) {
      errors.push({
        path: `stakeholders.personas[${idx}].library_id`,
        message: `persona library entry not found at ${expected}`,
      });
    }
  }
  return errors;
}

// ── main ─────────────────────────────────────────────────────────────
function main() {
  const briefPath = process.argv[2];
  if (!briefPath) {
    console.error("Usage: validate_brief.mjs <path-to-brief.yaml>");
    process.exit(3);
  }
  if (!existsSync(briefPath)) {
    console.error(`Brief not found: ${briefPath}`);
    process.exit(3);
  }
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`Schema not found: ${SCHEMA_PATH}`);
    process.exit(3);
  }

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const data = parseYaml(briefPath);

  const structural = validateAgainstSchema(data, schema);
  const prose = walkAndCheckProse(data, schema);
  const personas = validatePersonaReferences(data);

  const report = {
    brief: briefPath,
    schema: SCHEMA_PATH,
    structural_errors: structural,
    prose_errors: prose,
    persona_reference_errors: personas,
    pass: structural.length === 0 && prose.length === 0 && personas.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (structural.length > 0) process.exit(1);
  if (prose.length > 0 || personas.length > 0) process.exit(2);
  process.exit(0);
}

main();
