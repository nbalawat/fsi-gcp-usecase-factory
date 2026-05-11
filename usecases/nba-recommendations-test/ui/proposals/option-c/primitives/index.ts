// Shared primitive barrel. Every export here is `source: shared` in the
// manifest — the option's signature surface (inline disposition buttons,
// queue rows, rationale collapsibles) is composed of these primitives.
//
// NO _vendor symlinks: every primitive is materially inlined under
// ./primitives/ — self-contained per Rule 38.

export { AppShell } from "./AppShell";
export type { AppShellProps, NavItem } from "./AppShell";

export { BreadcrumbNav } from "./BreadcrumbNav";
export type { BreadcrumbNavProps, Crumb } from "./BreadcrumbNav";

export { MetricStrip } from "./MetricStrip";
export type { MetricStripProps, Metric } from "./MetricStrip";

export { StatCard } from "./StatCard";
export type { StatCardProps, StatTone } from "./StatCard";

export { StatusBadge } from "./StatusBadge";
export type { StatusBadgeProps, BadgeKind } from "./StatusBadge";

export { ApprovalGate } from "./ApprovalGate";
export type {
  ApprovalGateProps,
  ApprovalRecommendation,
  ApprovalDisposition,
} from "./ApprovalGate";
