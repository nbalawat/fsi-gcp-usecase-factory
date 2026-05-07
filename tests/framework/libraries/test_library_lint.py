"""
Library lint tests — every entry in libraries/{agents,patterns,workflows,use-cases}/
must conform to its layer's structural conventions.

Each layer has a different shape:
  agents/<name>/       archetype.yaml + instruction.md.j2 + README.md
  patterns/<name>/     pattern.yaml + README.md
  workflows/<name>/    fragment.yaml.j2 (or fragment.yaml) + README.md
  use-cases/<name>/    archetype.yaml + README.md

Each entry must declare a `name` and `version`. Names must be kebab-case
and match the directory name.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
LIBRARIES_DIR = REPO_ROOT / "libraries"

KEBAB_RE = re.compile(r"^[a-z][a-z0-9-]*$")


def _entries_for(layer: str) -> list[Path]:
    layer_dir = LIBRARIES_DIR / layer
    if not layer_dir.is_dir():
        return []
    return sorted(d for d in layer_dir.iterdir() if d.is_dir())


def _load_yaml(p: Path) -> dict:
    import yaml
    return yaml.safe_load(p.read_text()) or {}


# ── Agent archetypes ──────────────────────────────────────────────────────

@pytest.mark.parametrize("entry", _entries_for("agents"), ids=lambda p: p.name)
def test_agent_archetype_files(entry: Path) -> None:
    for required in ["archetype.yaml", "instruction.md.j2", "README.md"]:
        assert (entry / required).is_file(), f"{entry.name} missing {required}"


@pytest.mark.parametrize("entry", _entries_for("agents"), ids=lambda p: p.name)
def test_agent_archetype_meta(entry: Path) -> None:
    meta = _load_yaml(entry / "archetype.yaml")
    assert meta.get("name") == entry.name, (
        f"{entry.name}/archetype.yaml: name={meta.get('name')!r} must equal directory name"
    )
    assert "version" in meta, f"{entry.name}/archetype.yaml missing 'version'"
    assert "description" in meta and meta["description"], (
        f"{entry.name}/archetype.yaml missing or empty description"
    )
    assert "model" in meta, f"{entry.name}/archetype.yaml missing 'model'"
    APPROVED = {"claude-opus-4-7", "claude-opus-4-6", "claude-haiku-4-5", "gemini-3-1-flash"}
    assert meta["model"] in APPROVED, (
        f"{entry.name}: model={meta['model']!r} not in approved set {sorted(APPROVED)}"
    )
    assert "parameters" in meta, f"{entry.name}/archetype.yaml missing 'parameters'"


@pytest.mark.parametrize("entry", _entries_for("agents"), ids=lambda p: p.name)
def test_agent_archetype_kebab_case(entry: Path) -> None:
    assert KEBAB_RE.match(entry.name), f"agent archetype {entry.name!r} not kebab-case"


# ── Multi-agent patterns ──────────────────────────────────────────────────

@pytest.mark.parametrize("entry", _entries_for("patterns"), ids=lambda p: p.name)
def test_pattern_files(entry: Path) -> None:
    for required in ["pattern.yaml", "README.md"]:
        assert (entry / required).is_file(), f"{entry.name} missing {required}"


@pytest.mark.parametrize("entry", _entries_for("patterns"), ids=lambda p: p.name)
def test_pattern_meta(entry: Path) -> None:
    meta = _load_yaml(entry / "pattern.yaml")
    assert meta.get("name") == entry.name, (
        f"{entry.name}/pattern.yaml: name={meta.get('name')!r} must equal directory name"
    )
    assert "version" in meta
    assert meta.get("description"), f"{entry.name}/pattern.yaml missing description"
    assert "composes" in meta and isinstance(meta["composes"], list) and meta["composes"], (
        f"{entry.name}/pattern.yaml must declare a non-empty 'composes' list"
    )
    # Every composed role must reference an existing agent archetype
    for entry_dict in meta["composes"]:
        ref = entry_dict.get("archetype", "")
        if "@" in ref:
            ref = ref.split("@")[0]
        if ref:
            assert (LIBRARIES_DIR / "agents" / ref).is_dir(), (
                f"{entry.name} references missing agent archetype: {entry_dict.get('archetype')}"
            )


@pytest.mark.parametrize("entry", _entries_for("patterns"), ids=lambda p: p.name)
def test_pattern_kebab_case(entry: Path) -> None:
    assert KEBAB_RE.match(entry.name), f"pattern {entry.name!r} not kebab-case"


# ── Workflow fragments ────────────────────────────────────────────────────

@pytest.mark.parametrize("entry", _entries_for("workflows"), ids=lambda p: p.name)
def test_fragment_has_yaml(entry: Path) -> None:
    has_template = (entry / "fragment.yaml.j2").is_file() or (entry / "fragment.yaml").is_file()
    assert has_template, f"{entry.name} missing fragment.yaml(.j2)"


@pytest.mark.parametrize("entry", _entries_for("workflows"), ids=lambda p: p.name)
def test_fragment_has_readme(entry: Path) -> None:
    assert (entry / "README.md").is_file(), f"{entry.name} missing README.md"


# ── Use-case archetypes ───────────────────────────────────────────────────

@pytest.mark.parametrize("entry", _entries_for("use-cases"), ids=lambda p: p.name)
def test_uc_archetype_files(entry: Path) -> None:
    for required in ["archetype.yaml", "README.md"]:
        assert (entry / required).is_file(), f"{entry.name} missing {required}"


@pytest.mark.parametrize("entry", _entries_for("use-cases"), ids=lambda p: p.name)
def test_uc_archetype_meta(entry: Path) -> None:
    meta = _load_yaml(entry / "archetype.yaml")
    assert meta.get("name") == entry.name
    assert "version" in meta
    assert meta.get("description")
    assert meta.get("console_pattern"), f"{entry.name} must declare console_pattern"
    valid_consoles = {
        "realtime-console", "investigations-console", "pipeline-console",
        "surveillance-console", "run-console", "recommendations-console",
    }
    assert meta["console_pattern"] in valid_consoles, (
        f"{entry.name}: console_pattern={meta['console_pattern']!r} not in {sorted(valid_consoles)}"
    )


# ── Coverage meta-test ────────────────────────────────────────────────────

def test_minimum_library_coverage() -> None:
    """The factory needs at least N entries per layer for the reuse model to bite."""
    minimums = {
        "agents":    8,    # at least 8 archetypes for typical UC variety
        "patterns":  4,
        "workflows": 5,
        "use-cases": 5,
    }
    shortfalls = []
    for layer, min_count in minimums.items():
        actual = len(_entries_for(layer))
        if actual < min_count:
            shortfalls.append(f"{layer}: {actual} entries (need ≥{min_count})")
    assert not shortfalls, (
        "library catalog below minimum coverage:\n  " + "\n  ".join(shortfalls)
    )
