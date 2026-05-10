"use client";

/**
 * RulesTable — full disclosure of every JDM rule that evaluated
 * for the case. Reads `application_events` rows of type
 * `rule_evaluated` and renders one row per rule with:
 *
 *   - human-readable label + regulatory citation
 *   - decision badge (PASS / WARNING / BREACH / SKIP / ERROR)
 *   - inputs used (key/value, banker-formatted)
 *   - outputs (e.g. headroom_dollars, applicable_limit)
 *   - reason / regulatory basis
 *   - latency
 *
 * This is the "show your work" surface for regulators and auditors.
 * Every rule that the workflow ran appears here, including SKIPs and
 * ERRORs — never silently omitted, so the audit trail is complete.
 */

import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/ui";

interface RuleEvent {
  rule_set: string;
  decision: string;
  reason?: string | null;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
  skipped?: boolean;
  latency_ms?: number | null;
  occurred_at?: string;
}

interface Props {
  events: RuleEvent[];
}

/** Map rule_set name → human-readable label + regulatory citation +
 *  one-line description of what the rule enforces. Bankers see the
 *  label + citation; the description explains why the rule exists for
 *  newer reviewers. */
const RULE_META: Record<
  string,
  { label: string; citation: string; description: string }
> = {
  single_borrower_exposure: {
    label: "Single-borrower exposure",
    citation: "OCC 12 CFR 32 · §32.3",
    description:
      "Aggregate committed exposure to a single borrower must not exceed 15% of Tier 1 capital.",
  },
  dscr_threshold_by_industry: {
    label: "DSCR threshold by industry",
    citation: "Bank policy · industry DSCR floors",
    description:
      "Debt service coverage must clear the floor for the borrower's NAICS 2-digit sector.",
  },
  leverage_threshold_by_industry: {
    label: "Leverage threshold by industry",
    citation: "Bank policy · industry leverage ceilings",
    description:
      "Total debt / EBITDA ratio must stay under the ceiling for the borrower's sector.",
  },
  reg_o_individual_limit: {
    label: "Reg O — individual insider limit",
    citation: "12 CFR 215.4(c)",
    description:
      "Loans to an individual insider cannot exceed the greater of $500K or 10% of unimpaired capital.",
  },
  sector_concentration_limit: {
    label: "Sector concentration limit",
    citation: "Bank policy · NAICS sector caps",
    description:
      "Aggregate exposure to any single industry sector must stay below the bank's sector cap.",
  },
  geographic_concentration_limit: {
    label: "Geographic concentration limit",
    citation: "Bank policy · state caps",
    description:
      "Aggregate exposure in any one state must stay below the geographic concentration ceiling.",
  },
  cre_concentration_limit: {
    label: "CRE concentration limit",
    citation: "FDIC FIL-104-2006",
    description:
      "Construction & total CRE loans as % of capital must clear interagency CRE concentration thresholds.",
  },
  insider_aggregate_limit: {
    label: "Reg O — aggregate insider lending",
    citation: "12 CFR 215.4(d)",
    description:
      "Total insider loans must not exceed unimpaired capital + surplus.",
  },
};

const DECISION_TONE: Record<
  string,
  {
    Icon: React.ComponentType<{ className?: string }>;
    badge: string;
    text: string;
    label: string;
  }
> = {
  APPROVE: {
    Icon: CheckCircle2,
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    text: "text-emerald-700",
    label: "Pass",
  },
  PASS: {
    Icon: CheckCircle2,
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    text: "text-emerald-700",
    label: "Pass",
  },
  WARNING: {
    Icon: AlertTriangle,
    badge: "bg-amber-50 text-amber-900 ring-amber-300",
    text: "text-amber-700",
    label: "Warning",
  },
  REFER: {
    Icon: AlertTriangle,
    badge: "bg-amber-50 text-amber-900 ring-amber-300",
    text: "text-amber-700",
    label: "Refer",
  },
  DECLINE: {
    Icon: XCircle,
    badge: "bg-rose-50 text-rose-800 ring-rose-300",
    text: "text-rose-700",
    label: "Breach",
  },
  BREACH: {
    Icon: XCircle,
    badge: "bg-rose-50 text-rose-800 ring-rose-300",
    text: "text-rose-700",
    label: "Breach",
  },
  SKIP: {
    Icon: MinusCircle,
    badge: "bg-slate-100 text-slate-700 ring-slate-300",
    text: "text-slate-600",
    label: "Skipped",
  },
  ERROR: {
    Icon: AlertOctagon,
    badge: "bg-rose-100 text-rose-900 ring-rose-400",
    text: "text-rose-700",
    label: "Error",
  },
};

