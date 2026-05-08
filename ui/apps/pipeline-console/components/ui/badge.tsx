import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/ui";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-mono-sm font-medium leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-paper-3 text-ink-2",
        accent: "bg-accent-tint text-accent-pressed",
        success: "bg-semantic-successTint text-semantic-success",
        warning: "bg-semantic-warningTint text-semantic-warning",
        danger: "bg-semantic-dangerTint text-semantic-danger",
        info: "bg-semantic-infoTint text-semantic-info",
        outline: "border border-border bg-paper text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** When true, prefix with a 6px colored dot. */
  dot?: boolean;
}

const dotColor: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  success: "bg-semantic-success",
  warning: "bg-semantic-warning",
  danger: "bg-semantic-danger",
  info: "bg-semantic-info",
  outline: "bg-ink-3",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone, className }))}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", dotColor[tone ?? "neutral"])}
        />
      )}
      {children}
    </span>
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
