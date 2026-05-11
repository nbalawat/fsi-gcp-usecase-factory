"use client";

import * as React from "react";
import {
  FEATURES,
  MCCS,
  heatLevelOf,
  type CellTally,
  type HeatLevel,
} from "../lib/data";
import { HeatmapCellDetail } from "./HeatmapCellDetail";

const HEAT_BG: Record<HeatLevel, string> = {
  0: "bg-heat-0",
  1: "bg-heat-1",
  2: "bg-heat-2",
  3: "bg-heat-3",
  4: "bg-heat-4",
  5: "bg-heat-5",
};

// Foreground text colour: dark on the lightest three, near-white on the
// hottest three so the number stays readable against the cell.
const HEAT_FG: Record<HeatLevel, string> = {
  0: "text-ink-4",
  1: "text-ink-2",
  2: "text-ink-1",
  3: "text-ink-1",
  4: "text-paper",
  5: "text-paper",
};

export interface HeatmapGridProps {
  cells: CellTally[];
  /** Build the drill-in href for the most-recent event of a cell. */
  buildEventHref: (eventId: string) => string;
}

/**
 * The wildcard's signature: a 2D feature × MCC grid. Each cell is a
 * real button — click selects the cell and opens the drill-in panel
 * below the grid. Read-only audit view — no decisions are made here.
 *
 * Client component because cell selection is interactive (the
 * orchestrator's auditor allows useState only at the leaf-most
 * interactive node).
 */
export const HeatmapGrid: React.FC<HeatmapGridProps> = ({
  cells,
  buildEventHref,
}) => {
  const byKey = React.useMemo(() => {
    const m = new Map<string, CellTally>();
    for (const c of cells) m.set(`${c.feature}::${c.mcc}`, c);
    return m;
  }, [cells]);

  const [selected, setSelected] = React.useState<string | null>(null);

  const selectedCell =
    selected !== null ? byKey.get(selected) ?? null : null;

  return (
    <section
      aria-label="Feature by MCC firing heatmap"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow">Firing population</div>
          <h2 className="font-serif text-xl font-semibold text-ink-1">
            Feature × MCC heatmap
          </h2>
        </div>
        <span className="font-mono text-xs text-ink-3 tabular-nums">
          {cells.filter((c) => c.count > 0).length} of {cells.length} cells lit
        </span>
      </header>

      <div className="overflow-x-auto">
        <table
          role="grid"
          aria-label="Feature by MCC firing tally"
          className="min-w-full border-separate border-spacing-0 text-sm"
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 border-b border-rule bg-paper px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-ink-3"
              >
                feature \ mcc
              </th>
              {MCCS.map((m) => (
                <th
                  key={m.id}
                  scope="col"
                  className="border-b border-rule bg-paper px-2 py-2 text-left font-mono text-xs text-ink-2"
                >
                  <div className="text-ink-1">{m.label}</div>
                  <div className="text-ink-4">{m.id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-rule bg-paper px-3 py-2 text-left align-top"
                >
                  <div className="font-mono text-xs text-ink-1">
                    {f.label}
                  </div>
                  <div className="font-mono text-xs uppercase tracking-wide text-ink-4">
                    {f.family}
                  </div>
                </th>
                {MCCS.map((m) => {
                  const key = `${f.id}::${m.id}`;
                  const cell = byKey.get(key);
                  const count = cell?.count ?? 0;
                  const level = heatLevelOf(count);
                  const isSelected = selected === key;
                  const disabled = count === 0;
                  const tooltip = `${f.label} × ${m.label}: ${count} firing(s)`;
                  return (
                    <td
                      key={key}
                      className="border-b border-rule p-0 align-top"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(isSelected ? null : key)}
                        disabled={disabled}
                        aria-label={tooltip}
                        aria-pressed={isSelected}
                        title={tooltip}
                        className={[
                          "flex h-14 w-full flex-col items-start justify-between px-2 py-1.5 transition",
                          HEAT_BG[level],
                          HEAT_FG[level],
                          disabled
                            ? "cursor-not-allowed opacity-70"
                            : "cursor-pointer hover:ring-2 hover:ring-accent hover:ring-inset",
                          isSelected
                            ? "ring-2 ring-accent ring-inset"
                            : "",
                        ].join(" ")}
                      >
                        <span className="font-mono text-base font-semibold tabular-nums">
                          {count}
                        </span>
                        {count > 0 && (
                          <span className="font-mono text-xs">
                            {cell?.declines ?? 0}d / {cell?.stepUps ?? 0}s
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend row — six steps, white → danger. */}
      <div className="flex items-center gap-2 border-t border-rule px-4 py-2">
        <span className="font-mono text-xs uppercase tracking-wide text-ink-3">
          intensity
        </span>
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span
            key={l}
            aria-hidden
            className={[
              "h-4 w-6 border border-rule",
              HEAT_BG[l as HeatLevel],
            ].join(" ")}
            title={`level ${l}`}
          />
        ))}
        <span className="font-mono text-xs text-ink-3">none</span>
        <span className="ml-auto font-mono text-xs text-ink-3">peak</span>
      </div>

      {/* Drill-in panel renders inline; closes when user re-clicks the cell. */}
      {selectedCell && (
        <HeatmapCellDetail
          cell={selectedCell}
          eventHref={
            selectedCell.lastEventId
              ? buildEventHref(selectedCell.lastEventId)
              : undefined
          }
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
};
