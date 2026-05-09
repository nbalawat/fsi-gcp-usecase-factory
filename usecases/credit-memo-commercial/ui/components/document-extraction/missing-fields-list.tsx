"use client";

/**
 * Required vs preferred missing fields, with quick visual separation.
 * Required missing → blocker for downstream agents; preferred missing
 * is informational.
 */

import * as React from "react";

interface Props {
  required: string[];
  preferred: string[];
}

export function MissingFieldsList({ required, preferred }: Props): React.ReactElement | null {
  if (required.length === 0 && preferred.length === 0) return null;

  return (
    <div className="space-y-2">
      {required.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3">
          <h4 className="mb-1 text-sm font-semibold text-amber-900">
            Required fields missing ({required.length})
          </h4>
          <p className="mb-2 text-xs text-amber-800">
            These fields are required for underwriting. The validation gate
            will route this application back for revision unless they are
            supplied or extracted from a corroborating document.
          </p>
          <ul className="space-y-0.5">
            {required.map((f) => (
              <li
                key={f}
                className="font-mono text-xs text-amber-900"
              >
                • {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preferred.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <h4 className="mb-1 text-sm font-semibold text-slate-700">
            Preferred fields missing ({preferred.length})
          </h4>
          <p className="mb-2 text-xs text-slate-600">
            Informational — the analyst can proceed without these but the memo
            will note their absence.
          </p>
          <ul className="space-y-0.5">
            {preferred.map((f) => (
              <li
                key={f}
                className="font-mono text-xs text-slate-600"
              >
                • {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
