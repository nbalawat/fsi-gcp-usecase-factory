#!/usr/bin/env python3
"""
resolve_reasons_refs.py — verify every library reference in a REASONS canvas
points to a real, version-pinned library entry.

Used by /fsi-build-parallel before fanning out builders, and by
architecture-auditor as part of the drift check.

Exit codes:
  0  all refs resolve
  1  one or more refs fail to resolve (report printed)
  2  schema/IO error
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed", file=sys.stderr)
    sys.exit(2)

VERSION_RE = re.compile(r"^([a-z][a-z0-9-]*)@(\d+\.\d+|\d{4}-q[1-4])$")
# Rules use snake_case names per JDM convention (regulator-readable citations like
# `regulatory_thresholds`). Kebab-case is enforced everywhere else.
RULE_REF_RE = re.compile(r"^([a-z][a-z0-9_-]*)@(\d+\.\d+|\d{4}-q[1-4])$")


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / "policies" / "reasons_schema.json").exists():
            return cur
        cur = cur.parent
    print(f"ERROR: could not find repo root from {start}", file=sys.stderr)
    sys.exit(2)


def load_archetype_version(yaml_path: Path) -> str | None:
    if not yaml_path.is_file():
        return None
    try:
        d = yaml.safe_load(yaml_path.read_text())
    except yaml.YAMLError:
        return None
    return str(d.get("version", "")) or None


def resolve_ref(repo: Path, kind: str, ref: str) -> tuple[bool, str]:
    """Return (ok, detail). kind is one of: archetype, pattern, fragment,
    use_case, atomic_service, rule."""
    if kind == "rule":
        # Rules use a wider regex (snake_case names allowed); handled below.
        m = None
        name = ver = ""
    else:
        m = VERSION_RE.match(ref)
        if not m:
            return False, f"malformed reference (expected name@version): {ref}"
        name, ver = m.group(1), m.group(2)

    if kind == "archetype":
        meta = repo / "libraries" / "agents" / name / "archetype.yaml"
    elif kind == "pattern":
        meta = repo / "libraries" / "patterns" / name / "pattern.yaml"
    elif kind == "fragment":
        meta = repo / "libraries" / "workflows" / name / "fragment.yaml"
    elif kind == "use_case":
        meta = repo / "libraries" / "use-cases" / name / "archetype.yaml"
    elif kind == "atomic_service":
        meta = repo / "services" / "atomic" / name / "manifest.json"
        if not meta.is_file():
            return False, f"no manifest.json under services/atomic/{name}/"
        # Atomic service versioning lives in manifest.json's "version" field
        try:
            data = json.loads(meta.read_text())
            actual = str(data.get("version", "")) or None
        except json.JSONDecodeError:
            return False, f"invalid manifest.json for atomic service {name}"
        if actual != ver:
            return False, f"version mismatch: ref says {ver}, manifest says {actual}"
        return True, f"services/atomic/{name}/ v{actual}"
    elif kind == "rule":
        m_rule = RULE_REF_RE.match(ref)
        if not m_rule:
            return False, f"malformed rule reference: {ref}"
        rname, rver = m_rule.group(1), m_rule.group(2)
        # Rules are versioned by file path: rules/<name>/v<ver>.json (semver) or v<YYYY-qN>.json
        rule_dir = repo / "rules" / rname
        if not rule_dir.is_dir():
            return False, f"no rules/{rname}/ directory (rule unstubbed)"
        candidates = list(rule_dir.glob(f"v{rver}.json"))
        if not candidates:
            available = sorted(p.name for p in rule_dir.glob("*.json"))
            return False, f"rules/{rname}/ exists but version v{rver}.json missing (have: {available})"
        return True, f"rules/{rname}/v{rver}.json"
    else:
        return False, f"unknown kind: {kind}"

    actual = load_archetype_version(meta)
    if actual is None:
        return False, f"missing or unreadable {meta.relative_to(repo)}"
    if actual != ver:
        return False, f"version mismatch: ref says {ver}, library says {actual}"
    return True, f"{meta.parent.relative_to(repo)} v{actual}"


def collect_refs(reasons: dict) -> list[tuple[str, str]]:
    """Return list of (kind, ref) tuples to resolve."""
    refs: list[tuple[str, str]] = []
    a = reasons.get("approach", {})
    if a.get("use_case_archetype"):
        refs.append(("use_case", a["use_case_archetype"]))
    if a.get("multi_agent_pattern") and a["multi_agent_pattern"] != "single-agent":
        refs.append(("pattern", a["multi_agent_pattern"]))

    s = reasons.get("structure", {})
    for entry in s.get("agent_archetypes", []):
        refs.append(("archetype", entry["archetype"]))
    for ref in s.get("atomic_services_reused", []):
        refs.append(("atomic_service", ref))
    for ref in s.get("workflow_fragments", []):
        refs.append(("fragment", ref))
    # rules are typically referenced without a strict @version pattern (e.g. "regulatory_thresholds@2026-q2")
    for ref in s.get("rules", []):
        refs.append(("rule", ref))
    return refs


def operation_produces(reasons: dict, ref: str, kind: str) -> str | None:
    """Return the Operation id that will produce this reference, or None if no
    Operation claims it. Used to distinguish 'reference is broken' from
    'reference will be built by this same canvas'."""
    op_kind_for = {
        "atomic_service": "atomic-service",
        "rule": "jdm-rule",
        "archetype": "agent-specialist",  # archetype refs in agent_archetypes are instantiated
        "pattern": None,                   # patterns must already exist
        "fragment": None,                  # fragments must already exist
        "use_case": None,                  # use-case archetypes must already exist
    }
    target_kind = op_kind_for.get(kind)
    if target_kind is None:
        return None
    name = ref.split("@", 1)[0]
    for op in reasons.get("operations", []):
        if op.get("kind") != target_kind:
            continue
        path = op.get("path", "")
        if name in path:
            return op.get("id")
    return None


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    strict = "--strict" in flags

    if not args:
        print(
            f"usage: {sys.argv[0]} [--strict] <reasons.yaml> [<reasons.yaml> ...]\n"
            "  default: failures allowed if a future Operation produces the missing artifact\n"
            "  --strict: every reference must already exist in libraries/services/rules",
            file=sys.stderr,
        )
        return 2

    overall_ok = True
    for arg in args:
        path = Path(arg)
        if not path.is_file():
            print(f"FAIL: {arg} not found")
            overall_ok = False
            continue

        try:
            data = yaml.safe_load(path.read_text())
        except yaml.YAMLError as e:
            print(f"FAIL: {arg} not valid YAML — {e}")
            overall_ok = False
            continue

        repo = find_repo_root(path.parent)
        refs = collect_refs(data)

        if not refs:
            print(f"WARN: {arg} has no library references — sparse REASONS?")

        results: dict[str, list[tuple[str, str, str, str]]] = defaultdict(list)
        for kind, ref in refs:
            ok, detail = resolve_ref(repo, kind, ref)
            if ok:
                status = "OK"
            else:
                # Check if a future Operation in this canvas will produce it
                producing_op = None if strict else operation_produces(data, ref, kind)
                if producing_op:
                    status = "DEFERRED"
                    detail = f"unresolved now; will be produced by operation '{producing_op}'"
                else:
                    status = "FAIL"
                    overall_ok = False
            results[kind].append((ref, status, status == "OK" or status == "DEFERRED", detail))

        # Render
        print(f"\n=== {arg}{'  [strict]' if strict else ''} ===")
        for kind in ["use_case", "pattern", "archetype", "atomic_service", "rule", "fragment"]:
            if not results[kind]:
                continue
            print(f"\n  [{kind}]")
            for ref, status, ok, detail in results[kind]:
                marker = {"OK": "✓", "DEFERRED": "→", "FAIL": "✗"}.get(status, "?")
                print(f"    {marker} {ref:<55s} {status:<8s} {detail}")

        ok_n = sum(1 for v in results.values() for _, s, _, _ in v if s == "OK")
        deferred_n = sum(1 for v in results.values() for _, s, _, _ in v if s == "DEFERRED")
        bad_n = sum(1 for v in results.values() for _, s, _, _ in v if s == "FAIL")
        print(f"\n  Total: {ok_n} resolved, {deferred_n} deferred-to-build, {bad_n} unresolved")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
