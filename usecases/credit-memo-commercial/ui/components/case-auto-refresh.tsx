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
}

export const CaseAutoRefresh: React.FC<Props> = ({
  applicationId,
  initialStage,
}) => {
  const router = useRouter();
  const { case: live } = useLiveCase(applicationId);
  const lastStageRef = React.useRef(initialStage);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!live) return;
    const stage = live.current_stage;
    if (!stage || stage === lastStageRef.current) return;

    // Stage advanced — schedule a refresh. Debounce by 1s so a burst of
    // intake→spreading→policy events doesn't trigger 4 reloads.
    lastStageRef.current = stage;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
    }, 1000);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [live, router]);

  return null;
};
