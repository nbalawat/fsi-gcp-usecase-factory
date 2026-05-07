"""
Test configuration for dscr-calculator.

Stubs the 'bank' package so unit tests run without the internal library installed.
The redacting_logger stub returns a standard logging.Logger so log calls work normally.
"""
from __future__ import annotations

import logging
import sys
import types


def _install_bank_stub() -> None:
    """Insert a minimal bank.logging stub into sys.modules before main is imported."""
    if "bank" in sys.modules:
        return

    bank_pkg = types.ModuleType("bank")
    bank_logging = types.ModuleType("bank.logging")

    def redacting_logger(name: str) -> logging.Logger:  # noqa: D401
        """Return a standard logger; no PII redaction needed in tests."""
        return logging.getLogger(name)

    bank_logging.redacting_logger = redacting_logger  # type: ignore[attr-defined]
    bank_pkg.logging = bank_logging  # type: ignore[attr-defined]

    sys.modules["bank"] = bank_pkg
    sys.modules["bank.logging"] = bank_logging


_install_bank_stub()
