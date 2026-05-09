"""
credit-memo-commercial supervisor — 13-agent specialist team.

Coordinates the credit memo pipeline across 12 specialist sub-agents plus the
supervisor itself. The supervisor is the public entry point called by Cloud
Workflows; the workflow pre-fetches deployed atomic services (financial-spreader,
dscr-calculator, covenant-analyzer, peer-benchmarker, industry-risk-scorer,
collateral-valuator, exposure-aggregator, insider-screening) and passes their
results in service_results before invoking the supervisor.

Specialist roster (12):
  1. document_classifier         (Gemini Flash; classification)
  2. extractor                   (Claude Opus; financial-statement extraction)
  3. financial_spreader_agent    (Claude Opus; banker normalization narrative)
  4. management_quality_rater    (Claude Opus; CEO/CFO/board quality)
  5. customer_concentration_analyzer (Claude Opus; HHI, top-N)
  6. peer_set_curator            (Claude Opus; cohort + percentiles)
  7. stress_scenario_modeler     (Claude Opus; 4 scenarios + cliff)
  8. collateral_appraiser        (Claude Opus; 12 CFR 34 haircuts)
  9. covenant_designer           (Claude Opus; maintenance + incurrence package)
 10. regulatory_checker          (Claude Opus; 12 CFR 32/215/34, Reg B, OFAC)
 11. rater                       (Claude Opus; OCC band synthesis)
 12. drafter                     (Claude Opus; 10-section memo)
 (+) memo_reviewer               (Claude Opus; second-pass quality gate)

Memory scope: borrower_id.
"""
from __future__ import annotations
from pathlib import Path

from google.adk.agents import LlmAgent
from google.adk.models import Claude
from google.adk.tools import AgentTool

from .document_classifier import document_classifier_agent
from .extractor import extractor_agent
from .financial_spreader_agent import financial_spreader_agent
from .management_quality_rater import management_quality_rater_agent
from .customer_concentration_analyzer import customer_concentration_analyzer_agent
from .peer_set_curator import peer_set_curator_agent
from .stress_scenario_modeler import stress_scenario_modeler_agent
from .collateral_appraiser import collateral_appraiser_agent
from .covenant_designer import covenant_designer_agent
from .regulatory_checker import regulatory_checker_agent
from .rater import rater_agent
from .drafter import drafter_agent
from .memo_reviewer import memo_reviewer_agent

PROMPT_DIR = Path(__file__).parent / "prompts"

supervisor = LlmAgent(
    name="credit_memo_supervisor",
    model=Claude("claude-opus-4-7"),
    description=(
        "Coordinates the credit memo pipeline across 12 specialist sub-agents plus a "
        "second-pass memo_reviewer. Routes documents through classification, extraction, "
        "spreading, specialist analysis (management, concentration, peers, stress, "
        "collateral, covenants, regulatory), risk rating, drafting, and review. Produces a "
        "CreditMemoBundle for credit officer review."
    ),
    instruction=(PROMPT_DIR / "supervisor.md").read_text(),
    tools=[
        AgentTool(agent=document_classifier_agent),
        AgentTool(agent=extractor_agent),
        AgentTool(agent=financial_spreader_agent),
        AgentTool(agent=management_quality_rater_agent),
        AgentTool(agent=customer_concentration_analyzer_agent),
        AgentTool(agent=peer_set_curator_agent),
        AgentTool(agent=stress_scenario_modeler_agent),
        AgentTool(agent=collateral_appraiser_agent),
        AgentTool(agent=covenant_designer_agent),
        AgentTool(agent=regulatory_checker_agent),
        AgentTool(agent=rater_agent),
        AgentTool(agent=drafter_agent),
        AgentTool(agent=memo_reviewer_agent),
    ],
    memory_scope="borrower",
    output_key="credit_memo_bundle",
)

# Public entry point for Cloud Workflows
agent = supervisor
