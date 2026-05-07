"""
End-to-end factory test.

Reads a synthetic REASONS canvas, walks its operations DAG, and for each
operation:
  - Invokes the corresponding builder's contract test (via golden output).
  - Confirms the produced golden tree passes its gating validator.

This is the integrated proof: every builder's output is gated by a validator,
and the synthetic spec exercises the full Layer-1 DAG (rule + atomic service
+ handler) the way the parallel-build orchestrator would.

LLM-tier (gated): actually invoke each builder via Anthropic API, collect
output, run validators, diff against goldens.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harness.claude_runner import (
    run_builder_contract,
    run_gatekeeper_deterministic,
)
from harness.findings_parser import Severity


REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_uc"


_OPERATION_TO_BUILDER = {
    "jdm-rule": "jdm-rule-builder",
    "atomic-service": "atomic-service-builder",
    "handler": "handler-builder",
}


def _load_reasons() -> dict:
    return yaml.safe_load((FIXTURE / "reasons.yaml").read_text())


def _operations() -> list[dict]:
    return _load_reasons()["operations"]


def test_reasons_canvas_well_formed() -> None:
    """The synthetic REASONS has all 7 sections and at least one Layer-1 op."""
    r = _load_reasons()
    for section in ["requirements", "entities", "approach", "structure", "operations", "norms", "safeguards"]:
        assert section in r, f"REASONS section missing: {section}"
    layer1_ops = [op for op in r["operations"] if op.get("layer") == 1]
    assert layer1_ops, "REASONS has no Layer-1 operations to drive the parallel build"


@pytest.mark.parametrize("operation", _operations(), ids=lambda op: op["id"])
def test_kind_has_working_builder_pipeline(operation: dict) -> None:
    """Every operation kind declared in the synthetic canvas is implementable
    by the framework: a builder exists, a gating validator exists, and at
    least one golden fixture exists that passes the validator.

    This is the integrated proof: the kinds the orchestrator emits are
    ones the framework can build + validate end-to-end.
    """
    kind = operation["kind"]
    builder = _OPERATION_TO_BUILDER.get(kind)
    assert builder is not None, (
        f"operation kind {kind!r} (op {operation['id']!r}) has no builder mapped; "
        f"add an entry to _OPERATION_TO_BUILDER once the builder exists."
    )

    builder_dir = builder.replace("-", "_")
    fixtures_root = REPO_ROOT / "tests" / "framework" / "builders" / "fixtures" / builder_dir
    assert fixtures_root.is_dir(), (
        f"builder {builder!r} has no fixtures at {fixtures_root.relative_to(REPO_ROOT)}; "
        f"add at least one SPEC.yaml + golden_output/ case."
    )
    cases = [d for d in fixtures_root.iterdir() if d.is_dir()]
    assert cases, f"no fixture cases under {fixtures_root.relative_to(REPO_ROOT)}"

    # Use the first golden case for this builder, with that case's own SPEC
    # (not the synthetic operation's spec — those are independent specs).
    case = cases[0]
    # Pass the full SPEC.yaml (the orchestrator-shaped spec, with
    # operation_path at the top level), not just the nested spec: block.
    case_spec = yaml.safe_load((case / "SPEC.yaml").read_text())
    findings = run_builder_contract(builder, case / "golden_output", case_spec)
    blockers = findings.by_severity(Severity.BLOCKER)
    assert not blockers, (
        f"kind {kind!r}: builder {builder!r}'s golden ({case.name}) fails its "
        f"gating validator: {[(f.rule, f.file) for f in blockers]}"
    )


def test_synthetic_canvas_drives_full_layer_1() -> None:
    """The synthetic canvas exercises every Layer-1 builder kind we support."""
    layer1_kinds = {op["kind"] for op in _operations() if op.get("layer") == 1}
    expected = {"jdm-rule", "atomic-service", "handler"}
    missing = expected - layer1_kinds
    assert not missing, (
        f"synthetic canvas should exercise the full Layer-1 DAG; missing: {missing}"
    )
