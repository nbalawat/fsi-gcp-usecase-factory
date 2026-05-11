// Re-export bar for the inlined shared primitives. NO _vendor symlinks
// (per Rule 38 / self-contained build). Each primitive's source comment
// records its provenance against ui/packages/components/src/<name>.tsx.

export { AppShell } from "./AppShell";
export type { AppShellProps, NavItem } from "./AppShell";

export { BreadcrumbNav } from "./BreadcrumbNav";
export type { BreadcrumbNavProps, Crumb } from "./BreadcrumbNav";

export { CaseCard } from "./CaseCard";
export type { CaseCardProps, RiskBand } from "./CaseCard";

export { MetricStrip } from "./MetricStrip";
export type { MetricStripProps, Metric } from "./MetricStrip";

export { StatusBadge } from "./StatusBadge";
export type { StatusBadgeProps, BadgeKind } from "./StatusBadge";

export { ApprovalGate } from "./ApprovalGate";
export type {
  ApprovalGateProps,
  ApprovalRecommendation,
  ApprovalDisposition,
} from "./ApprovalGate";
