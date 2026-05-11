import * as React from "react";

export type BadgeKind =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent";

export interface StatusBadgeProps {
  kind?: BadgeKind;
  children: React.ReactNode;
}

const kindStyles: Record<BadgeKind, { bg: string; fg: string; dot: string }> = {
  success: {
    bg: "bg-semantic-successTint",
    fg: "text-semantic-success",
    dot: "bg-semantic-success",
  },
  warning: {
    bg: "bg-semantic-warningTint",
    fg: "text-semantic-warning",
    dot: "bg-semantic-warning",
  },
  danger: {
    bg: "bg-semantic-dangerTint",
    fg: "text-semantic-danger",
    dot: "bg-semantic-danger",
  },
  info: {
    bg: "bg-semantic-infoTint",
    fg: "text-semantic-info",
    dot: "bg-semantic-info",
  },
  neutral: {
    bg: "bg-paper-3",
    fg: "text-ink-2",
    dot: "bg-ink-3",
  },
  accent: {
    bg: "bg-accent-tint",
    fg: "text-accent-pressed",
    dot: "bg-accent",
  },
};

/**
 * Inline status badge: small dot + tinted pill.
 * Used in dense tables and KPIs.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  kind = "neutral",
  children,
}) => {
  const s = kindStyles[kind];
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-mono-sm font-medium leading-none ${s.bg} ${s.fg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {children}
    </span>
  );
};
