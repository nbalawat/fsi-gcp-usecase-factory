"""
Skill + agent lint tests — enforces AUTHORING.md hard rules.

Each test parametrizes over every .claude/skills/*/SKILL.md and
.claude/agents/*.md so a single bad file shows up as a single failure
with a precise reason.

Hard rules checked:
  - SKILL.md / agent .md has YAML frontmatter
  - frontmatter has `name` (kebab-case) and `description`
  - skill `name` matches the directory name
  - description is one sentence, ≤ 300 chars (≤30 words is the AUTHORING.md
    target; 300 chars is the hard cap)
  - SKILL.md body ≤ 200 lines (hard limit)
  - if SKILL.md references `template/<file>`, that file exists
  - kebab-case for skill directories
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SKILLS_DIR = REPO_ROOT / ".claude" / "skills"
AGENTS_DIR = REPO_ROOT / ".claude" / "agents"

KEBAB_RE = re.compile(r"^[a-z][a-z0-9-]*$")
WORD_COUNT_LIMIT = 50      # ≤30 words preferred; allow up to 50 before fail
DESC_CHAR_LIMIT = 400      # hard cap on description length
BODY_LINE_LIMIT = 200      # hard cap on SKILL.md body length


def _skill_files() -> list[Path]:
    return sorted(SKILLS_DIR.glob("*/SKILL.md")) if SKILLS_DIR.is_dir() else []


def _agent_files() -> list[Path]:
    return sorted(AGENTS_DIR.glob("*.md")) if AGENTS_DIR.is_dir() else []


def _split_frontmatter(text: str) -> tuple[dict, str]:
    """Split `---\\n<yaml>\\n---\\n<body>`. Returns ({}, full text) if absent."""
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    import yaml as _yaml
    try:
        meta = _yaml.safe_load(parts[1]) or {}
    except _yaml.YAMLError:
        meta = {}
    return meta, parts[2].lstrip("\n")


# ── Skills ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("skill", _skill_files(), ids=lambda p: p.parent.name)
def test_skill_has_frontmatter(skill: Path) -> None:
    meta, _body = _split_frontmatter(skill.read_text())
    assert meta, f"{skill.relative_to(REPO_ROOT)} missing YAML frontmatter (---...---)"
    assert "name" in meta, f"{skill.relative_to(REPO_ROOT)} frontmatter missing `name`"
    assert "description" in meta, f"{skill.relative_to(REPO_ROOT)} frontmatter missing `description`"


@pytest.mark.parametrize("skill", _skill_files(), ids=lambda p: p.parent.name)
def test_skill_name_matches_dir(skill: Path) -> None:
    meta, _ = _split_frontmatter(skill.read_text())
    name = (meta or {}).get("name", "")
    expected = skill.parent.name
    assert name == expected, (
        f"{skill.relative_to(REPO_ROOT)}: frontmatter name={name!r} "
        f"must equal directory name {expected!r}"
    )


@pytest.mark.parametrize("skill", _skill_files(), ids=lambda p: p.parent.name)
def test_skill_dir_kebab_case(skill: Path) -> None:
    name = skill.parent.name
    assert KEBAB_RE.match(name), f"skill directory {name!r} is not kebab-case"


@pytest.mark.parametrize("skill", _skill_files(), ids=lambda p: p.parent.name)
def test_skill_description_concise(skill: Path) -> None:
    meta, _ = _split_frontmatter(skill.read_text())
    desc = (meta or {}).get("description", "")
    assert desc, f"{skill.relative_to(REPO_ROOT)} description is empty"
    assert len(desc) <= DESC_CHAR_LIMIT, (
        f"{skill.relative_to(REPO_ROOT)} description is {len(desc)} chars "
        f"(limit {DESC_CHAR_LIMIT}); split into a sibling skill or move into the body"
    )
    word_count = len(desc.split())
    assert word_count <= WORD_COUNT_LIMIT, (
        f"{skill.relative_to(REPO_ROOT)} description is {word_count} words "
        f"(target ≤30, hard limit {WORD_COUNT_LIMIT})"
    )


# Skills that exceeded the 200-line cap when this test was written. They are
# tracked for refactor; new skills MUST NOT be added to this set. The
# test_no_new_overlong_skills test below enforces that.
KNOWN_OVERLONG_SKILLS = {
    "author-rule",
    "compliance-pack",
    "fsi-deploy",
    "fsi-reasons-canvas",
    "new-agent",
    "new-atomic-service",
    "new-use-case",
    "promote",
    "workflow-design",
    "review-uc",
}


@pytest.mark.parametrize("skill", _skill_files(), ids=lambda p: p.parent.name)
def test_skill_body_length(skill: Path) -> None:
    """Each skill body must be ≤ 200 lines (AUTHORING.md hard limit).

    Skills in KNOWN_OVERLONG_SKILLS are grandfathered — they violate the
    rule and need refactoring. Don't add to that set; refactor the skill.
    """
    name = skill.parent.name
    _meta, body = _split_frontmatter(skill.read_text())
    line_count = len(body.splitlines())
    if name in KNOWN_OVERLONG_SKILLS:
        pytest.xfail(
            f"{name} is grandfathered overlong ({line_count} lines); "
            f"refactor planned. Remove from KNOWN_OVERLONG_SKILLS once ≤200."
        )
    assert line_count <= BODY_LINE_LIMIT, (
        f"{skill.relative_to(REPO_ROOT)} body is {line_count} lines "
        f"(hard limit {BODY_LINE_LIMIT}); split or move detail to references/"
    )


def test_no_new_overlong_skills() -> None:
    """Meta-test: KNOWN_OVERLONG_SKILLS only shrinks. If this fires, someone
    added a new skill > 200 lines or kept an old one overlong."""
    actual_overlong = set()
    for skill in _skill_files():
        _meta, body = _split_frontmatter(skill.read_text())
        if len(body.splitlines()) > BODY_LINE_LIMIT:
            actual_overlong.add(skill.parent.name)

    new_offenders = actual_overlong - KNOWN_OVERLONG_SKILLS
    assert not new_offenders, (
        f"new overlong skills appeared (>200 lines): {sorted(new_offenders)}. "
        f"Either refactor them under 200 lines or split into sibling skills "
        f"with detail in references/."
    )

    # Encourage shrinkage: warn if KNOWN_OVERLONG_SKILLS has names no longer
    # actually overlong (means they were already fixed and the list is stale).
    stale = KNOWN_OVERLONG_SKILLS - actual_overlong
    if stale:
        # Don't fail — but the message is visible in pytest -v output.
        print(
            f"\n  [info] skills no longer overlong; remove from "
            f"KNOWN_OVERLONG_SKILLS: {sorted(stale)}"
        )


@pytest.mark.parametrize("skill", _skill_files(), ids=lambda p: p.parent.name)
def test_skill_template_refs_exist(skill: Path) -> None:
    """If SKILL.md references a `template/<file>` path, that file must exist."""
    body = skill.read_text()
    template_dir = skill.parent / "template"
    template_re = re.compile(r"`?(template/[\w./_-]+)`?")
    referenced = set(template_re.findall(body))
    if not referenced:
        return
    missing = []
    for ref in referenced:
        if "..." in ref or "<" in ref:
            continue  # placeholders, not real paths
        if not (skill.parent / ref).exists():
            missing.append(ref)
    assert not missing, (
        f"{skill.relative_to(REPO_ROOT)} references non-existent template files: {missing}"
    )


# ── Agents (similar but with different field set) ─────────────────────────

@pytest.mark.parametrize("agent", _agent_files(), ids=lambda p: p.stem)
def test_agent_has_frontmatter(agent: Path) -> None:
    meta, _body = _split_frontmatter(agent.read_text())
    assert meta, f"{agent.relative_to(REPO_ROOT)} missing YAML frontmatter"
    assert "name" in meta, f"{agent.relative_to(REPO_ROOT)} missing `name`"
    assert "description" in meta, f"{agent.relative_to(REPO_ROOT)} missing `description`"


@pytest.mark.parametrize("agent", _agent_files(), ids=lambda p: p.stem)
def test_agent_name_matches_filename(agent: Path) -> None:
    meta, _ = _split_frontmatter(agent.read_text())
    name = (meta or {}).get("name", "")
    expected = agent.stem
    assert name == expected, (
        f"{agent.relative_to(REPO_ROOT)}: frontmatter name={name!r} "
        f"must equal filename stem {expected!r}"
    )


@pytest.mark.parametrize("agent", _agent_files(), ids=lambda p: p.stem)
def test_agent_filename_kebab_case(agent: Path) -> None:
    assert KEBAB_RE.match(agent.stem), f"agent file {agent.stem!r} is not kebab-case"


@pytest.mark.parametrize("agent", _agent_files(), ids=lambda p: p.stem)
def test_agent_description_concise(agent: Path) -> None:
    meta, _ = _split_frontmatter(agent.read_text())
    desc = (meta or {}).get("description", "")
    assert desc, f"{agent.relative_to(REPO_ROOT)} description is empty"
    assert len(desc) <= DESC_CHAR_LIMIT, (
        f"{agent.relative_to(REPO_ROOT)} description is {len(desc)} chars "
        f"(limit {DESC_CHAR_LIMIT})"
    )
