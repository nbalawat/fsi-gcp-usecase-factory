import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  FileSpreadsheet,
  ShieldCheck,
  PenLine,
  CheckCircle2,
  CircleDot,
  CircleDashed,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/ui";

export type StepState = "done" | "active" | "pending" | "blocked";

export interface TimelineStep {
  /** Plain-English title a credit officer would recognise. */
  title: string;
  /** Plain-English subtitle explaining what's happening / happened. */
  subtitle: string;
  /** "9:42 AM" or "3 min ago" — passed pre-formatted. */
  when?: string;
  /** Who: "System · Document AI", "Senior Credit Committee", "Credit officer". */
  by?: string;
  /** Step state. */
  state: StepState;
  /** Icon — credit-officer-friendly. */
  icon: "received" | "spreading" | "policy" | "drafting" | "decision" | "posted";
}

export interface WorkflowTimelineProps {
  steps: TimelineStep[];
  /** Optional title above the timeline. */
  title?: string;
  /** Optional description. */
  description?: string;
}

const iconMap = {
  received: Inbox,
  spreading: FileSpreadsheet,
  policy: ShieldCheck,
  drafting: PenLine,
  decision: CheckCircle2,
  posted: CheckCircle2,
};

const stateBadgeTone: Record<StepState, "success" | "accent" | "neutral" | "danger"> = {
  done: "success",
  active: "accent",
  pending: "neutral",
  blocked: "danger",
};

const stateLabel: Record<StepState, string> = {
  done: "Complete",
  active: "In progress",
  pending: "Waiting",
  blocked: "Blocked",
};

/**
 * Banker-friendly workflow timeline — each step in plain English.
 * No "atomic services", no "Zen JDM", no "ADK", no agent role names.
 */
export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  steps,
  title = "Application progress",
  description,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description && (
        <p className="text-body-sm text-ink-3">{description}</p>
      )}
    </CardHeader>
    <CardContent>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <Step
            key={i}
            step={s}
            isLast={i === steps.length - 1}
          />
        ))}
      </ol>
    </CardContent>
  </Card>
);

const Step: React.FC<{ step: TimelineStep; isLast: boolean }> = ({
  step,
  isLast,
}) => {
  const Icon = iconMap[step.icon];
  const stateColor =
    step.state === "done"
      ? "bg-semantic-success text-paper"
      : step.state === "active"
        ? "bg-accent text-accent-fg"
        : step.state === "blocked"
          ? "bg-semantic-danger text-paper"
          : "bg-paper-3 text-ink-3";

  return (
    <li className="flex items-start gap-4">
      <div className="flex flex-col items-center pt-0.5">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            stateColor,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        {!isLast && (
          <span
            aria-hidden
            className={cn(
              "mt-1 w-px flex-1",
              step.state === "done" ? "bg-semantic-success/40" : "bg-rule",
            )}
            style={{ minHeight: 36 }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-body font-semi text-ink-1">{step.title}</h4>
          <Badge tone={stateBadgeTone[step.state]} dot>
            {stateLabel[step.state]}
          </Badge>
          {step.when && (
            <span className="font-mono text-mono-sm text-ink-3">
              {step.when}
            </span>
          )}
        </div>
        <p className="mt-1 text-body-sm text-ink-2">{step.subtitle}</p>
        {step.by && (
          <p className="mt-1 text-mono-sm font-mono text-ink-3">{step.by}</p>
        )}
      </div>
    </li>
  );
};
