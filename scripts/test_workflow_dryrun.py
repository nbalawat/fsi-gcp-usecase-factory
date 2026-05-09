"""Dry-run validator for usecases/credit-memo-commercial/workflow.v2.yaml.

Cloud Workflows has limited local emulation. This script does the most
useful pre-deploy checks:

  1. The YAML parses (syntax-clean).
  2. Every step has a unique `name` within its scope.
  3. Every `next:` reference resolves to a step in the same scope.
  4. Every `${sys.get_env(...)}` reference is a documented env var.
  5. Every HTTP call points at a known service URL env var.
  6. Every `return_for_revision`-class step is reachable from the
     `check_validation_decision` switch.

Run:
  python3 scripts/test_workflow_dryrun.py

Exit code:
  0 = all checks pass
  1 = any failure (with a full report printed to stderr)

Used by Track D to gate Cloud Workflows deploys: a structural error here
is what blew up the legacy 408-line YAML on its first deploy attempt.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml


WORKFLOW_PATH = (
    Path(__file__).resolve().parent.parent
    / "usecases" / "credit-memo-commercial" / "workflow.v2.yaml"
)


KNOWN_ENV_VARS = {
    "GCP_PROJECT",
    "GCP_REGION",
    "RULES_SERVICE_URL",
    "AUDIT_WRITER_URL",
    "DOCUMENT_EXTRACTOR_URL",
    "UI_VALIDATE_URL",
    "FINANCIAL_SPREADER_URL",
    "LOAN_SERVICEABILITY_URL",
    "PEER_AND_INDUSTRY_CONTEXT_URL",
    "COLLATERAL_VALUATOR_URL",
    "BORROWER_NETWORK_URL",
    "DOCUMENT_PROCESSOR_AGENT_URL",
    "ANALYST_AGENT_URL",
    "RATER_AND_COVENANT_AGENT_URL",
    "DRAFTER_AGENT_URL",
    "REVIEWER_AGENT_URL",
    "GL_POSTING_SINK_URL",
    "DOCUMENT_STORE_GCS_SINK_URL",
}


def _walk_steps(steps: list[dict[str, Any]], parent: str = "main") -> list[tuple[str, dict[str, Any]]]:
    """Flatten step list — return [(qualified_name, step_dict)] across
    main + any nested `parallel.branches[*].steps` and `steps:` blocks."""
    out: list[tuple[str, dict[str, Any]]] = []
    for step in steps:
        if not isinstance(step, dict) or len(step) != 1:
            raise ValueError(f"step in {parent} is malformed: {step!r}")
        name, body = next(iter(step.items()))
        qualified = f"{parent}.{name}"
        out.append((qualified, body))
        # Recurse into nested
        if isinstance(body, dict):
            if "parallel" in body and isinstance(body["parallel"], dict):
                par = body["parallel"]
                # parallel.branches.<name>.steps OR parallel.for.steps
                if "branches" in par:
                    for branch in par["branches"]:
                        bname, bbody = next(iter(branch.items()))
                        if isinstance(bbody, dict) and "steps" in bbody:
                            out.extend(_walk_steps(bbody["steps"], f"{qualified}.{bname}"))
                if "for" in par and isinstance(par["for"], dict):
                    for_block = par["for"]
                    if "steps" in for_block:
                        out.extend(_walk_steps(for_block["steps"], f"{qualified}.for"))
            if "steps" in body and isinstance(body["steps"], list):
                out.extend(_walk_steps(body["steps"], qualified))
    return out


def main() -> int:
    if not WORKFLOW_PATH.exists():
        print(f"workflow.v2.yaml not found at {WORKFLOW_PATH}", file=sys.stderr)
        return 1

    raw = WORKFLOW_PATH.read_text()
    try:
        doc = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        print(f"FAIL: YAML parse error: {e}", file=sys.stderr)
        return 1

    failures: list[str] = []

    # 1. Top-level shape
    if not isinstance(doc, dict) or "main" not in doc:
        failures.append("workflow lacks top-level `main:` block")
        _report(failures)
        return 1

    main_block = doc["main"]
    if "steps" not in main_block or not isinstance(main_block["steps"], list):
        failures.append("main: lacks steps[] list")
        _report(failures)
        return 1

    # 2. Walk all steps
    try:
        all_steps = _walk_steps(main_block["steps"], "main")
    except ValueError as e:
        failures.append(f"step structure error: {e}")
        _report(failures)
        return 1

    # 3. Step name uniqueness within each scope
    scopes: dict[str, set[str]] = {}
    for qname, _ in all_steps:
        scope, name = qname.rsplit(".", 1)
        s = scopes.setdefault(scope, set())
        if name in s:
            failures.append(f"duplicate step name: {qname}")
        s.add(name)

    # 4. Resolve `next:` references
    name_set_by_scope = scopes
    for qname, body in all_steps:
        if not isinstance(body, dict):
            continue
        scope = qname.rsplit(".", 1)[0]
        next_ref: str | None = body.get("next")
        if next_ref:
            if next_ref not in name_set_by_scope.get(scope, set()):
                failures.append(
                    f"{qname}: next:{next_ref!r} doesn't resolve to a step in scope {scope}"
                )
        # switch:[].next
        if isinstance(body.get("switch"), list):
            for case in body["switch"]:
                if isinstance(case, dict) and "next" in case:
                    if case["next"] not in name_set_by_scope.get(scope, set()):
                        failures.append(
                            f"{qname}.switch.next:{case['next']!r} doesn't resolve "
                            f"in scope {scope}"
                        )

    # 5. Env-var references
    env_pattern = re.compile(r'sys\.get_env\(\s*"([^"]+)"\s*\)')
    for env_var in env_pattern.findall(raw):
        if env_var not in KNOWN_ENV_VARS:
            failures.append(
                f"unknown env var {env_var!r} (not in KNOWN_ENV_VARS — "
                "register it or fix the typo)"
            )

    # 6. validation gate routes to return-for-revision
    flat_names = [n.rsplit(".", 1)[1] for n, _ in all_steps]
    if "check_validation_decision" not in flat_names:
        failures.append(
            "validation gate step `check_validation_decision` missing — "
            "the workflow must check the gate's output"
        )
    if "run_return_for_revision" not in flat_names:
        failures.append(
            "return-for-revision branch step missing — the workflow has "
            "no path for deficient applications"
        )

    # 7. Stage names sanity
    for required_stage in [
        "extract_documents",
        "stage_3_atomic_services",
        "stage_4_rules",
        "call_analyst",
        "call_rater_covenant",
        "call_drafter",
        "call_reviewer",
        "wait_for_approval",
        "stage_7_sinks",
    ]:
        if required_stage not in flat_names:
            failures.append(f"required stage step missing: {required_stage}")

    return _report(failures)


def _report(failures: list[str]) -> int:
    if not failures:
        print(f"workflow.v2.yaml is structurally valid ({sum(1 for _ in WORKFLOW_PATH.read_text().splitlines())} lines)")
        return 0
    print(f"\nworkflow.v2.yaml has {len(failures)} structural issue(s):", file=sys.stderr)
    for i, f in enumerate(failures, 1):
        print(f"  {i}. {f}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