/** Format a value for the inputs/outputs cells. Numbers > 1k get
 *  comma-formatted; floats get fixed precision; bools render as
 *  yes/no; arrays/objects get a compact JSON stringification. */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") {
    if (Math.abs(v) >= 1_000_000) {
      return `${(v / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(v) >= 1_000) {
      return v.toLocaleString();
    }
    if (!Number.isInteger(v)) return v.toFixed(3);
    return String(v);
  }
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return `[${v.length}]`;
  return JSON.stringify(v);
}

export function RulesTable({ events }: Props): React.ReactElement {
  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-rule p-8 text-center">
        <p className="text-body-sm text-ink-3">
          No rules have been evaluated for this case yet. Rules run after
          extraction completes.
        </p>
      </div>
    );
  }

  // Aggregate counts for the summary strip
  const counts = events.reduce<Record<string, number>>((acc, e) => {
    const decision = e.decision?.toUpperCase() ?? "UNKNOWN";
    acc[decision] = (acc[decision] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="space-y-4" aria-label="Regulatory + policy rules">
      {/* Header + summary chips */}
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h2 className="text-h3 font-serif font-semi tracking-tight text-ink-1">
            Regulatory + policy rules
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-3">
            Every JDM rule that ran on this case — disclosure surface for
            regulators, auditors, and credit-officer review.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([decision, count]) => {
            const tone = (DECISION_TONE[decision] ?? DECISION_TONE.SKIP)!;
            return (
              <span
                key={decision}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-mono-sm font-mono ring-1",
                  tone.badge,
                )}
              >
                <tone.Icon className="h-3 w-3" />
                {count} {tone.label.toLowerCase()}
              </span>
            );
          })}
        </div>
      </header>

      {/* Rules — one compact card per rule. Each card lays out as:
              header row:  [icon] rule name · citation                [decision · latency]
              description: one-line muted subtitle (truncated by max-w + title attr)
              inputs:      inline key=value chips (font-mono, comma-separated, wraps)
              outputs:     same, only when present
              why:         reason text on its own line (italic if rule passed silently)
          Vertical layout > wide table for this kind of disclosure list:
          works at any viewport width, no horizontal scroll, no column-clip. */}
      <ul className="grid gap-2">
        {events.map((e, i) => {
          const meta =
            RULE_META[e.rule_set] ??
            ({
              label: e.rule_set,
              citation: "",
              description: "",
            } as { label: string; citation: string; description: string });
          const decision = (e.decision ?? "").toUpperCase();
          const tone = (DECISION_TONE[decision] ?? DECISION_TONE.SKIP)!;
          return (
            <li
              key={`${e.rule_set}-${i}`}
              className="rounded-md border border-rule bg-paper p-3"
            >
              {/* Header: rule name · citation                  Decision · latency */}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-semi text-ink-1">
                    {meta.label}
                  </span>
                  {meta.citation ? (
                    <span className="shrink-0 font-mono text-mono-sm text-ink-3">
                      · {meta.citation}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-mono-sm font-mono ring-1",
                      tone.badge,
                    )}
                  >
                    <tone.Icon className="h-3 w-3" />
                    {tone.label}
                  </span>
                  {e.latency_ms != null ? (
                    <span className="font-mono text-mono-sm text-ink-3">
                      {e.latency_ms}ms
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Description — short one-liner, truncated with full text in title */}
              {meta.description ? (
                <p
                  className="mt-1 truncate text-body-sm text-ink-2"
                  title={meta.description}
                >
                  {meta.description}
                </p>
              ) : null}

              {/* Inputs — inline chips, mono, comma-separated */}
              {e.inputs && Object.keys(e.inputs).length > 0 ? (
                <p className="mt-2 font-mono text-mono-sm leading-relaxed text-ink-2">
                  <span className="mr-2 text-ink-3">inputs</span>
                  {Object.entries(e.inputs).map(([k, v], idx) => (
                    <React.Fragment key={k}>
                      {idx > 0 ? (
                        <span className="text-ink-3"> · </span>
                      ) : null}
                      <span>
                        <span className="text-ink-3">{k}</span>
                        <span className="text-ink-3">=</span>
                        <span className="text-ink-1">{formatValue(v)}</span>
                      </span>
                    </React.Fragment>
                  ))}
                </p>
              ) : null}

              {/* Outputs — inline chips, only when present */}
              {e.outputs && Object.keys(e.outputs).length > 0 ? (
                <p className="mt-1 font-mono text-mono-sm leading-relaxed text-ink-2">
                  <span className="mr-2 text-ink-3">outputs</span>
                  {Object.entries(e.outputs).map(([k, v], idx) => (
                    <React.Fragment key={k}>
                      {idx > 0 ? (
                        <span className="text-ink-3"> · </span>
                      ) : null}
                      <span>
                        <span className="text-ink-3">{k}</span>
                        <span className="text-ink-3">=</span>
                        <span className="text-ink-1">{formatValue(v)}</span>
                      </span>
                    </React.Fragment>
                  ))}
                </p>
              ) : null}

              {/* Why — only render when there's a non-trivial reason */}
              {e.reason && e.reason.trim().length > 0 ? (
                <p
                  className={cn(
                    "mt-2 text-body-sm leading-snug",
                    decision === "ERROR" || decision === "BREACH" || decision === "DECLINE"
                      ? "text-rose-700"
                      : decision === "WARNING" || decision === "REFER"
                        ? "text-amber-800"
                        : "text-ink-2",
                  )}
                >
                  {e.reason}
                </p>
              ) : e.skipped ? (
                <p className="mt-2 text-body-sm italic text-ink-3">
                  Skipped — input not yet computed by upstream services.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-mono-sm font-mono text-ink-3">
        Rules engine: GoRules Zen JDM. Each rule is versioned in
        <code className="mx-1 rounded-sm bg-paper-2 px-1">
          rules/&lt;rule_set&gt;/v&lt;n&gt;.json
        </code>
        with golden tests; this table reflects the version that ran on
        this case at the time of evaluation.
      </p>
    </section>
  );
}

