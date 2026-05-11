import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import { SendApprovalClient } from "../../../components/SendApprovalClient";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  USE_CASE_ID,
  fmtUsdCompact,
  getRec,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "case", label: "Recommendation detail", icon: "activity" },
  { id: "approval", label: "Send to customer", icon: "radio" },
  { id: "agents", label: "Agents", icon: "bot" },
];

/**
 * Approval flow — the IRREVOCABLE "send to customer" gate.
 *
 * The shared ApprovalGate primitive carries the confirm-then-execute
 * UX. We pre-load the recommendation context above it so the RM has
 * everything they need on one screen, and we set
 * `recommendation.irrevocable = true` so the gate shows the explicit
 * "this cannot be undone" confirm modal.
 */
export default function ApprovalPage({
  params,
}: PageProps): React.ReactElement {
  const rec = getRec(params.id);

  return (
    <AppShell
      brand="Next-best-action"
      subtitle="Send to customer · approval"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Next-best-action"
        caseId={rec.id}
        borrowerName={rec.borrower.name}
        backHref={`/case/${rec.id}`}
        backLabel="Back to recommendation"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Customer-facing action</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              Send to {rec.borrower.name}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              This is the irrevocable step. Once you confirm, the
              recommendation surfaces in the customer's banker
              conversation and the digital channel. The audit event is
              written before the customer is notified.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="danger">Irrevocable</StatusBadge>
            <StatusBadge kind="info">{rec.id}</StatusBadge>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_18rem]">
        <SendApprovalClient rec={rec} />

        <aside className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4">
          <div>
            <div className="eyebrow">Action</div>
            <div className="font-serif text-h4 font-semi text-ink-1">
              {rec.actionLabel}
            </div>
          </div>
          <Row label="Confidence" value={`${(rec.confidence * 100).toFixed(0)}%`} />
          <Row label="Fit score" value={`${(rec.fitScore * 100).toFixed(0)}%`} />
          <Row label="Uplift / yr" value={fmtUsdCompact(rec.upliftUsd)} />
          <Row
            label="Regulatory"
            value={rec.regulatoryClear ? "clear" : "watch"}
          />
          <Row label="Borrower" value={rec.borrower.name} />
          <Row label="Risk band" value={rec.borrower.risk_band} />
          <Row label="Canvas SHA" value={`${CANVAS_SHA256.substring(0, 8)}…`} />
        </aside>
      </div>
    </AppShell>
  );
}

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2 last:border-b-0">
    <span className="font-mono text-mono-sm text-ink-3">{label}</span>
    <span className="font-mono text-mono-sm font-semi tabular-nums text-ink-1">
      {value}
    </span>
  </div>
);
