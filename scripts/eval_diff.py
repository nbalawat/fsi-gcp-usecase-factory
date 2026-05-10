"""Compare two eval-run JSON files and print a delta table.

Usage:

    python3 scripts/eval_diff.py \
        evals/results/20260510T040000__before-track-2.json \
        evals/results/20260510T060000__after-track-2.json

Prints per-scorer averages across all cases in each run, with the
delta and a rough significance flag (≥ 0.3 considered material on a
5-point scale).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _scorer_means(payload: dict[str, Any]) -> dict[str, float]:
    """Compute mean(score) per scorer name across all cases in a run."""
    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    for r in payload.get("results", []):
        for s in r.get("scores", []):
            n = s["name"]
            sums[n] = sums.get(n, 0.0) + float(s["value"])
            counts[n] = counts.get(n, 0) + 1
    return {n: sums[n] / counts[n] for n in sums}


def _delta_marker(delta: float) -> str:
    if delta >= 0.3:
        return "↑↑"
    if delta >= 0.1:
        return "↑"
    if delta <= -0.3:
        return "↓↓"
    if delta <= -0.1:
        return "↓"
    return "·"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("baseline", type=Path)
    p.add_argument("candidate", type=Path)
    args = p.parse_args()

    base = json.loads(args.baseline.read_text())
    cand = json.loads(args.candidate.read_text())

    base_means = _scorer_means(base)
    cand_means = _scorer_means(cand)

    print(f"BASELINE   {args.baseline.name}")
    print(f"  label={base.get('label')}  git={base.get('git_sha')}  cases={base.get('case_count')}  avg={base.get('average_across_cases')}")
    print(f"CANDIDATE  {args.candidate.name}")
    print(f"  label={cand.get('label')}  git={cand.get('git_sha')}  cases={cand.get('case_count')}  avg={cand.get('average_across_cases')}")
    print()

    print(f"{'scorer':28s}  {'baseline':>10s}  {'candidate':>10s}  {'delta':>8s}  sig")
    print("-" * 72)

    all_names = sorted(set(base_means) | set(cand_means))
    for name in all_names:
        b = base_means.get(name, 0.0)
        c = cand_means.get(name, 0.0)
        d = c - b
        print(f"{name:28s}  {b:10.2f}  {c:10.2f}  {d:+8.2f}  {_delta_marker(d)}")

    overall_b = base.get("average_across_cases", 0.0)
    overall_c = cand.get("average_across_cases", 0.0)
    overall_d = overall_c - overall_b
    print("-" * 72)
    print(f"{'OVERALL':28s}  {overall_b:10.2f}  {overall_c:10.2f}  {overall_d:+8.2f}  {_delta_marker(overall_d)}")

    cost_b = base.get("total_cost_usd", 0.0)
    cost_c = cand.get("total_cost_usd", 0.0)
    print(f"\nLLM-judge cost: baseline ${cost_b:.4f}, candidate ${cost_c:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
