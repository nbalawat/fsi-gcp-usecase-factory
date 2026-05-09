"""Analyst agent — Track C consolidation (7 specialists → 1).

Replaces:
  - financial_spreader_agent
  - peer_set_curator
  - management_quality_rater
  - customer_concentration_analyzer
  - stress_scenario_modeler
  - collateral_appraiser
  - regulatory_checker

Single Vertex Gemini call with `response_schema` (Rule 2 of product-build-
discipline) producing all 7 sub-sections in one shot. Same input data as
the 7 legacy agents; consolidated output. ~85 percent fewer LLM calls per
case + much faster end-to-end (parallel calls had a long-tail problem in
practice).

The response_schema below is the contract — every key MUST be present in
the LLM output, with `value` (numeric or string) + `evidence` (list of
citations to source documents). This is what the orchestrator persists
into application_state and what the drafter consumes downstream.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

PROMPT_DIR = Path(__file__).parent / "prompts"


# ── Vertex Gemini response_schema — single source of truth for the
#    analyst's structured output. The orchestrator passes this to
#    GenerateContentConfig(response_schema=...) so the model can't
#    skip a section or invent a key (Rule 2 of product-build-discipline).

ANALYST_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "normalization",
        "peer_set",
        "management_quality",
        "customer_concentration",
        "stress_scenarios",
        "collateral",
        "regulatory",
    ],
    "properties": {
        "normalization": {
            "type": "OBJECT",
            "description": "Spread financial statements after one-time/non-recurring adjustments.",
            "required": ["fiscal_year_end", "income_statement", "balance_sheet", "cash_flow"],
            "properties": {
                "fiscal_year_end": {"type": "STRING"},
                "income_statement": {
                    "type": "OBJECT",
                    "properties": {
                        "revenue": {"type": "NUMBER"},
                        "cogs": {"type": "NUMBER"},
                        "ebitda": {"type": "NUMBER"},
                        "operating_income": {"type": "NUMBER"},
                        "net_income": {"type": "NUMBER"},
                        "interest_expense": {"type": "NUMBER"},
                    },
                },
                "balance_sheet": {
                    "type": "OBJECT",
                    "properties": {
                        "total_assets": {"type": "NUMBER"},
                        "total_debt": {"type": "NUMBER"},
                        "total_equity": {"type": "NUMBER"},
                        "current_assets": {"type": "NUMBER"},
                        "current_liabilities": {"type": "NUMBER"},
                    },
                },
                "cash_flow": {
                    "type": "OBJECT",
                    "properties": {
                        "operating_cash_flow": {"type": "NUMBER"},
                        "capex": {"type": "NUMBER"},
                        "free_cash_flow": {"type": "NUMBER"},
                    },
                },
                "adjustments": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["line_item", "amount", "rationale"],
                        "properties": {
                            "line_item": {"type": "STRING"},
                            "amount": {"type": "NUMBER"},
                            "rationale": {"type": "STRING"},
                        },
                    },
                },
            },
        },
        "peer_set": {
            "type": "OBJECT",
            "description": "Borrower's percentile rank vs NAICS-matched peers.",
            "required": ["peer_count", "percentile_metrics"],
            "properties": {
                "peer_count": {"type": "INTEGER"},
                "percentile_metrics": {
                    "type": "OBJECT",
                    "properties": {
                        "ebitda_margin": {"type": "NUMBER"},
                        "leverage": {"type": "NUMBER"},
                        "interest_coverage": {"type": "NUMBER"},
                        "asset_turnover": {"type": "NUMBER"},
                    },
                },
                "ranking_band": {
                    "type": "STRING",
                    "enum": ["top_quartile", "above_median", "below_median", "bottom_quartile"],
                },
            },
        },
        "management_quality": {
            "type": "OBJECT",
            "required": ["rating", "factors"],
            "properties": {
                "rating": {"type": "STRING", "enum": ["strong", "adequate", "weak"]},
                "factors": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["factor", "evidence"],
                        "properties": {
                            "factor": {"type": "STRING"},
                            "polarity": {"type": "STRING", "enum": ["positive", "neutral", "negative"]},
                            "evidence": {
                                "type": "OBJECT",
                                "properties": {
                                    "doc_id": {"type": "STRING"},
                                    "page": {"type": "INTEGER"},
                                    "excerpt": {"type": "STRING"},
                                },
                            },
                        },
                    },
                },
            },
        },
        "customer_concentration": {
            "type": "OBJECT",
            "required": ["top_5_pct", "hhi", "concentration_band"],
            "properties": {
                "top_5_pct": {"type": "NUMBER"},
                "hhi": {"type": "NUMBER"},
                "concentration_band": {
                    "type": "STRING",
                    "enum": ["diversified", "moderate", "concentrated", "extreme"],
                },
                "named_customers": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["name", "pct"],
                        "properties": {
                            "name": {"type": "STRING"},
                            "pct": {"type": "NUMBER"},
                        },
                    },
                },
            },
        },
        "stress_scenarios": {
            "type": "OBJECT",
            "description": "DSCR + leverage under stressed conditions; flags any minimum-ratio breach.",
            "required": ["scenarios"],
            "properties": {
                "scenarios": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["name", "dscr", "leverage", "passes"],
                        "properties": {
                            "name": {"type": "STRING"},
                            "dscr": {"type": "NUMBER"},
                            "leverage": {"type": "NUMBER"},
                            "passes": {"type": "BOOLEAN"},
                            "notes": {"type": "STRING"},
                        },
                    },
                },
            },
        },
        "collateral": {
            "type": "OBJECT",
            "required": ["coverage_band"],
            "properties": {
                "coverage_band": {
                    "type": "STRING",
                    "enum": ["over_collateralized", "adequate", "thin", "unsecured"],
                },
                "appraised_value_total": {"type": "NUMBER"},
                "haircut_value_total": {"type": "NUMBER"},
                "items": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["type", "appraised_value"],
                        "properties": {
                            "type": {"type": "STRING"},
                            "description": {"type": "STRING"},
                            "appraised_value": {"type": "NUMBER"},
                            "haircut_pct": {"type": "NUMBER"},
                        },
                    },
                },
            },
        },
        "regulatory": {
            "type": "OBJECT",
            "required": ["findings"],
            "properties": {
                "findings": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["regulation", "status"],
                        "properties": {
                            "regulation": {"type": "STRING"},
                            "status": {
                                "type": "STRING",
                                "enum": ["compliant", "noted", "violation"],
                            },
                            "detail": {"type": "STRING"},
                        },
                    },
                },
            },
        },
    },
}


# ── ADK agent registration (only built when google.adk is importable —
#    keeps the module testable without ADK installed locally).

def build_analyst_agent():  # pragma: no cover — runtime constructor
    from google.adk.agents import LlmAgent
    from google.adk.models import Gemini

    return LlmAgent(
        name="credit_memo_analyst",
        model=Gemini("gemini-3-1-flash"),
        description=(
            "Single-call analyst: produces normalization + peer_set + "
            "management_quality + customer_concentration + stress_scenarios + "
            "collateral + regulatory in one Vertex Gemini call constrained "
            "by ANALYST_RESPONSE_SCHEMA."
        ),
        instruction=(PROMPT_DIR / "analyst.md").read_text(),
        tools=[],
        memory_scope="application",
        output_key="analyst_output",
    )
