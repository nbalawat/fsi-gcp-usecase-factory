#!/usr/bin/env node
// scripts/derive_legacy_canvas.mjs
//
// Derives onboarding/<uc>.yaml (the legacy lightweight canvas) from a
// usecases/<uc>/brief.yaml. Keeps backward compatibility for downstream
// skills (init-use-case, design-proposals) that still consume the
// legacy canvas shape.
//
// Usage:
//   node scripts/derive_legacy_canvas.mjs <path-to-brief.yaml>
//
// Side effect: writes onboarding/<uc>.yaml at repo root.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseYaml(yamlPath) {
  const cmd = `python3 -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(open('${yamlPath}'))))"`;
  return JSON.parse(execSync(cmd, { encoding: "utf-8" }));
}

function toYaml(obj) {
  // Use python yaml.safe_dump for stable formatting that matches the rest of the repo
  const tmp = `/tmp/derive-${Date.now()}.json`;
  writeFileSync(tmp, JSON.stringify(obj));
  const cmd = `python3 -c "import yaml, json; print(yaml.safe_dump(json.load(open('${tmp}')), default_flow_style=False, sort_keys=False))"`;
  const result = execSync(cmd, { encoding: "utf-8" });
  return result;
}

function deriveLegacyCanvas(brief) {
  // Map brief sections back to the legacy onboarding-canvas shape so that
  // existing skills (init-use-case, design-proposals) keep working.
  // Only the fields they actually consume are populated.
  const sharedAtomic = (brief.atomic_services || [])
    .filter((s) => s.reuse_status === "reuse-existing" || s.reuse_status === "extend-existing")
    .map((s) => s.name);
  const netNewAtomic = (brief.atomic_services || [])
    .filter((s) => s.reuse_status === "net-new")
    .map((s) => ({ name: s.name, purpose: s.purpose }));
  const sharedAgents = (brief.agent_envelope?.agent_sketches || [])
    .filter((a) => a.reuse_status === "reuse-archetype" || a.reuse_status === "extend-archetype")
    .map((a) => a.archetype_id)
    .filter(Boolean);
  const netNewAgents = (brief.agent_envelope?.agent_sketches || [])
    .filter((a) => a.reuse_status === "net-new")
    .map((a) => ({ name: a.role, purpose: a.purpose }));
  const sharedRules = (brief.rules || [])
    .filter((r) => r.reuse_status === "reuse-existing" || r.reuse_status === "extend-existing")
    .map((r) => r.name);
  const netNewRules = (brief.rules || [])
    .filter((r) => r.reuse_status === "net-new")
    .map((r) => ({
      name: r.name,
      citation: r.regulatory_citation || "",
      inputs_sketch: r.inputs_sketch || "",
    }));

  return {
    "# Auto-derived from": `usecases/${brief.use_case_id}/brief.yaml`,
    "# Do NOT edit": "this file directly; edit the brief via /fsi-onboard",
    use_case_id: brief.use_case_id,
    schema_version: "1.0.0",
    created_at: brief.created_at,
    console_pattern: brief.console?.pattern || brief.process?.console_pattern,
    use_case_archetype: null, // legacy field; not derivable from brief
    hitl_gates: (brief.hitl_gates || []).map((g) => g.id),
    atomic_services_reused: sharedAtomic,
    net_new_atomic_services: netNewAtomic,
    multi_agent_pattern: null, // legacy field; derived downstream
    agent_archetypes_reused: sharedAgents,
    net_new_agents: netNewAgents,
    shared_rules_reused: sharedRules,
    net_new_rules: netNewRules,
    model_provider:
      brief.model_selection?.primary_provider === "vertex-gemini"
        ? "vertex_gemini"
        : brief.model_selection?.primary_provider === "anthropic-claude"
          ? "anthropic"
          : "hybrid",
    provider_prereqs_confirmed: brief.model_selection?.prereqs_confirmed || [],
    provider_prereqs_pending: [],
    compliance_scope: brief.compliance?.scope || "lightweight",
    eval_framework_wired: true,
    derived_from_brief: true,
  };
}

function main() {
  const briefPath = process.argv[2];
  if (!briefPath) {
    console.error("Usage: derive_legacy_canvas.mjs <path-to-brief.yaml>");
    process.exit(1);
  }
  if (!existsSync(briefPath)) {
    console.error(`Brief not found: ${briefPath}`);
    process.exit(1);
  }
  const brief = parseYaml(briefPath);
  const canvas = deriveLegacyCanvas(brief);
  const onboardingDir = join(REPO_ROOT, "onboarding");
  if (!existsSync(onboardingDir)) mkdirSync(onboardingDir, { recursive: true });
  const outPath = join(onboardingDir, `${brief.use_case_id}.yaml`);
  writeFileSync(outPath, toYaml(canvas));
  console.log(`✓ wrote ${outPath}`);
}

main();
