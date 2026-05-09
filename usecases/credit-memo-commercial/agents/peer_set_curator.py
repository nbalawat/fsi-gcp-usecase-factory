"""
credit-memo-commercial peer_set_curator agent.

Selects WHICH peers the borrower should be benchmarked against. Strategy:
NAICS-6 first; expand to NAICS-4 then NAICS-3 only if peer_count < 8.
Match by size band (small <$10M revenue, mid $10M-$100M, large >$100M).
The actual ratio comparison is done downstream by the deployed peer-benchmarker
service — this agent only decides the cohort.
Memory scope: borrower_id — peer set is sticky across revisions for comparability.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

peer_set_curator_agent = LlmAgent(
    name="credit_memo_peer_set_curator",
    model=Claude("claude-opus-4-7"),
    description="Curates the borrower's peer comparator cohort by NAICS code (6 -> 4 -> 3 fallback) and revenue size band; emits peer_set_id consumed by the peer-benchmarker service.",
    instruction=(PROMPT_DIR / "peer_set_curator.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="peer_set",
)
