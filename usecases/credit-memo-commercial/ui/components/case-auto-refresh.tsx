"use client";

/**
 * CaseAutoRefresh — listens to the SSE stream for THIS application_id and
 * calls router.refresh() when stage advances. Without this, server-rendered
 * case pages freeze at whatever stage was current at first paint.
 *
 * Mount once on the case detail page. Headless (renders nothing visible).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveCase } from "@/lib/live-stream";

interface Props {
  applicationId: string;
  /** The stage the page was server-rendered with. Refreshes only fire when
   *  the live stage differs (so we don't loop on a stable state). */
  initialStage: string;
  /** The last_event_at the page was server-rendered with. We also refresh
   *  when this advances (e.g. during the drafting stage as sections of
   *  the memo are written one-by-one to application_artifacts). */
  initialLastEventAt?: string | null;
}

export const CaseAutoRefresh: React.FC<Props> = ({
  applicationId,
  initialStage,
  initialLastEventAt,
}) => {
  const router = useRouter();
  const { case: live } = useLiveCase(applicationId);
  const lastStageRef = React.useRef(initialStage);
  const lastEventAtRef = React.useRef(initialLastEventAt ?? "");
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!live) return;
    const stage = live.current_stage;
    const lastEventAt = (live as { last_event_at?: string }).last_event_at ?? "";

    const stageAdvanced = !!stage && stage !== lastStageRef.current;
    // last_event_at is an ISO timestamp; string comparison is monotonic.
    const eventsAdvanced = !!lastEventAt && lastEventAt > lastEventAtRef.current;
    if (!stageAdvanced && !eventsAdvanced) return;

    if (stageAdvanced) lastStageRef.current = stage;
    if (eventsAdvanced) lastEventAtRef.current = lastEventAt;

    // Debounce by 2s so a burst of intake→spreading→policy events (or the
    // drafter writing 10 sections in quick succession) doesn't trigger
    // a refresh storm. See plan Track B step 4.
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
    }, 2000);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [live, router]);

  return null;
};
