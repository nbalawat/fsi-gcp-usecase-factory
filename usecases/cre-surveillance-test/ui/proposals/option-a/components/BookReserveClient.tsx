"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";

/**
 * Client wrapper around the shared <ApprovalGate>. Holds the local
 * "I just clicked it" state so the page can confirm in-line without a
 * round trip; in production this submits to the workflow's HITL queue.
 * Server pages must not pass inline functions to Server components, so
 * the click handlers live in this Client child (Rule 14 in
 * ui-standards.md).
 */
export function BookReserveClient({
  facilityId,
  recommendation,
}: {
  facilityId: string;
  recommendation: ApprovalRecommendation;
}): React.ReactElement {
  const [posted, setPosted] = React.useState<null | "accept" | "edit" | "reject">(
    null,
  );
  const [note, setNote] = React.useState<string>("");

  if (posted !== null) {
    return (
      <section
        aria-label="Reserve disposition posted"
        className="rounded-md border border-semantic-success bg-semantic-successTint p-4"
      >
        <div className="flex items-center gap-2">
          <StatusBadge kind="success">posted</StatusBadge>
          <h3 className="text-h4 font-semi text-ink-1">
            Disposition recorded
          </h3>
        </div>
        <p className="mt-2 text-body-sm text-ink-2">
          Facility <span className="font-mono">{facilityId}</span> — gate{" "}
          <span className="font-mono">book_specific_reserve</span> — recorded
          as <span className="font-mono">{posted}</span>.
        </p>
        {note && (
          <p className="mt-1 font-mono text-mono-sm text-ink-3">
            note: {note}
          </p>
        )}
        <p className="mt-3 font-mono text-mono-sm text-ink-3">
          In production this row would be appended to the HITL queue + GL
          posting workflow. The page reloads via Next.js routing; nothing
          irrevocable has actually been posted in this demo.
        </p>
      </section>
    );
  }

  return (
    <ApprovalGate
      caseId={facilityId}
      recommendation={recommendation}
      onAccept={() => {
        setPosted("accept");
      }}
      onEdit={(_id, comment) => {
        setNote(comment);
        setPosted("edit");
      }}
      onReject={(_id, comment) => {
        setNote(comment);
        setPosted("reject");
      }}
    />
  );
}
