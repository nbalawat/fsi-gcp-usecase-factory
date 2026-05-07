"""console-config-builder contract tests.

Unlike service/agent builders, console_config_builder doesn't gate via a
validator agent — its output is a single structural YAML. The contract test
validates the YAML's required keys and component-binding shape.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml


BUILDER = "console-config-builder"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "console_config_builder"

VALID_CONSOLE_PATTERNS = {
    "pipeline-console", "realtime-console", "investigations-console",
    "surveillance-console", "run-console", "recommendations-console",
}


def _all_cases() -> list[Path]:
    return sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())


def _load_spec(case: Path) -> dict:
    return yaml.safe_load((case / "SPEC.yaml").read_text())


def _load_golden_yaml(case: Path) -> dict:
    # Single top-level console.yaml under usecases/<uc>/ui/
    yamls = list(case.glob("golden_output/usecases/*/ui/console.yaml"))
    assert len(yamls) == 1, f"expected exactly one console.yaml; got {len(yamls)}"
    return yaml.safe_load(yamls[0].read_text())


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_has_required_keys(case: Path) -> None:
    cfg = _load_golden_yaml(case)
    for key in ["console_pattern", "use_case_id", "title", "data_sources", "layout", "theme"]:
        assert key in cfg, f"console.yaml missing required key: {key}"


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_console_pattern_valid(case: Path) -> None:
    cfg = _load_golden_yaml(case)
    assert cfg["console_pattern"] in VALID_CONSOLE_PATTERNS, (
        f"console_pattern={cfg['console_pattern']!r} not in {sorted(VALID_CONSOLE_PATTERNS)}"
    )


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_layout_components_have_component_field(case: Path) -> None:
    cfg = _load_golden_yaml(case)
    components = cfg.get("layout", {}).get("components", [])
    assert components, "layout.components must be non-empty"
    for c in components:
        assert "component" in c, f"layout entry missing 'component': {c}"


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_matches_spec_console_pattern(case: Path) -> None:
    spec = _load_spec(case)
    cfg = _load_golden_yaml(case)
    expected = spec["spec"]["console_pattern"]
    assert cfg["console_pattern"] == expected, (
        f"golden console_pattern={cfg['console_pattern']!r} != spec.console_pattern={expected!r}"
    )


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_safeguard_components_present(case: Path) -> None:
    """If reasons.safeguards mentions 'approval gate' / 'regulatory clock', the
    layout MUST include the corresponding component."""
    spec = _load_spec(case)
    cfg = _load_golden_yaml(case)
    safeguards = " ".join(spec["spec"]["reasons"].get("safeguards", []) or []).lower()
    components = {c.get("component") for c in cfg.get("layout", {}).get("components", [])}

    if "approval gate" in safeguards:
        assert "ApprovalGate" in components, (
            "safeguards mention 'approval gate' but layout missing ApprovalGate component"
        )
    if "regulatory clock" in safeguards:
        assert "RegulatoryClock" in components, (
            "safeguards mention 'regulatory clock' but layout missing RegulatoryClock component"
        )
