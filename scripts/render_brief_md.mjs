#!/usr/bin/env node
// scripts/render_brief_md.mjs
//
// Renders a YAML brief to human-readable Markdown with embedded Mermaid
// state-machine diagram. Output: usecases/<uc>/brief.md
//
// Usage:
//   node scripts/render_brief_md.mjs <path-to-brief.yaml>
//
// Side effect: writes brief.md next to the brief.yaml input.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

function parseYaml(yamlPath) {
  const cmd = `python3 -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(open('${yamlPath}'))))"`;
  return JSON.parse(execSync(cmd, { encoding: "utf-8" }));
}

function escape(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function mermaidStateMachine(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return "(no stages defined)";
  const lines = ["stateDiagram-v2"];
  lines.push("    [*] --> " + stages[0].id);
  for (const s of stages) {
    if (Array.isArray(s.next_states)) {
      for (const n of s.next_states) {
        lines.push(`    ${s.id} --> ${n}`);
      }
    }
  }
  const terminal = stages.filter(
    (s) => !Array.isArray(s.next_states) || s.next_states.length === 0
  );
  for (const t of terminal) {
    lines.push(`    ${t.id} --> [*]`);
  }
  return lines.join("\n");
}

function table(headers, rows) {
  if (rows.length === 0) return "_(none)_";
  const sep = headers.map(() => "---").join(" | ");
  const head = headers.join(" | ");
  const body = rows.map((r) => r.map(escape).join(" | ")).join("\n");
  return `| ${head} |\n| ${sep} |\n| ${body.replace(/\n/g, " |\n| ")} |`;
}

function render(brief) {
  const lines = [];
  lines.push(`# ${brief.use_case_id} — brief`);
  lines.push("");
  lines.push(
    `_Schema v${brief.schema_version} · created ${brief.created_at} · last modified ${brief.last_modified} by ${brief.last_modified_by}_`
  );
  lines.push("");

  // 1. Problem
  lines.push("## 1. Problem framing");
  lines.push("");
  lines.push(`**Statement:** ${brief.problem.statement}`);
  lines.push("");
  lines.push(`**Current state:** ${brief.problem.current_state}`);
  lines.push("");
  lines.push(`**Future state:** ${brief.problem.future_state}`);
  lines.push("");
  lines.push("**Success metrics:**");
  lines.push("");
  lines.push(
    table(
      ["Metric", "Baseline", "Target", "Horizon"],
      (brief.problem.success_metrics || []).map((m) => [m.name, m.baseline, m.target, m.horizon])
    )
  );
  lines.push("");

  // 2. Stakeholders
  lines.push("## 2. Stakeholders + personas");
  lines.push("");
  const sp = brief.stakeholders.sponsor;
  lines.push(`**Sponsor:** ${sp.name} (${sp.title}, ${sp.org})`);
  lines.push("");
  lines.push("**Personas:**");
  lines.push("");
  lines.push(
    table(
      ["Persona", "Involvement", "Overlay notes"],
      (brief.stakeholders.personas || []).map((p) => [
        p.library_id,
        p.involvement,
        p.overlay?.notes || "",
      ])
    )
  );
  lines.push("");

  // 3. Process
  lines.push("## 3. Process + workflow");
  lines.push("");
  lines.push(`**Process area:** ${brief.process.area}`);
  lines.push("");
  lines.push(`**Console pattern:** ${brief.process.console_pattern}`);
  lines.push("");
  lines.push(`**Trigger event:** ${brief.process.trigger_event}`);
  lines.push("");
  lines.push("**State machine:**");
  lines.push("");
  lines.push("```mermaid");
  lines.push(mermaidStateMachine(brief.process.stages));
  lines.push("```");
  lines.push("");
  lines.push("**Stage detail:**");
  lines.push("");
  lines.push(
    table(
      ["Stage", "Name", "Entry trigger", "Exit condition", "Agents", "Services", "HITL"],
      (brief.process.stages || []).map((s) => [
        s.id,
        s.name,
        s.entry_trigger,
        s.exit_condition,
        (s.agents_active || []).join(", "),
        (s.services_called || []).join(", "),
        s.hitl_gate || "",
      ])
    )
  );
  lines.push("");

  // 4. Data sources
  lines.push("## 4. Data sources");
  lines.push("");
  lines.push(
    table(
      ["Source", "System", "Refresh", "Owner", "Access", "Quality issues", "PII"],
      (brief.data.sources || []).map((d) => [
        d.name,
        d.source_system,
        d.refresh_cadence,
        d.owner_team,
        d.access_method || "",
        (d.quality_issues || []).join("; "),
        (d.pii_fields || []).join(", "),
      ])
    )
  );
  lines.push("");

  // 5. Atomic services
  lines.push("## 5. Atomic services");
  lines.push("");
  lines.push(
    table(
      ["Name", "Reuse", "Purpose", "Existing path"],
      (brief.atomic_services || []).map((s) => [
        s.name,
        s.reuse_status,
        s.purpose,
        s.existing_service_path || "",
      ])
    )
  );
  lines.push("");

  // 6. Rules
  lines.push("## 6. Rules");
  lines.push("");
  lines.push(
    table(
      ["Name", "Reuse", "Purpose", "Citation"],
      (brief.rules || []).map((r) => [
        r.name,
        r.reuse_status,
        r.purpose,
        r.regulatory_citation || "",
      ])
    )
  );
  lines.push("");

  // 7. Agent envelope (the heavy section)
  lines.push("## 7. Agent operating envelope");
  lines.push("");
  lines.push("### 7.1 Decision points");
  lines.push("");
  lines.push(
    table(
      ["Decision", "Type", "Rationale", "Owner"],
      (brief.agent_envelope.decision_points || []).map((d) => [
        d.decision,
        d.type,
        d.rationale,
        d.owner_id || "",
      ])
    )
  );
  lines.push("");
  lines.push("### 7.2 Stage envelopes — what agents do/don't do per stage");
  lines.push("");
  for (const e of brief.agent_envelope.stage_envelopes || []) {
    lines.push(`**${e.stage_id} → ${e.agent_role}**`);
    lines.push("");
    lines.push("_does:_");
    for (const d of e.does) lines.push(`- ${d}`);
    lines.push("");
    lines.push("_does NOT:_");
    for (const d of e.does_not) lines.push(`- ${d}`);
    lines.push("");
  }
  lines.push("### 7.3 Agent sketches");
  lines.push("");
  for (const a of brief.agent_envelope.agent_sketches || []) {
    lines.push(`**${a.role}** — ${a.purpose} _(${a.model_provider}; reuse: ${a.reuse_status || "n/a"})_`);
    lines.push("");
    lines.push(
      table(
        ["Field", "Type", "Required", "Purpose"],
        (a.response_schema_fields || []).map((f) => [
          f.name,
          f.type,
          f.required === true ? "yes" : "no",
          f.purpose || "",
        ])
      )
    );
    lines.push("");
  }

  // 8. Sinks
  lines.push("## 8. Sinks");
  lines.push("");
  lines.push(
    table(
      ["Destination", "Purpose", "Trigger", "Irrevocable", "Retention"],
      (brief.sinks || []).map((s) => [
        s.destination,
        s.purpose,
        s.trigger,
        s.irrevocable === true ? "yes" : "no",
        s.retention_period || "",
      ])
    )
  );
  lines.push("");

  // 9. HITL gates
  lines.push("## 9. HITL gates");
  lines.push("");
  if ((brief.hitl_gates || []).length === 0) {
    lines.push("_(no human-in-the-loop gates — real-time / advisory UC)_");
  } else {
    lines.push(
      table(
        ["Gate", "Name", "Stage", "Irrevocable", "Approver", "Quorum", "Clock"],
        brief.hitl_gates.map((g) => [
          g.id,
          g.name,
          g.stage_id,
          g.irrevocable === true ? "yes" : "no",
          g.approver_role,
          g.quorum || "",
          g.clock ? `${g.clock.name} (${g.clock.duration})` : "",
        ])
      )
    );
  }
  lines.push("");

  // 10. Console + moments of truth
  lines.push("## 10. Console + moments-of-truth");
  lines.push("");
  lines.push(`**Pattern:** ${brief.console.pattern}`);
  lines.push("");
  lines.push(
    table(
      ["Screen", "User sees", "User acts"],
      (brief.console.moments_of_truth || []).map((m) => [m.screen, m.user_sees, m.user_acts])
    )
  );
  lines.push("");

  // 11. Compliance
  lines.push("## 11. Compliance");
  lines.push("");
  lines.push(`**Scope:** ${brief.compliance.scope}`);
  lines.push("");
  lines.push("**Regulations:**");
  lines.push("");
  for (const r of brief.compliance.regulations || []) {
    lines.push(`- \`${r.cite_key}\`${r.notes ? ` — ${r.notes}` : ""}`);
  }
  lines.push("");

  // 12. Model selection
  lines.push("## 12. Model selection + budgets");
  lines.push("");
  const m = brief.model_selection;
  lines.push(`- **Provider:** ${m.primary_provider}`);
  if (m.models) lines.push(`- **Models:** ${m.models.join(", ")}`);
  lines.push(`- **Structured output:** ${m.structured_output_strategy}`);
  if (m.cost_ceiling_per_case_usd != null)
    lines.push(`- **Cost ceiling per case:** $${m.cost_ceiling_per_case_usd}`);
  if (m.p99_latency_budget_ms != null)
    lines.push(`- **p99 latency budget:** ${m.p99_latency_budget_ms}ms`);
  lines.push("");

  // 13. SLOs + risks
  lines.push("## 13. SLOs + risks + rollback");
  lines.push("");
  lines.push("**SLOs:**");
  lines.push("");
  lines.push(
    table(
      ["Metric", "Target", "Error budget"],
      (brief.slos_risks_rollback.slos || []).map((s) => [s.metric, s.target, s.error_budget || ""])
    )
  );
  lines.push("");
  lines.push("**Top risks:**");
  lines.push("");
  lines.push(
    table(
      ["Risk", "Prob", "Impact", "Detection", "Rollback"],
      (brief.slos_risks_rollback.top_risks || []).map((r) => [
        r.risk,
        r.probability,
        r.impact,
        r.detection,
        r.rollback,
      ])
    )
  );
  lines.push("");

  // 14. Phasing
  lines.push("## 14. Phasing + out-of-scope");
  lines.push("");
  lines.push("**MVP scope:**");
  for (const x of brief.phasing.mvp_scope) lines.push(`- ${x}`);
  if ((brief.phasing.phase_2 || []).length) {
    lines.push("");
    lines.push("**Phase 2:**");
    for (const x of brief.phasing.phase_2) lines.push(`- ${x}`);
  }
  lines.push("");
  lines.push("**Out of scope:**");
  for (const x of brief.phasing.out_of_scope) lines.push(`- ${x}`);
  lines.push("");

  // Appendices
  lines.push("## A1. Predecessor / replacement");
  lines.push("");
  lines.push(`**Replaces:** ${brief.predecessor.replaces}`);
  lines.push("");
  if (brief.predecessor.replaces !== "greenfield") {
    lines.push(`**Migration plan:** ${brief.predecessor.migration_plan}`);
    if (brief.predecessor.retirement_date)
      lines.push(`**Retirement date:** ${brief.predecessor.retirement_date}`);
    if (brief.predecessor.parity_period_days != null)
      lines.push(`**Parity period:** ${brief.predecessor.parity_period_days} days`);
  }
  lines.push("");

  lines.push("## A2. Adjacent UCs / dependencies");
  lines.push("");
  lines.push("**Depends on:**");
  for (const d of brief.dependencies.depends_on || []) {
    lines.push(`- \`${d.uc_id}\` (${d.relationship})${d.notes ? ` — ${d.notes}` : ""}`);
  }
  lines.push("");
  lines.push("**Depended on by:**");
  for (const d of brief.dependencies.depended_on_by || []) {
    lines.push(`- \`${d.uc_id}\` (${d.relationship})${d.notes ? ` — ${d.notes}` : ""}`);
  }
  lines.push("");

  lines.push("## A3. Glossary");
  lines.push("");
  for (const g of brief.glossary || []) {
    lines.push(`- **${g.term}** — ${g.definition}${g.source ? ` _(${g.source})_` : ""}`);
  }
  lines.push("");

  lines.push("## A4. Reuse map + economics projection (auto-generated)");
  lines.push("");
  const rm = brief.reuse_map;
  lines.push(`_Generated ${rm.generated_at}_`);
  lines.push("");
  if (rm.reuse_rate_atomic_pct != null)
    lines.push(`- **Atomic service reuse rate:** ${rm.reuse_rate_atomic_pct.toFixed(0)}%`);
  if (rm.reuse_rate_agents_pct != null)
    lines.push(`- **Agent archetype reuse rate:** ${rm.reuse_rate_agents_pct.toFixed(0)}%`);
  if ((rm.candidates_to_review || []).length > 0) {
    lines.push("");
    lines.push("**Candidates the scanner found that you didn't already adopt:**");
    for (const c of rm.candidates_to_review) {
      lines.push(
        `- \`${c.candidate}\` (${c.kind}) — matched on \`${c.matched_brief_field}\` with confidence ${(c.match_confidence * 100).toFixed(0)}%`
      );
    }
  }
  lines.push("");
  const ep = brief.economics_projection;
  if (ep.projected_cost_per_case_usd != null)
    lines.push(`- **Projected cost / case:** $${ep.projected_cost_per_case_usd.toFixed(3)}`);
  if (ep.projected_p99_ms != null)
    lines.push(`- **Projected p99 wall-time:** ${ep.projected_p99_ms}ms`);
  if ((ep.assumptions || []).length > 0) {
    lines.push("");
    lines.push("**Assumptions:**");
    for (const a of ep.assumptions) lines.push(`- ${a}`);
  }
  lines.push("");

  return lines.join("\n");
}

function main() {
  const briefPath = process.argv[2];
  if (!briefPath) {
    console.error("Usage: render_brief_md.mjs <path-to-brief.yaml>");
    process.exit(1);
  }
  if (!existsSync(briefPath)) {
    console.error(`Brief not found: ${briefPath}`);
    process.exit(1);
  }
  const brief = parseYaml(briefPath);
  const md = render(brief);
  const outPath = join(dirname(briefPath), "brief.md");
  writeFileSync(outPath, md);
  console.log(`✓ wrote ${outPath}`);
}

main();
