"""
Two ways to run a gatekeeper against a fixture:

  run_gatekeeper_deterministic(name, fixture_dir)
      Re-implements the deterministic checks each gatekeeper describes (grep/regex/
      file-presence rules) as plain Python. Fast, free, runs in default CI.

  run_gatekeeper_llm(name, fixture_dir)
      Invokes the actual Claude agent via the Anthropic API with the agent's
      system prompt loaded from .claude/agents/<name>.md. Slow, costs tokens,
      requires ANTHROPIC_API_KEY. Run nightly; gated behind RUN_LLM_TESTS env.

Both produce a FindingSet so tests can assert against the same shape.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

from .findings_parser import Finding, FindingSet, Severity, parse_llm_response


REPO_ROOT = Path(__file__).resolve().parents[3]


# ── Deterministic checks per gatekeeper ────────────────────────────────────

def _grep(pattern: str, root: Path, glob: str = "**/*") -> list[tuple[Path, int, str]]:
    """Recursively grep for a regex; return (path, lineno, line_text) tuples."""
    rx = re.compile(pattern)
    hits: list[tuple[Path, int, str]] = []
    for p in root.glob(glob):
        if not p.is_file():
            continue
        try:
            for i, line in enumerate(p.read_text(errors="replace").splitlines(), start=1):
                if rx.search(line):
                    hits.append((p, i, line))
        except (OSError, UnicodeError):
            continue
    return hits


def _arch_auditor(fixture: Path) -> FindingSet:
    """Re-implements the deterministic checks in architecture-auditor.md."""
    fs = FindingSet()

    # Rule: no atomic service calls another atomic service (HTTP/import)
    services_root = fixture / "services" / "atomic"
    if services_root.is_dir():
        for svc in services_root.iterdir():
            if not svc.is_dir():
                continue
            # Check main.py for cross-service URLs/imports
            mp = svc / "main.py"
            if mp.is_file():
                src = mp.read_text(errors="replace")
                # Heuristic: any literal URL referring to /services/atomic/ or another
                # atomic service's known endpoint pattern. Also "from services.atomic"
                if "fsi-atomic-" in src and svc.name not in src.split("fsi-atomic-")[0][-100:]:
                    # If main.py mentions an atomic-service URL that isn't its own
                    fs.add(Finding(
                        severity=Severity.BLOCKER,
                        rule="no_atomic_to_atomic_calls",
                        file=str(mp.relative_to(fixture)),
                        line=None,
                        message="atomic service references another atomic-service URL",
                    ))
                if re.search(r"from\s+services\.atomic\.\w+", src):
                    fs.add(Finding(
                        severity=Severity.BLOCKER,
                        rule="no_atomic_to_atomic_calls",
                        file=str(mp.relative_to(fixture)),
                        line=None,
                        message="atomic service imports from another atomic service",
                    ))

    # Rule: no hardcoded thresholds at module scope in atomic services
    if services_root.is_dir():
        threshold_kw = re.compile(r"^([A-Z_]*(?:THRESHOLD|LIMIT|MIN_DSCR|MAX_RATE)[A-Z_]*)\s*=")
        for svc in services_root.iterdir():
            mp = svc / "main.py"
            if not mp.is_file():
                continue
            for i, line in enumerate(mp.read_text(errors="replace").splitlines(), 1):
                m = threshold_kw.match(line)
                if m:
                    fs.add(Finding(
                        severity=Severity.BLOCKER,
                        rule="no_hardcoded_thresholds",
                        file=str(mp.relative_to(fixture)),
                        line=i,
                        message=f"module-scope hardcoded threshold constant: {m.group(1)}",
                    ))

    # Rule: no business logic (if/else with numeric comparisons) in handlers
    handlers_root_old = fixture / "services" / "handlers"
    handlers_root_new = list((fixture / "usecases").glob("*/handler"))
    handler_dirs = []
    if handlers_root_old.is_dir():
        handler_dirs.extend([d for d in handlers_root_old.iterdir() if d.is_dir()])
    handler_dirs.extend(handlers_root_new)
    business_if = re.compile(r"^\s*if\s+.*[<>=!]=?\s*\d")
    for hdir in handler_dirs:
        mp = hdir / "main.py"
        if not mp.is_file():
            continue
        for i, line in enumerate(mp.read_text(errors="replace").splitlines(), 1):
            if business_if.match(line):
                fs.add(Finding(
                    severity=Severity.BLOCKER,
                    rule="no_business_logic_in_handler",
                    file=str(mp.relative_to(fixture)),
                    line=i,
                    message=f"business-rule comparison in handler: {line.strip()}",
                ))

    # Rule: no print() in production code. Exclusion is based on the file's
    # *relative* path inside the fixture, not its absolute path (so a fixture
    # tree under tests/framework/ isn't itself filtered out).
    py_files = list(fixture.glob("**/main.py"))
    for f in py_files:
        rel_str = str(f.relative_to(fixture))
        if "tests/" in rel_str or "/tests" in rel_str:
            continue  # skip per-service test files inside the artifact tree
        for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("print("):
                fs.add(Finding(
                    severity=Severity.BLOCKER,
                    rule="no_print_in_production",
                    file=rel_str,
                    line=i,
                    message="print() detected in production code — use the redacting logger",
                ))

    return fs


def _strip_shell_comments(src: str) -> str:
    """Strip leading # comment lines from a shell script for syntax-level checks.

    Doesn't try to parse mid-line comments — keeps logic simple. Lines whose
    first non-whitespace char is # are dropped.
    """
    return "\n".join(
        line for line in src.splitlines() if not line.lstrip().startswith("#")
    )


_GCLOUD_RUN_DEPLOY_BLOCK = re.compile(
    r"gcloud\s+run\s+deploy\b(?:[^\n]*\\\s*\n)*[^\n]*",
    re.DOTALL,
)


def _security_reviewer(fixture: Path) -> FindingSet:
    fs = FindingSet()

    # Rule: db pass via plaintext env var, not Secret Manager.
    # Check only the actual gcloud invocation (strip comments first).
    deploy_scripts = list(fixture.glob("scripts/*.sh"))
    for s in deploy_scripts:
        src = _strip_shell_comments(s.read_text(errors="replace"))
        for m in _GCLOUD_RUN_DEPLOY_BLOCK.finditer(src):
            block = m.group(0)
            # DB_PASS appears inside --set-env-vars value AND no --set-secrets flag
            uses_env_var = re.search(r"--set-env-vars=[^\\]*\bDB_PASS=", block) is not None
            uses_secret = re.search(r"--set-secrets=[^\\]*\bDB_PASS=", block) is not None
            if uses_env_var and not uses_secret:
                fs.add(Finding(
                    severity=Severity.CRITICAL,
                    rule="db_credentials_via_env_var",
                    file=str(s.relative_to(fixture)),
                    message="DB_PASS set as plaintext env var, not via --set-secrets (Secret Manager)",
                ))

    # Rule: handler PII leakage — stdlib logging without redacting_logger import.
    # Use AST so docstrings and comment text mentioning redacting_logger don't fool us.
    import ast
    for hp in fixture.glob("**/handler/main.py"):
        src = hp.read_text(errors="replace")
        try:
            tree = ast.parse(src)
        except SyntaxError:
            continue
        imports_stdlib_logging = False
        imports_redacting_logger = False
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "logging":
                        imports_stdlib_logging = True
            elif isinstance(node, ast.ImportFrom):
                if node.module == "bank.logging":
                    for alias in node.names:
                        if alias.name == "redacting_logger":
                            imports_redacting_logger = True
                # Conditional fallback: some files do `try: from bank.logging import redacting_logger`
                # which still counts as redaction-aware.
        if imports_stdlib_logging and not imports_redacting_logger:
            fs.add(Finding(
                severity=Severity.CRITICAL,
                rule="pii_via_stdlib_logging",
                file=str(hp.relative_to(fixture)),
                message="handler imports stdlib logging without redacting_logger — PII leak risk",
            ))

    # Rule: agent_runtime_sa with pubsub.publisher on approval_events.
    # Look for an IAM binding resource where the topic is approval_events,
    # the role is publisher, and the member references agent_runtime_sa.
    iam_block_re = re.compile(
        r"resource\s+\"google_pubsub_topic_iam_member\"[^{]+\{(?P<body>[^}]+)\}",
        re.DOTALL,
    )
    for tf in fixture.glob("**/*.tf"):
        src = tf.read_text(errors="replace")
        for m in iam_block_re.finditer(src):
            body = m.group("body")
            if (
                "approval_events" in body
                and "pubsub.publisher" in body
                and "agent_runtime_sa" in body
                and "credit_officer_app_sa" not in body
            ):
                # Find a citation line for the role line within this block
                start = m.start()
                line_no = src[:start].count("\n") + 1
                for i, line in enumerate(body.splitlines(), 0):
                    if "pubsub.publisher" in line:
                        line_no = src[:start].count("\n") + 1 + i
                        break
                fs.add(Finding(
                    severity=Severity.CRITICAL,
                    rule="self_approval_iam",
                    file=str(tf.relative_to(fixture)),
                    line=line_no,
                    message=(
                        "agent_runtime_sa has roles/pubsub.publisher on "
                        "approval_events — self-approval risk; only "
                        "credit_officer_app_sa should publish here"
                    ),
                ))

    # Rule: Cloud Run deploy without --ingress flag.
    for s in deploy_scripts:
        src = _strip_shell_comments(s.read_text(errors="replace"))
        for m in _GCLOUD_RUN_DEPLOY_BLOCK.finditer(src):
            block = m.group(0)
            if "--ingress" not in block:
                # Find line number of "gcloud run deploy" in the original (unstripped) text
                original = s.read_text(errors="replace")
                line_no = None
                for i, line in enumerate(original.splitlines(), 1):
                    if "gcloud run deploy" in line and not line.lstrip().startswith("#"):
                        line_no = i
                        break
                fs.add(Finding(
                    severity=Severity.HIGH,
                    rule="cloud_run_no_ingress_set",
                    file=str(s.relative_to(fixture)),
                    line=line_no,
                    message="Cloud Run deploy missing --ingress flag (defaults to public)",
                ))

    return fs


def _compliance_reviewer(fixture: Path) -> FindingSet:
    fs = FindingSet()
    compliance_root_candidates = list(fixture.glob("usecases/*/compliance")) + [fixture / "compliance"]
    compliance_dir = next((c for c in compliance_root_candidates if c.is_dir()), None)
    if compliance_dir is None:
        return fs  # nothing to check

    required_files = [
        "model_card.md",
        "risk_assessment.md",
        "audit_trail_spec.md",
        "regulatory_citations.md",
        "decision_rationale.md",
        "signatures_required.md",
    ]
    for required in required_files:
        if not (compliance_dir / required).is_file():
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule=f"missing_{required.replace('.md','')}",
                file=str(compliance_dir.relative_to(fixture) / required),
                message=f"required compliance artifact missing: {required}",
            ))

    # Rule: regulatory citations must distinguish 12 CFR Part 32 (LLL) from
    # 12 CFR Part 215 / Part 31 (Reg O insider lending) — common conflation.
    rc = compliance_dir / "regulatory_citations.md"
    if rc.is_file():
        src = rc.read_text(errors="replace")
        # If "Reg O" is mentioned but Part 215 is not cited, that's wrong
        if "Reg O" in src and "215" not in src:
            line_no = None
            for i, line in enumerate(src.splitlines(), 1):
                if "Reg O" in line:
                    line_no = i
                    break
            fs.add(Finding(
                severity=Severity.HIGH,
                rule="reg_o_citation_imprecise",
                file=str(rc.relative_to(fixture)),
                line=line_no,
                message="Reg O citations should reference 12 CFR Part 215 (Fed) and/or Part 31 (OCC), not Part 32",
            ))
        # If "12 CFR Part 32" is referenced as the insider-lending rule, that's wrong.
        # Use a same-line window so two separate sections (one for LLL, one for Reg O
        # citing Part 215) don't false-positive.
        same_line_re = re.compile(
            r"12\s*CFR\s*Part\s*32\b[^\n]*\binsider|insider[^\n]*\b12\s*CFR\s*Part\s*32\b",
            re.IGNORECASE,
        )
        if same_line_re.search(src):
            fs.add(Finding(
                severity=Severity.HIGH,
                rule="reg_o_citation_imprecise",
                file=str(rc.relative_to(fixture)),
                message="Part 32 is the legal lending limit (LLL); insider lending is Part 215/Part 31",
            ))

    return fs


# ── Validator runners (Layer 1 join-point gatekeepers) ────────────────────

def _service_validator(fixture: Path, spec: dict | None = None) -> FindingSet:
    """Re-implements the deterministic checks in service-validator.md."""
    import json as _json
    fs = FindingSet()
    spec = spec or {}
    op_path = spec.get("operation_path") or ""
    expected_inputs = set(spec.get("inputs", []))
    expected_outputs = set(spec.get("outputs", []))

    if op_path:
        svc_dir = fixture / op_path
    else:
        candidates = list(fixture.glob("services/atomic/*"))
        svc_dir = candidates[0] if candidates else fixture

    if not svc_dir.is_dir():
        fs.add(Finding(
            severity=Severity.BLOCKER,
            rule="missing_service_dir",
            file=op_path or "services/atomic/...",
            message=f"service directory not found at {op_path!r}",
        ))
        return fs

    def _rel(p: Path) -> str:
        return str(p.relative_to(fixture))

    for f in ["main.py", "manifest.json", "Dockerfile", "pyproject.toml", "Procfile", "tests/smoke_payload.json"]:
        if not (svc_dir / f).is_file():
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="required_file_missing",
                file=_rel(svc_dir / f),
                message=f"required file missing: {f}",
            ))

    tests_dir = svc_dir / "tests"
    if tests_dir.is_dir():
        test_count = 0
        for tf in tests_dir.glob("test_*.py"):
            for line in tf.read_text(errors="replace").splitlines():
                if re.match(r"^\s*def\s+test_\w+", line):
                    test_count += 1
        if test_count < 10:
            test_main = tests_dir / "test_main.py"
            cite = test_main if test_main.is_file() else next(tests_dir.glob("test_*.py"), tests_dir)
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="tests_minimum_count",
                file=_rel(cite),
                message=f"only {test_count} tests found; minimum for atomic-service is 10",
            ))

    manifest_path = svc_dir / "manifest.json"
    if manifest_path.is_file():
        try:
            manifest = _json.loads(manifest_path.read_text())
        except _json.JSONDecodeError as e:
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="manifest_invalid_json",
                file=_rel(manifest_path),
                message=f"manifest.json is not valid JSON: {e}",
            ))
            manifest = {}
        actual_inputs = set(manifest.get("inputs", []))
        actual_outputs = set(manifest.get("outputs", []))
        if expected_inputs and not expected_inputs.issubset(actual_inputs):
            missing = expected_inputs - actual_inputs
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="manifest_contract_matches_spec",
                file=_rel(manifest_path),
                message=f"manifest inputs missing fields from spec: {sorted(missing)}",
            ))
        if expected_outputs and not expected_outputs.issubset(actual_outputs):
            missing = expected_outputs - actual_outputs
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="manifest_contract_matches_spec",
                file=_rel(manifest_path),
                message=f"manifest outputs missing fields from spec: {sorted(missing)}",
            ))

    main_py = svc_dir / "main.py"
    if main_py.is_file():
        # AST-based import check — comments mentioning otel don't fool us.
        import ast as _ast
        src = main_py.read_text(errors="replace")
        try:
            tree = _ast.parse(src)
        except SyntaxError:
            tree = None
        otel_imported = False
        if tree is not None:
            for node in _ast.walk(tree):
                if isinstance(node, _ast.Import):
                    for alias in node.names:
                        if alias.name.startswith("opentelemetry") or alias.name == "google.cloud.logging":
                            otel_imported = True
                elif isinstance(node, _ast.ImportFrom):
                    mod = node.module or ""
                    if mod.startswith("opentelemetry") or mod == "google.cloud.logging":
                        otel_imported = True
        if not otel_imported:
            fs.add(Finding(
                severity=Severity.WARNING,
                rule="otel_instrumentation",
                file=_rel(main_py),
                message="OTel / structured logging not imported in main.py",
            ))
        procfile = svc_dir / "Procfile"
        if procfile.is_file():
            pf_src = procfile.read_text(errors="replace")
            if "functions-framework" in pf_src and "--target=main" not in pf_src:
                fs.add(Finding(
                    severity=Severity.BLOCKER,
                    rule="procfile_wrong_target",
                    file=_rel(procfile),
                    message="Procfile must use functions-framework --target=main",
                ))

    smoke = svc_dir / "tests" / "smoke_payload.json"
    if smoke.is_file():
        try:
            _json.loads(smoke.read_text())
        except _json.JSONDecodeError as e:
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="smoke_payload_invalid_json",
                file=_rel(smoke),
                message=f"smoke_payload.json invalid JSON: {e}",
            ))

    return fs


def _rule_validator(fixture: Path, spec: dict | None = None) -> FindingSet:
    """Re-implements the deterministic checks in rule-validator.md."""
    import json as _json
    fs = FindingSet()
    spec = spec or {}
    rule_path_in_spec = spec.get("operation_path", "")
    if rule_path_in_spec:
        rule_path = fixture / rule_path_in_spec
    else:
        candidates = [c for c in fixture.glob("rules/**/*.json") if "tests" not in c.parts]
        rule_path = candidates[0] if candidates else fixture

    if not rule_path.is_file():
        fs.add(Finding(
            severity=Severity.BLOCKER,
            rule="rule_file_missing",
            file=str(rule_path_in_spec or "rules/?.json"),
            message="JDM rule JSON not found",
        ))
        return fs

    def _rel(p: Path) -> str:
        return str(p.relative_to(fixture))

    try:
        rule = _json.loads(rule_path.read_text())
    except _json.JSONDecodeError as e:
        fs.add(Finding(
            severity=Severity.BLOCKER,
            rule="invalid_jdm_schema",
            file=_rel(rule_path),
            message=f"rule JSON invalid: {e}",
        ))
        return fs

    if not isinstance(rule, dict) or "nodes" not in rule or "edges" not in rule:
        fs.add(Finding(
            severity=Severity.BLOCKER,
            rule="invalid_jdm_schema",
            file=_rel(rule_path),
            message="rule must have top-level 'nodes' and 'edges' arrays (Zen schema)",
        ))

    golden_dir = rule_path.parent / "tests" / "golden"
    if not golden_dir.is_dir():
        alt = rule_path.parent.parent / "tests" / "golden"
        if not alt.is_dir():
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="missing_golden_tests",
                file=_rel(rule_path.parent / "tests" / "golden"),
                message="golden tests directory missing — every rule requires golden tests",
            ))

    if isinstance(rule, dict):
        for node in rule.get("nodes", []) or []:
            if isinstance(node, dict) and node.get("type") == "decisionTableNode":
                content = node.get("content", {})
                hp = content.get("hitPolicy")
                if hp not in {"first", "collect"}:
                    fs.add(Finding(
                        severity=Severity.BLOCKER,
                        rule="wrong_hit_policy",
                        file=_rel(rule_path),
                        message=f"decisionTable hitPolicy must be 'first' or 'collect', got {hp!r}",
                    ))

    return fs


def _agent_validator(fixture: Path, spec: dict | None = None) -> FindingSet:
    """Re-implements the deterministic checks in agent-validator.md."""
    import ast as _ast
    fs = FindingSet()

    candidates = [c for c in fixture.glob("usecases/*/agents/*.py") if c.name != "__init__.py"]
    if not candidates:
        fs.add(Finding(
            severity=Severity.BLOCKER,
            rule="missing_agent_file",
            file="usecases/<uc>/agents/<role>.py",
            message="no agent .py file found",
        ))
        return fs

    def _rel(p: Path) -> str:
        return str(p.relative_to(fixture))

    APPROVED_MODELS = {"claude-opus-4-7", "claude-opus-4-6", "gemini-3-1-flash"}

    for agent_py in candidates:
        src = agent_py.read_text(errors="replace")
        try:
            tree = _ast.parse(src)
        except SyntaxError as e:
            fs.add(Finding(
                severity=Severity.BLOCKER,
                rule="agent_syntax_error",
                file=_rel(agent_py),
                message=f"syntax error: {e}",
            ))
            continue
        for node in _ast.walk(tree):
            if isinstance(node, _ast.Call):
                func_name = ""
                if isinstance(node.func, _ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, _ast.Attribute):
                    func_name = node.func.attr
                if func_name in {"LlmAgent", "Agent"}:
                    kwargs = {kw.arg: kw.value for kw in node.keywords}
                    model_node = kwargs.get("model")
                    if isinstance(model_node, _ast.Constant) and model_node.value not in APPROVED_MODELS:
                        fs.add(Finding(
                            severity=Severity.BLOCKER,
                            rule="unapproved_model",
                            file=_rel(agent_py),
                            line=getattr(model_node, "lineno", None),
                            message=f"model={model_node.value!r} not in approved set {sorted(APPROVED_MODELS)}",
                        ))

    pii_re = re.compile(
        r"(SSN|EIN|tax\s*id|passport|date\s*of\s*birth)\s*[:=]\s*[\dA-Z\-]{4,}",
        re.IGNORECASE,
    )
    for pf in fixture.glob("usecases/*/agents/prompts/*.md"):
        for i, line in enumerate(pf.read_text(errors="replace").splitlines(), 1):
            if pii_re.search(line):
                fs.add(Finding(
                    severity=Severity.BLOCKER,
                    rule="pii_in_prompt",
                    file=_rel(pf),
                    line=i,
                    message=f"prompt contains PII-shaped value: {line.strip()[:80]}",
                ))

    for m in fixture.glob("usecases/*/agents/manifest.yaml"):
        if "memory_scope" not in m.read_text(errors="replace"):
            fs.add(Finding(
                severity=Severity.WARNING,
                rule="no_memory_scope",
                file=_rel(m),
                message="agent manifest does not declare memory_scope — required if agent uses Memory Bank",
            ))

    return fs


_DETERMINISTIC_RUNNERS = {
    "architecture-auditor": _arch_auditor,
    "security-reviewer": _security_reviewer,
    "compliance-reviewer": _compliance_reviewer,
    "service-validator": _service_validator,
    "rule-validator": _rule_validator,
    "agent-validator": _agent_validator,
}


def run_gatekeeper_deterministic(name: str, fixture: Path, spec: dict | None = None) -> FindingSet:
    """Run a gatekeeper or validator's deterministic checks against a fixture directory.

    The optional `spec` carries the validator's operation spec (inputs/outputs/path)
    when invoking a validator. Gatekeepers ignore it.
    """
    runner = _DETERMINISTIC_RUNNERS.get(name)
    if runner is None:
        raise ValueError(f"no deterministic runner for {name!r}")
    if name in {"service-validator", "rule-validator", "agent-validator"}:
        return runner(fixture, spec or {})
    return runner(fixture)


# ── LLM-mode runner ────────────────────────────────────────────────────────

def run_gatekeeper_llm(name: str, fixture: Path) -> FindingSet:
    """
    Invoke the actual Claude agent against a fixture via the Anthropic API.

    Loads the agent's system prompt from .claude/agents/<name>.md, sends a
    user message asking the agent to audit the fixture directory, and parses
    the response into a FindingSet.

    Requires ANTHROPIC_API_KEY. Slow + costs tokens; gated by RUN_LLM_TESTS.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY required for LLM-mode tests")

    agent_md = REPO_ROOT / ".claude" / "agents" / f"{name}.md"
    if not agent_md.is_file():
        raise FileNotFoundError(f"agent definition not found: {agent_md}")

    # Strip frontmatter, keep body as system prompt
    body = agent_md.read_text()
    if body.startswith("---"):
        _, _, after = body.partition("---")
        _, _, body = after.partition("---")
    system_prompt = body.strip()

    # Build a directory listing the agent can reason about
    tree_lines: list[str] = []
    for p in sorted(fixture.rglob("*")):
        if p.is_file():
            rel = p.relative_to(fixture)
            tree_lines.append(f"  {rel}")
    tree_text = "\n".join(tree_lines)

    # Concatenate all file contents for context (small fixtures only)
    files_blob: list[str] = []
    for p in sorted(fixture.rglob("*")):
        if p.is_file() and p.stat().st_size < 50_000:
            try:
                files_blob.append(f"--- {p.relative_to(fixture)} ---\n{p.read_text(errors='replace')}\n")
            except Exception:
                pass
    files_text = "\n".join(files_blob)

    user_prompt = (
        f"Audit the following fixture directory. Return findings as a JSON code block "
        f"with shape {{ \"verdict\": \"PASS|WARN|FAIL\", \"violations\": [...] }}.\n\n"
        f"Files:\n{tree_text}\n\nContents:\n{files_text}"
    )

    # Lazy import so test collection doesn't require the SDK
    try:
        import anthropic  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "anthropic SDK required for LLM-mode tests; install with: pip install anthropic"
        ) from e

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=os.environ.get("CLAUDE_TEST_MODEL", "claude-sonnet-4-6"),
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    response_text = "\n".join(block.text for block in msg.content if hasattr(block, "text"))
    return parse_llm_response(response_text)
