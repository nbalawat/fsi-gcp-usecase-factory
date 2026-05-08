import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActivityRow {
  id: number;
  application_id: string;
  borrower_name: string;
  event_type: string;
  summary: string;
  occurred_at: string;
}

interface Props {
  rows: ActivityRow[];
}

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const eventTone = (e: string) =>
  e === "decision_made"
    ? ("accent" as const)
    : e === "sink_completed"
      ? ("success" as const)
      : ("neutral" as const);

/**
 * Last-N portfolio events feed for the CCO portfolio home.
 * Empty state is purposeful — the line tells the CCO what they'll see here
 * once underwriting decisions are flowing.
 */
export const RecentActivityFeed: React.FC<Props> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-rule bg-paper-2 px-5 py-8 text-center">
        <p className="text-body-sm font-semi text-ink-1">No recent decisions</p>
        <p className="mt-1 text-body-sm text-ink-3">
          Approvals, declines, and downstream postings will appear here as
          underwriters work through the queue.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between gap-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-body-sm font-semi text-ink-1">
              {r.borrower_name}
            </p>
            <p className="truncate font-mono text-mono-sm text-ink-3">
              {r.summary}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={eventTone(r.event_type)} dot>
              {fmtTime(r.occurred_at)}
            </Badge>
            <Link
              href={`/cases/${encodeURIComponent(r.application_id)}`}
              className="inline-flex items-center gap-1 text-mono-sm text-accent-pressed hover:underline"
              aria-label={`Open case for ${r.borrower_name}`}
            >
              Open case
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
};
