"""
Conftest for gl-posting sink tests.

Stubs out `bank.logging` (not a real installed package) so that main.py
can be imported without a GCP environment.
"""
from __future__ import annotations

import logging
import sys
import types


def _make_bank_logging_stub() -> types.ModuleType:
    """Return a minimal stub for bank.logging with redacting_logger."""
    mod = types.ModuleType("bank.logging")

    def redacting_logger(name: str) -> logging.Logger:
        return logging.getLogger(name)

    mod.redacting_logger = redacting_logger  # type: ignore[attr-defined]
    return mod


# Install stubs before any test imports main
if "bank" not in sys.modules:
    bank_mod = types.ModuleType("bank")
    sys.modules["bank"] = bank_mod

sys.modules["bank.logging"] = _make_bank_logging_stub()
