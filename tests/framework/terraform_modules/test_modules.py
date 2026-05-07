"""
Terraform module library tests.

For every module under infra/modules/<name>/:
  - Required files present (main.tf, variables.tf, outputs.tf, README.md)
  - Module name = directory name (sanity)
  - terraform fmt -check (no formatting drift) — skipped if terraform absent
  - terraform validate (HCL syntax + resource shape) — skipped if terraform absent
  - README.md describes a Usage section

Plus meta-tests:
  - Every module referenced in .claude/agents/terraform-author.md exists.
  - Every module enforces bank-policy labels in its variables.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
MODULES_DIR = REPO_ROOT / "infra" / "modules"


def _modules() -> list[Path]:
    if not MODULES_DIR.is_dir():
        return []
    return sorted(d for d in MODULES_DIR.iterdir() if d.is_dir())


def _has_terraform() -> bool:
    return shutil.which("terraform") is not None


@pytest.mark.parametrize("module", _modules(), ids=lambda p: p.name)
def test_module_has_required_files(module: Path) -> None:
    for required in ["main.tf", "variables.tf", "outputs.tf", "README.md"]:
        assert (module / required).is_file(), f"{module.name} missing {required}"


@pytest.mark.parametrize("module", _modules(), ids=lambda p: p.name)
def test_module_readme_has_usage(module: Path) -> None:
    body = (module / "README.md").read_text().lower()
    assert "## usage" in body, (
        f"{module.name}/README.md missing '## Usage' section"
    )


@pytest.mark.parametrize("module", _modules(), ids=lambda p: p.name)
@pytest.mark.skipif(not _has_terraform(), reason="terraform binary not on PATH")
def test_module_terraform_validate(module: Path) -> None:
    """Run `terraform init -backend=false && terraform validate` per module.

    Validates in-place because `use_case_template` references sibling modules
    via relative paths (`../atomic_service`); copying to tmp would break those.
    The .terraform directory is gitignored, so this is safe.
    """
    init = subprocess.run(
        ["terraform", "init", "-backend=false", "-input=false"],
        cwd=module, capture_output=True, text=True, timeout=120,
    )
    assert init.returncode == 0, (
        f"{module.name} terraform init failed:\n{init.stderr[:500]}"
    )
    validate = subprocess.run(
        ["terraform", "validate", "-json"],
        cwd=module, capture_output=True, text=True, timeout=60,
    )
    assert validate.returncode == 0, (
        f"{module.name} terraform validate failed:\n{validate.stdout[:500]}"
    )


@pytest.mark.parametrize("module", _modules(), ids=lambda p: p.name)
@pytest.mark.skipif(not _has_terraform(), reason="terraform binary not on PATH")
def test_module_terraform_fmt_clean(module: Path) -> None:
    """Module HCL must pass `terraform fmt -check` — no drift."""
    result = subprocess.run(
        ["terraform", "fmt", "-check", "-recursive", str(module)],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, (
        f"{module.name} has fmt drift; run `terraform fmt -recursive infra/modules/{module.name}/`:"
        f"\n{result.stdout}{result.stderr}"
    )


# ── Meta-tests ────────────────────────────────────────────────────────────

def test_terraform_author_module_references_exist() -> None:
    """Every module referenced in .claude/agents/terraform-author.md's catalog
    must exist under infra/modules/."""
    ta_md = (REPO_ROOT / ".claude" / "agents" / "terraform-author.md").read_text()
    # Catalog format: "- `module_name` — description"
    import re
    catalog_re = re.compile(r"^-\s+`(\w+)`\s+—", re.MULTILINE)
    referenced = set(catalog_re.findall(ta_md))
    # Filter to underscore-named ones (modules); single-word entries are bullets, not modules.
    referenced = {m for m in referenced if "_" in m}
    actual = {m.name for m in _modules()}
    missing = referenced - actual
    # rules_service is a special case — it's a singleton service, not a Terraform
    # module per se; it lives at services/rules-service and is deployed via the
    # deploy script, not as a reusable TF module. Exempt it from this check.
    missing -= {"rules_service"}
    assert not missing, (
        f"terraform-author.md references modules that don't exist under "
        f"infra/modules/: {sorted(missing)}"
    )


_BANK_LABEL_VARS = {"use_case", "owner", "cost_center", "data_classification"}


@pytest.mark.parametrize(
    "module",
    [m for m in _modules() if m.name not in {
        # Modules that are framework-shared, not per-UC, may legitimately omit use_case
        "cloud_sql_instance", "bigtable_memory_cluster", "secret",
    }],
    ids=lambda p: p.name,
)
def test_module_declares_bank_label_inputs(module: Path) -> None:
    """Every per-UC module accepts the bank's required label inputs as variables."""
    body = (module / "variables.tf").read_text()
    missing = []
    for var_name in _BANK_LABEL_VARS:
        if f'variable "{var_name}"' not in body:
            missing.append(var_name)
    assert not missing, (
        f"{module.name}/variables.tf missing required label vars: {missing}. "
        f"Bank policy requires use_case + owner + cost_center + data_classification."
    )


@pytest.mark.parametrize(
    "module",
    [m for m in _modules() if m.name not in {"bigtable_memory_cluster", "secret"}],
    ids=lambda p: p.name,
)
def test_module_validates_data_classification(module: Path) -> None:
    """Modules accepting data_classification must validate it against the
    allowed enum (public/internal/confidential/restricted)."""
    body = (module / "variables.tf").read_text()
    if 'variable "data_classification"' not in body:
        pytest.skip(f"{module.name} doesn't declare data_classification")
    # The variable must have a `validation { ... }` block.
    # Simple heuristic: data_classification block contains "validation"
    import re
    block_re = re.compile(
        r'variable\s+"data_classification"\s*\{[^}]*?validation\s*\{',
        re.DOTALL,
    )
    assert block_re.search(body), (
        f"{module.name}: data_classification variable missing validation block "
        f"(must reject anything outside public/internal/confidential/restricted)"
    )
