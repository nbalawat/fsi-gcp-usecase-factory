"use client";

import * as React from "react";
import {
  WorkflowStageRail,
  MetricStrip,
  BreadcrumbNav,
} from "@fsi-bank/components";
import type { Stage, StageType, Metric } from "@fsi-bank/components";
// StageType used below in stageType() helper.
import {
  SECTIONS,
  CASE_SHAPE,
  PRIMARY_BORROWER,
  HITL_GATES,
  extractedHeadline,
  type SectionDecision,
  type SectionKind,
  type GateId,
} from "../lib/data";
import { SectionCard } from "./SectionCard";
import {
  ExtractionBody,
  SpreadBody,
  PeerBody,
  CollateralBody,
  BorrowerNetworkBody,
  RatingBody,
  RulesBody,
  DraftBody,
  FinalBody,
} from "./SectionBodies";
import { SectionJumpRail } from "./SectionJumpRail";

interface CaseMemoProps {
  caseId: string;
}

/**
 * Full case-detail page. Every section ends with an InlineActionBar.
 * The "approval drawer" anti-pattern is deliberately absent — the
 * user's eye never leaves the section to act.
 */
export const CaseMemo: React.FC<CaseMemoProps> = ({ caseId }) => {
  // Section-level decision state. The page is the source of truth for
  // the in-progress review; on a real run this would post each decision
  // to the audit-writer.
  const [decisions, setDecisions] = React.useState<
    Record<SectionKind, SectionDecision>
  >(() =>
    SECTIONS.reduce(
      (acc, s) => {
        acc[s.id] = { kind: "pending" };
        return acc;
      },
      {} as Record<SectionKind, SectionDecision>,
    ),
  );

  const onDecide = (id: SectionKind) => (next: SectionDecision) => {
    setDecisions((d) => ({ ...d, [id]: next }));
  };

  // Map canvas stages → WorkflowStageRail rows. The "type" axis is
  // borrowed from the canonical rail (agent | human | mixed | auto) —
  // those four are the same labels the canvas uses for its HITL gates.
  const stageType = (id: string): StageType => {
    if (id === "approval" || id === "reviewing") return "human";
    if (id === "intake" || id === "done") return "auto";
    if (id === "rating" || id === "drafting") return "mixed";
    return "agent";
  };
  const stages: Stage[] = CASE_SHAPE.stages.map((s) => ({
    id: s,
    name: s,
    type: stageType(s),
    count: 1,
  }));

  const h = extractedHeadline();
  const metrics: Metric[] = [
    {
      id: "rev",
      label: "Revenue",
      value: h.revenue !== null ? `$${(h.revenue / 1000).toFixed(2)}B` : "—",
      state: "ok",
    },
    {
      id: "ebitda",
      label: "EBITDA",
      value: h.ebitda !== null ? `$${h.ebitda}M` : "—",
      state: "ok",
    },
    {
      id: "dscr",
      label: "DSCR",
      value: "2.21x",
      state: "ok",
      trend: 1,
    },
    {
      id: "rating",
      label: "Rec. rating",
      value: "1-pass",
      state: "ok",
    },
    {
      id: "gates",
      label: "Inline gates",
      value: `${gatesSatisfied(decisions)} / 4`,
      state: gatesSatisfied(decisions) === 4 ? "ok" : "warning",
    },
  ];

  const approvalHref = `/approval/${caseId}`;

  return (
    <div className="flex flex-col">
      <BreadcrumbNav
        usecase="credit-memo-commercial-test"
        usecaseLabel="Commercial Credit · Option C"
        stage="review"
        caseId={caseId}
        borrowerName={PRIMARY_BORROWER?.name ?? ""}
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">case · {caseId}</div>
            <h1 className="mt-1 font-serif text-h2 font-semi text-ink-1">
              {CASE_SHAPE.title}
            </h1>
            <p className="mt-1 text-body-sm text-ink-2">
              Primary actor: {CASE_SHAPE.primary_actor} · Decision kind:{" "}
              {CASE_SHAPE.decision_kind}
            </p>
          </div>
          <a
            href={approvalHref}
            className="rounded bg-ink-1 px-4 py-2 text-mono-sm font-medium text-paper hover:bg-ink-2"
          >
            Fast-track review →
          </a>
        </div>
      </header>

      <WorkflowStageRail stages={stages} currentStage="reviewing" />
      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <SectionJumpRail
            sections={SECTIONS}
            decisions={decisions}
            gates={HITL_GATES as GateId[]}
          />
        </aside>
        <div className="flex flex-col gap-5">
          {SECTIONS.map((s) => (
            <SectionCard
              key={s.id}
              caseId={caseId}
              id={s.id}
              title={s.title}
              prompt={s.prompt}
              source={s.source}
              gate={s.gate}
              confidence={s.confidence}
              tone={s.tone}
              decision={decisions[s.id] ?? { kind: "pending" }}
              onDecide={onDecide(s.id)}
            >
              {renderBody(s.id)}
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  );
};

const renderBody = (id: SectionKind): React.ReactNode => {
  switch (id) {
    case "extraction":
      return <ExtractionBody />;
    case "spread":
      return <SpreadBody />;
    case "peer":
      return <PeerBody />;
    case "collateral":
      return <CollateralBody />;
    case "borrower-network":
      return <BorrowerNetworkBody />;
    case "rating":
      return <RatingBody />;
    case "rules":
      return <RulesBody />;
    case "draft":
      return <DraftBody />;
    case "final":
      return <FinalBody />;
  }
};

// Count of HITL gates that have at least one approve and no
// non-approve outstanding among their constituent sections.
const gatesSatisfied = (
  d: Record<SectionKind, SectionDecision>,
): number => {
  const gates: GateId[] = [
    "extraction_review",
    "rating_review",
    "draft_review",
    "final_approval",
  ];
  let n = 0;
  for (const g of gates) {
    const sectionsForGate = SECTIONS.filter((s) => s.gate === g);
    const allApprove = sectionsForGate.every(
      (s) => d[s.id]?.kind === "approve",
    );
    if (allApprove && sectionsForGate.length > 0) n += 1;
  }
  return n;
};
