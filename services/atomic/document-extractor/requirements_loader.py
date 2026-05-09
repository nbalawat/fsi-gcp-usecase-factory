"""Load document_requirements.json + per-doc-type extraction schemas.

Single source of truth for "what fields does Landing AI ADE Extract need
to return for each doc_type" + "which of those are required vs preferred".

The orchestrator + UI also read these schemas; they are ground truth.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


# Path resolution: in the Cloud Run container the schemas live at /app/_schemas
# (per Dockerfile COPY). In local dev they're at <repo>/usecases/credit-memo-commercial/schemas.
def _schemas_root() -> Path:
    if os.environ.get("DOCUMENT_SCHEMAS_DIR"):
        return Path(os.environ["DOCUMENT_SCHEMAS_DIR"])
    container_path = Path("/app/_schemas")
    if container_path.exists():
        return container_path
    # Local dev fallback — walk up from this file
    here = Path(__file__).resolve()
    for parent in [here.parent.parent.parent.parent, here.parent.parent.parent]:
        candidate = parent / "usecases" / "credit-memo-commercial" / "schemas"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Could not locate document schemas. Set DOCUMENT_SCHEMAS_DIR or check repo layout. "
        f"Searched from {here.parent}"
    )


@lru_cache(maxsize=1)
def load_document_requirements() -> dict[str, Any]:
    """Returns the parsed document_requirements.json."""
    path = _schemas_root() / "document_requirements.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=16)
def load_extraction_schema(doc_type: str) -> dict[str, Any]:
    """Returns the per-doc-type JSON Schema that Landing AI ADE Extract
    consumes. KeyError if doc_type is unknown.
    """
    requirements = load_document_requirements()
    doc_meta = requirements["doc_types"].get(doc_type)
    if not doc_meta:
        raise KeyError(f"Unknown doc_type: {doc_type}. Known: {list(requirements['doc_types'].keys())}")

    schema_relpath = doc_meta["extraction_schema"]
    schema_path = _schemas_root() / schema_relpath.replace("schemas/", "")
    if not schema_path.exists():
        # extraction_schema field is "schemas/extractions/X.json" but _schemas_root() already points at schemas/
        schema_path = _schemas_root() / schema_relpath.replace("schemas/", "", 1)
    if not schema_path.exists():
        raise FileNotFoundError(f"Extraction schema not found at {schema_path} for {doc_type}")

    return json.loads(schema_path.read_text(encoding="utf-8"))


def required_field_paths(doc_type: str) -> list[str]:
    """Dotted-path list of fields that MUST be in the extraction (from
    document_requirements.json:doc_types[X].required_fields).
    """
    requirements = load_document_requirements()
    return list(requirements["doc_types"][doc_type].get("required_fields", []))


def preferred_field_paths(doc_type: str) -> list[str]:
    requirements = load_document_requirements()
    return list(requirements["doc_types"][doc_type].get("preferred_fields", []))


def find_missing_fields(extracted: dict[str, Any], paths: list[str]) -> list[str]:
    """Cross-check the extracted-fields object against a list of dotted
    paths. Returns the paths whose value is None / missing / empty-string.

    Example:
        extracted = {"income_statement": {"revenue": 100, "ebitda": None}}
        find_missing_fields(extracted, ["income_statement.revenue", "income_statement.ebitda"])
        → ["income_statement.ebitda"]
    """
    missing: list[str] = []
    for path in paths:
        if not _has_value(extracted, path.split(".")):
            missing.append(path)
    return missing


def _has_value(obj: Any, parts: list[str]) -> bool:
    if obj is None:
        return False
    if not parts:
        # Treat empty string / empty list as missing
        if obj == "" or obj == [] or obj == {}:
            return False
        return True
    if not isinstance(obj, dict):
        return False
    head, *rest = parts
    if head not in obj:
        return False
    return _has_value(obj[head], rest)
