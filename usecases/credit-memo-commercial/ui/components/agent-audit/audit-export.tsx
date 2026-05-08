"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditExportProps {
  applicationId: string;
}

/**
 * Two download buttons that hand the user a regulator-shareable copy of the
 * audit trail. Backed by `/api/audit/<id>/export?format=json|csv` (built by
 * the parallel agent on the data-layer track). Both render as real anchor
 * tags with `download` so they degrade gracefully if JS fails.
 */
export const AuditExport: React.FC<AuditExportProps> = ({ applicationId }) => {
  const base = `/api/audit/${encodeURIComponent(applicationId)}/export`;

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="secondary" size="sm">
        <a
          href={`${base}?format=json`}
          download={`audit-${applicationId}.json`}
          aria-label="Download audit trail as JSON"
        >
          <Download className="h-3 w-3" />
          Export JSON
        </a>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <a
          href={`${base}?format=csv`}
          download={`audit-${applicationId}.csv`}
          aria-label="Download audit trail as CSV"
        >
          <Download className="h-3 w-3" />
          Export CSV
        </a>
      </Button>
    </div>
  );
};
