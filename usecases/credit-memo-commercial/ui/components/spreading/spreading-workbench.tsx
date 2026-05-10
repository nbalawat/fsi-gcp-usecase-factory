"use client";

/**
 * SpreadingWorkbench — the underwriter's primary tool for reviewing,
 * adjusting, and signing off on the financial spread before the rater
 * + drafter agents consume it.
 *
 * Layout:
 *   ┌── header ─────────────────────────────────────────────────┐
 *   │  Borrower · last-spread-at · Save adjustments button      │
 *   │  Source-doc chips (10-K Q4-23, 10-Q Q3-24, AR-aging)      │
 *   ├── ratio strip (sticky) ───────────────────────────────────┤
 *   │  DSCR  Leverage  Current  ICR  ROE  ...                   │
 *   ├── line-item workbench (scrollable) ───────────────────────┤
 *   │  ┌──────────────┬─────┬─────┬────────┬─────────┐          │
 *   │  │ Line item    │ FY22│ FY23│ FY24*  │ Adjust  │          │
 *   │  ├──────────────┼─────┼─────┼────────┼─────────┤          │
 *   │  │ Revenue      │  …  │  …  │ $364B  │  +$2M   │          │
 *   │  │              │ ↑8% │ ↑3% │  ↑5%   │ one-off │          │
 *   │  └──────────────┴─────┴─────┴────────┴─────────┘          │
 *   │   * = primary fiscal year (used by downstream agents)     │
 *   └── stress scenarios (collapsible) ─────────────────────────┘
 *
 * Every cell that holds a number CAN be clicked → opens the citation
 * popover (excerpt + page) OR the adjustment editor (rationale + delta).
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import {
  BAND_CLASSES,
  fmtDelta,
  fmtPct,
  fmtRatio,
  fmtSignedUsd,
  fmtUsd,
  trendDirection,
} from "./format";
import type {
  AdjustmentEntry,
  Citation,
  FiscalKey,
  LineItemCategory,
  LineItemRow,
  RatioRow,
  ScenarioKey,
  SpreadingViewModel,
  StressScenario,
} from "./types";

interface Props {
  data: SpreadingViewModel | null;
  /** True when the workbench should be read-only (e.g. case is in `done` state). */
  read_only?: boolean;
  /** Called when the underwriter clicks "Save adjustments". */
  on_save_adjustments?: (edits: PendingEdit[]) => Promise<void> | void;
  className?: string;
}

export interface PendingEdit {
  path: string;
  fiscal_year: FiscalKey;
  /** New normalized value (replaces the prior). */
  new_value: number | null;
  /** Adjustment metadata (delta from raw, rationale). */
  adjustment: AdjustmentEntry;
}

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  income_statement: "Income statement",
  balance_sheet: "Balance sheet",
  cash_flow: "Cash flow",
  ratios: "Ratios",
};

type Density = "compact" | "comfortable";

export function SpreadingWorkbench({
  data,
  read_only = false,
  on_save_adjustments,
  className,
}: Props): React.ReactElement {
  const [pendingEdits, setPendingEdits] = React.useState<Map<string, PendingEdit>>(new Map());
  const [activeScenario, setActiveScenario] = React.useState<ScenarioKey>("base");
  const [openAdjustment, setOpenAdjustment] = React.useState<{
    path: string;
    fy: FiscalKey;
  } | null>(null);
  const [openCitation, setOpenCitation] = React.useState<Citation | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const [density, setDensity] = React.useState<Density>("comfortable");
  const [showHelp, setShowHelp] = React.useState(false);

  if (!data) {
    return <SpreadingEmptyState className={className} />;
  }

  const editsKey = (path: string, fy: FiscalKey) => `${path}::${fy}`;

  const upsertEdit = (e: PendingEdit) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      next.set(editsKey(e.path, e.fiscal_year), e);
      return next;
    });
  };

  const clearEdit = (path: string, fy: FiscalKey) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      next.delete(editsKey(path, fy));
      return next;
    });
  };

  const editsList = Array.from(pendingEdits.values());
  const hasPending = editsList.length > 0;

  // Recompute ratios live based on pending edits (placeholder math; the
  // real recompute happens server-side after save — but the underwriter
  // gets a preview so they can tell whether their adjustment moves the
  // needle on DSCR/leverage).
  const liveRatios = React.useMemo(
    () => previewRatios(data, editsList),
    [data, editsList],
  );

  async function handleSave() {
    if (!on_save_adjustments || !hasPending) return;
    setSaving(true);
    setSaveError(null);
    try {
      await on_save_adjustments(editsList);
      setPendingEdits(new Map());
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Group line items by category for visual sections.  Apply the filter
  // against label + path so the underwriter can scan to a specific row
  // ("rev" → revenue, "ebit" → ebitda + ebit).
  const filterLower = filter.trim().toLowerCase();
  const grouped = React.useMemo(() => {
    const m: Record<LineItemCategory, LineItemRow[]> = {
      income_statement: [],
      balance_sheet: [],
      cash_flow: [],
      ratios: [],
    };
    for (const r of data.line_items) {
      if (filterLower) {
        const hay = `${r.label} ${r.path}`.toLowerCase();
        if (!hay.includes(filterLower)) continue;
      }
      m[r.category].push(r);
    }
    return m;
  }, [data.line_items, filterLower]);
  const hasFilteredRows =
    grouped.income_statement.length +
      grouped.balance_sheet.length +
      grouped.cash_flow.length >
    0;

  const activeStress: StressScenario | null = React.useMemo(() => {
    if (activeScenario === "base") return null;
    return data.scenarios.find((s) => s.key === activeScenario) ?? null;
  }, [data.scenarios, activeScenario]);

  // Keyboard shortcuts: `/` focuses filter, `?` opens help, `Esc` closes
  // any open modal. Bound at the section level so they fire when the
  // workbench has focus or the user is reading it.
  const filterRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (e.key === "Escape") {
        setOpenAdjustment(null);
        setOpenCitation(null);
        setShowHelp(false);
        return;
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <section className={cn("space-y-4", className)} aria-label="Spreading workbench">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h2 className="text-h3 font-serif font-semi tracking-tight text-ink-1">
            Spreading workbench
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-3">
            {data.borrower_name} · primary year{" "}
            <strong className="text-ink-1">{data.primary_fiscal_year}</strong>
            {data.last_spread_at ? (
              <>
                {" "}
                · spread{" "}
                <time dateTime={data.last_spread_at} className="font-mono text-mono-sm">
                  {new Date(data.last_spread_at).toLocaleString()}
                </time>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPending ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-mono-sm font-mono text-amber-800 ring-1 ring-amber-200">
              {editsList.length} pending edit{editsList.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {!read_only && on_save_adjustments ? (
            <button
              type="button"
              disabled={!hasPending || saving}
              onClick={handleSave}
              className="rounded-md bg-accent px-3 py-1.5 text-body-sm font-semi text-paper shadow-sm hover:bg-accent-pressed disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save adjustments"}
            </button>
          ) : null}
        </div>
      </header>

      {/* ── Source documents ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-mono-sm font-mono">
        <span className="text-ink-3">Sources:</span>
        {data.source_docs.map((d) => (
          <span
            key={d.doc_id}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700"
            title={d.original_filename}
          >
            {d.doc_type}{" "}
            <span className="text-slate-500">
              · {d.page_count ?? "?"} pp · {d.fiscal_coverage.join(", ")}
            </span>
          </span>
        ))}
      </div>

      {saveError ? (
        <div className="rounded-md border border-semantic-danger/40 bg-semantic-dangerTint/30 p-3 text-body-sm text-semantic-danger">
          Save failed: {saveError}
        </div>
      ) : null}

      {/* ── Live ratio strip (sticky on scroll) ────────────────── */}
      <RatioStrip ratios={liveRatios} primary={data.primary_fiscal_year} />

      {/* ── Pending edits tray (audit-style summary) ───────────── */}
      {hasPending ? (
        <PendingEditsTray
          edits={editsList}
          line_items={data.line_items}
          on_revert={(path, fy) => clearEdit(path, fy)}
          on_jump={(path) => {
            const el = document.getElementById(`spread-row-${path.replace(/\./g, "-")}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("ring-2", "ring-amber-300");
              window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-300"), 1200);
            }
          }}
        />
      ) : null}

      {/* ── Toolbar: filter + density + help ───────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rule bg-paper-2 p-2">
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Filter line items</span>
            <input
              ref={filterRef}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter line items… (press / )"
              className="w-72 rounded-md border border-rule bg-paper px-3 py-1 text-body-sm focus:border-accent focus:outline-none"
            />
          </label>
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="rounded-md text-mono-sm font-mono text-ink-3 hover:text-ink-1"
            >
              clear
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-mono-sm font-mono text-ink-3">
          <span>Density</span>
          <div className="flex rounded-md border border-rule bg-paper">
            {(["compact", "comfortable"] as Density[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={cn(
                  "px-2 py-1 text-mono-sm font-mono uppercase tracking-[0.04em]",
                  d === density ? "bg-accent text-paper" : "text-ink-3 hover:text-ink-1",
                )}
              >
                {d === "compact" ? "Compact" : "Comfortable"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="rounded-md border border-rule bg-paper px-2 py-1 text-mono-sm font-mono text-ink-3 hover:border-accent hover:text-accent"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </div>

      {/* ── Stress scenario toggle ─────────────────────────────── */}
      {data.scenarios.length > 0 ? (
        <ScenarioToggle
          scenarios={data.scenarios}
          active={activeScenario}
          onChange={setActiveScenario}
        />
      ) : null}

      {activeStress ? (
        <StressBanner stress={activeStress} />
      ) : null}

      {/* ── Line-item table per category ───────────────────────── */}
      <div className="space-y-6">
        {(["income_statement", "balance_sheet", "cash_flow"] as LineItemCategory[]).map(
          (cat) =>
            grouped[cat].length === 0 ? null : (
              <CategorySection
                key={cat}
                title={CATEGORY_LABEL[cat]}
                rows={grouped[cat]}
                fiscal_years={data.fiscal_years}
                primary={data.primary_fiscal_year}
                pending_edits={pendingEdits}
                read_only={read_only}
                density={density}
                on_open_adjustment={(path, fy) => setOpenAdjustment({ path, fy })}
                on_open_citation={(c) => setOpenCitation(c)}
              />
            ),
        )}
        {!hasFilteredRows && filterLower ? (
          <div className="rounded-md border border-dashed border-rule p-6 text-center text-body-sm text-ink-3">
            No line items match <code className="font-mono text-ink-1">"{filter}"</code>.
          </div>
        ) : null}
      </div>

      {/* ── Help modal ─────────────────────────────────────────── */}
      {showHelp ? <ShortcutHelp on_close={() => setShowHelp(false)} /> : null}

      {/* ── Adjustment editor (popover) ─────────────────────────── */}
      {openAdjustment ? (
        <AdjustmentEditor
          row={data.line_items.find((r) => r.path === openAdjustment.path)!}
          fiscal_year={openAdjustment.fy}
          existing_edit={pendingEdits.get(editsKey(openAdjustment.path, openAdjustment.fy))}
          on_save={(edit) => {
            upsertEdit(edit);
            setOpenAdjustment(null);
          }}
          on_clear={() => {
            clearEdit(openAdjustment.path, openAdjustment.fy);
            setOpenAdjustment(null);
          }}
          on_close={() => setOpenAdjustment(null)}
        />
      ) : null}

      {/* ── Citation popover ───────────────────────────────────── */}
      {openCitation ? (
        <CitationPopover citation={openCitation} on_close={() => setOpenCitation(null)} />
      ) : null}
    </section>
  );
}

// ─── RatioStrip ────────────────────────────────────────────────────────────


function RatioStrip({
  ratios,
  primary,
}: {
  ratios: RatioRow[];
  primary: FiscalKey;
}): React.ReactElement {
  return (
    <div className="sticky top-0 z-30 -mx-2 grid grid-cols-2 gap-2 rounded-lg bg-paper/95 p-2 shadow-sm backdrop-blur sm:grid-cols-3 lg:grid-cols-5">
      {ratios.map((r) => {
        const bandCls = BAND_CLASSES[r.band];
        const v = r.values[primary];
        return (
          <div
            key={r.key}
            className={cn(
              "group rounded-lg border p-3 ring-1 transition-all",
              bandCls.bg,
              bandCls.ring,
            )}
            title={r.description}
          >
            <div className={cn("text-mono-sm font-mono uppercase tracking-[0.04em]", bandCls.text)}>
              {r.name}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn("text-h2 font-semi tabular-nums", bandCls.text)}>
                {v !== null && v !== undefined ? fmtRatio(v) : "—"}
              </span>
              {r.peer_median !== null && r.peer_median !== undefined ? (
                <span className="text-mono-sm font-mono text-ink-3">
                  vs peer {fmtRatio(r.peer_median)}
                </span>
              ) : null}
            </div>
            {r.floor !== null || r.ceiling !== null ? (
              <div className="mt-1 text-mono-sm font-mono text-ink-3">
                {r.floor !== null && r.floor !== undefined ? `min ${fmtRatio(r.floor)}` : ""}
                {r.floor !== null && r.ceiling !== null ? " · " : ""}
                {r.ceiling !== null && r.ceiling !== undefined ? `max ${fmtRatio(r.ceiling)}` : ""}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}


// ─── CategorySection ──────────────────────────────────────────────────────


interface CategorySectionProps {
  title: string;
  rows: LineItemRow[];
  fiscal_years: FiscalKey[];
  primary: FiscalKey;
  pending_edits: Map<string, PendingEdit>;
  read_only: boolean;
  density: Density;
  on_open_adjustment: (path: string, fy: FiscalKey) => void;
  on_open_citation: (c: Citation) => void;
}

function CategorySection({
  title,
  rows,
  fiscal_years,
  primary,
  pending_edits,
  read_only,
  density,
  on_open_adjustment,
  on_open_citation,
}: CategorySectionProps): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-paper">
      <table className="w-full border-collapse text-body-sm">
        <thead className="bg-paper-2">
          <tr>
            <th
              colSpan={fiscal_years.length + 2}
              className="border-b border-rule px-4 py-2 text-left text-eyebrow font-serif font-semi uppercase tracking-[0.06em] text-ink-2"
            >
              {title}
            </th>
          </tr>
          <tr className="border-b border-rule text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
            <th className="px-4 py-2 text-left font-medium">Line item</th>
            {fiscal_years.map((fy) => (
              <th
                key={fy}
                className={cn(
                  "px-3 py-2 text-right font-medium",
                  fy === primary && "bg-accent/5 text-accent-pressed",
                )}
                title={fy === primary ? "Primary fiscal year — agents use this column" : undefined}
              >
                {fy}
                {fy === primary ? <span aria-hidden="true"> ★</span> : null}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Adjustment ({primary})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LineItemRowView
              key={row.path}
              row={row}
              fiscal_years={fiscal_years}
              primary={primary}
              pending_edit={pending_edits.get(`${row.path}::${primary}`)}
              read_only={read_only}
              density={density}
              on_open_adjustment={on_open_adjustment}
              on_open_citation={on_open_citation}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── LineItemRowView ──────────────────────────────────────────────────────


function LineItemRowView({
  row,
  fiscal_years,
  primary,
  pending_edit,
  read_only,
  density,
  on_open_adjustment,
  on_open_citation,
}: {
  row: LineItemRow;
  fiscal_years: FiscalKey[];
  primary: FiscalKey;
  pending_edit?: PendingEdit;
  read_only: boolean;
  density: Density;
  on_open_adjustment: (path: string, fy: FiscalKey) => void;
  on_open_citation: (c: Citation) => void;
}): React.ReactElement {
  // Year-over-year trend uses normalized values
  const sortedYears = fiscal_years;
  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const labelPad = density === "compact" ? "px-4 py-1.5" : "px-4 py-2.5";

  // Sparkline data — sequence of normalized values across fiscal years
  // (with the pending-edit override applied to the primary year so the
  // banker's adjustment shows up in the trend line).
  const sparkValues = sortedYears.map((fy) => {
    const v = row.normalized[fy]?.value ?? null;
    if (fy === primary && pending_edit) return pending_edit.new_value;
    return v;
  });

  return (
    <tr
      id={`spread-row-${row.path.replace(/\./g, "-")}`}
      className={cn(
        "border-b border-rule/60 transition-colors hover:bg-accent/5",
        row.is_critical && "bg-amber-50/30",
        pending_edit && "bg-amber-50/60",
      )}
    >
      <td className={labelPad}>
        <div className="flex items-center gap-2">
          <div>
            <div className="font-medium text-ink-1">{row.label}</div>
            {density === "comfortable" ? (
              <div className="font-mono text-mono-sm text-ink-3">{row.path}</div>
            ) : null}
          </div>
          <Sparkline
            values={sparkValues}
            larger_is_better={isLargerBetter(row.path)}
          />
        </div>
      </td>
      {sortedYears.map((fy, idx) => {
        const norm = row.normalized[fy];
        const raw = row.raw[fy];
        const prevYearKey = idx > 0 ? sortedYears[idx - 1] : null;
        const prev = prevYearKey ? row.normalized[prevYearKey]?.value : null;
        const cur = norm?.value;
        const isPrimary = fy === primary;
        // If there's a pending edit, override the displayed normalized value
        const displayValue =
          isPrimary && pending_edit ? pending_edit.new_value : cur ?? null;
        const trend = trendDirection(prev, displayValue, isLargerBetter(row.path));

        return (
          <td
            key={fy}
            className={cn(
              cellPad,
              "text-right tabular-nums",
              isPrimary && "bg-accent/5",
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (norm?.citation) on_open_citation(norm.citation);
                else if (raw?.citation) on_open_citation(raw.citation);
                else if (!read_only && isPrimary) on_open_adjustment(row.path, fy);
              }}
              className={cn(
                "group inline-flex w-full justify-end rounded-md px-2 py-1 text-right hover:bg-accent/10",
              )}
            >
              <span className="flex flex-col items-end gap-0.5">
                <span
                  className={cn(
                    "text-body-sm font-medium",
                    pending_edit && isPrimary && "text-amber-900 italic",
                  )}
                >
                  {fmtUsd(displayValue)}
                </span>
                {prevYearKey ? (
                  <span
                    className={cn(
                      "text-mono-sm font-mono",
                      trend === "up_good" && "text-emerald-700",
                      trend === "up_bad" && "text-rose-700",
                      trend === "down_good" && "text-emerald-700",
                      trend === "down_bad" && "text-rose-700",
                      trend === "flat" && "text-ink-3",
                    )}
                  >
                    {trend === "up_good" || trend === "up_bad" ? "↑" : ""}
                    {trend === "down_good" || trend === "down_bad" ? "↓" : ""}
                    {trend === "flat" ? "·" : ""}
                    {prev !== null && prev !== undefined ? ` ${fmtDelta(prev, displayValue)}` : ""}
                  </span>
                ) : null}
                {(norm?.citation || raw?.citation) ? (
                  <span className="text-mono-sm font-mono text-accent group-hover:underline">
                    p.{(norm?.citation ?? raw?.citation)?.page ?? "?"}
                  </span>
                ) : null}
              </span>
            </button>
          </td>
        );
      })}
      <td className={cn(cellPad, "text-right")}>
        {!read_only ? (
          <button
            type="button"
            onClick={() => on_open_adjustment(row.path, primary)}
            className={cn(
              "rounded-md border px-2 py-1 text-mono-sm font-mono",
              pending_edit
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-rule text-ink-3 hover:border-accent hover:text-accent",
            )}
          >
            {pending_edit ? (
              <>
                {fmtSignedUsd(pending_edit.adjustment.amount)}
                <span className="ml-1 text-mono-sm">↺</span>
              </>
            ) : (
              "+ adjust"
            )}
          </button>
        ) : (
          <span className="text-mono-sm font-mono text-ink-3">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── AdjustmentEditor ─────────────────────────────────────────────────────


const ADJUSTMENT_CATEGORIES: { value: AdjustmentEntry["category"]; label: string }[] = [
  { value: "one_time_charge", label: "One-time charge" },
  { value: "non_recurring_gain", label: "Non-recurring gain" },
  { value: "accounting_change", label: "Accounting change" },
  { value: "restructuring", label: "Restructuring" },
  { value: "other", label: "Other (explain)" },
];

function AdjustmentEditor({
  row,
  fiscal_year,
  existing_edit,
  on_save,
  on_clear,
  on_close,
}: {
  row: LineItemRow;
  fiscal_year: FiscalKey;
  existing_edit?: PendingEdit;
  on_save: (e: PendingEdit) => void;
  on_clear: () => void;
  on_close: () => void;
}): React.ReactElement {
  const baseValue = row.normalized[fiscal_year]?.value ?? row.raw[fiscal_year]?.value ?? 0;
  const [amount, setAmount] = React.useState<number | "">(
    existing_edit ? existing_edit.adjustment.amount : 0,
  );
  const [rationale, setRationale] = React.useState(
    existing_edit?.adjustment.rationale ?? "",
  );
  const [category, setCategory] = React.useState<AdjustmentEntry["category"]>(
    existing_edit?.adjustment.category ?? "one_time_charge",
  );

  const newValue =
    typeof amount === "number" && Number.isFinite(amount) ? baseValue + amount : baseValue;

  function save() {
    if (typeof amount !== "number" || !rationale.trim()) return;
    on_save({
      path: row.path,
      fiscal_year,
      new_value: newValue,
      adjustment: {
        amount,
        rationale: rationale.trim(),
        category,
        applied_at: new Date().toISOString(),
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={on_close}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-paper p-5 shadow-lg ring-1 ring-rule"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-h4 font-serif font-semi text-ink-1">{row.label}</h3>
            <p className="text-body-sm text-ink-3">
              Adjust {fiscal_year} normalized value
            </p>
          </div>
          <button
            type="button"
            onClick={on_close}
            className="text-ink-3 hover:text-ink-1"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <dl className="mb-4 grid grid-cols-3 gap-2 text-body-sm">
          <div>
            <dt className="text-mono-sm font-mono uppercase text-ink-3">Base</dt>
            <dd className="tabular-nums font-medium">{fmtUsd(baseValue)}</dd>
          </div>
          <div>
            <dt className="text-mono-sm font-mono uppercase text-ink-3">Adjustment</dt>
            <dd className="tabular-nums font-medium text-amber-700">
              {fmtSignedUsd(typeof amount === "number" ? amount : 0)}
            </dd>
          </div>
          <div>
            <dt className="text-mono-sm font-mono uppercase text-ink-3">New value</dt>
            <dd className="tabular-nums font-semi text-ink-1">{fmtUsd(newValue)}</dd>
          </div>
        </dl>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-mono-sm font-mono uppercase text-ink-3">
              Adjustment amount (USD, signed)
            </span>
            <input
              type="number"
              className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 tabular-nums focus:border-accent focus:outline-none"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="0"
            />
            <span className="mt-0.5 block text-mono-sm font-mono text-ink-3">
              Negative = remove from normalized · positive = add
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-mono-sm font-mono uppercase text-ink-3">
              Category
            </span>
            <select
              className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 focus:border-accent focus:outline-none"
              value={category}
              onChange={(e) => setCategory(e.target.value as AdjustmentEntry["category"])}
            >
              {ADJUSTMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-mono-sm font-mono uppercase text-ink-3">
              Rationale (required)
            </span>
            <textarea
              className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm focus:border-accent focus:outline-none"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              placeholder="Explain why this adjustment is justified — cite the source page if applicable."
            />
          </label>
        </div>
        <footer className="mt-4 flex items-center justify-between gap-2">
          {existing_edit ? (
            <button
              type="button"
              onClick={on_clear}
              className="rounded-md border border-rule px-3 py-1.5 text-body-sm text-ink-3 hover:border-semantic-danger hover:text-semantic-danger"
            >
              Remove adjustment
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={on_close}
              className="rounded-md border border-rule px-3 py-1.5 text-body-sm text-ink-2 hover:border-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={typeof amount !== "number" || !rationale.trim()}
              onClick={save}
              className="rounded-md bg-accent px-3 py-1.5 text-body-sm font-semi text-paper hover:bg-accent-pressed disabled:opacity-40"
            >
              Save adjustment
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── CitationPopover ──────────────────────────────────────────────────────


function CitationPopover({
  citation,
  on_close,
}: {
  citation: Citation;
  on_close: () => void;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 p-4"
      onClick={on_close}
    >
      <div
        className="w-full max-w-xl rounded-lg bg-paper p-5 shadow-lg ring-1 ring-rule"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-h4 font-serif font-semi text-ink-1">Source citation</h3>
          <button
            type="button"
            onClick={on_close}
            className="text-ink-3 hover:text-ink-1"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <dl className="grid grid-cols-2 gap-2 text-body-sm">
          <div>
            <dt className="text-mono-sm font-mono uppercase text-ink-3">Document</dt>
            <dd className="font-mono text-mono-sm">{citation.doc_id.slice(0, 8)}…</dd>
          </div>
          <div>
            <dt className="text-mono-sm font-mono uppercase text-ink-3">Page</dt>
            <dd className="font-medium">{citation.page}</dd>
          </div>
        </dl>
        {citation.excerpt ? (
          <div className="mt-3 rounded-md border border-rule bg-paper-2 p-3 font-serif italic text-body-sm leading-relaxed text-ink-1">
            “{citation.excerpt}”
          </div>
        ) : null}
        {citation.bbox ? (
          <p className="mt-2 text-mono-sm font-mono text-ink-3">
            bbox [{citation.bbox.map((c) => c.toFixed(2)).join(", ")}]
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── ScenarioToggle + StressBanner ────────────────────────────────────────


function ScenarioToggle({
  scenarios,
  active,
  onChange,
}: {
  scenarios: StressScenario[];
  active: ScenarioKey;
  onChange: (k: ScenarioKey) => void;
}): React.ReactElement {
  const options: { key: ScenarioKey; label: string }[] = [
    { key: "base", label: "Base case" },
    ...scenarios.map((s) => ({ key: s.key, label: s.label })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-rule bg-paper-2 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md px-3 py-1 text-mono-sm font-mono uppercase tracking-[0.04em]",
            o.key === active
              ? "bg-accent text-paper shadow-sm"
              : "text-ink-2 hover:bg-paper",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StressBanner({ stress }: { stress: StressScenario }): React.ReactElement {
  const cls = stress.passes
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : "border-rose-300 bg-rose-50 text-rose-900";
  return (
    <div className={cn("rounded-md border p-3 text-body-sm", cls)}>
      <strong className="block">{stress.label}</strong>
      <p className="text-body-sm">{stress.description}</p>
      <p className="mt-1 text-mono-sm font-mono">
        {stress.passes ? "✓ All thresholds hold under this scenario." : "✗ One or more thresholds breach under this scenario."}
      </p>
    </div>
  );
}

// ─── SpreadingEmptyState ──────────────────────────────────────────────────


function SpreadingEmptyState({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <section
      className={cn(
        "rounded-lg border border-dashed border-rule bg-paper p-8",
        className,
      )}
      aria-label="Spreading workbench (waiting)"
    >
      <h2 className="text-h3 font-serif font-semi tracking-tight text-ink-1">
        Spreading workbench
      </h2>
      <p className="mt-1 text-body-sm text-ink-3">
        The workbench loads here once extraction completes. You'll see the
        full multi-year line-item table, year-over-year trend, and
        live-recomputed ratios — every cell traceable to a citation in a
        source document.
      </p>
      <ol className="mt-4 grid gap-2 text-body-sm sm:grid-cols-3">
        <li className="rounded-md border border-rule bg-paper-2 p-3">
          <span className="block text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
            1 · Extract
          </span>
          <span className="mt-1 block text-ink-1">
            Landing AI ADE pulls line items + citations from each PDF.
          </span>
        </li>
        <li className="rounded-md border border-rule bg-paper-2 p-3">
          <span className="block text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
            2 · Normalize
          </span>
          <span className="mt-1 block text-ink-1">
            Spreader reconciles across docs, applies adjustments, computes
            ratios.
          </span>
        </li>
        <li className="rounded-md border border-rule bg-paper-2 p-3">
          <span className="block text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
            3 · Review
          </span>
          <span className="mt-1 block text-ink-1">
            You adjust, add rationales, sign off — agents consume the
            normalized values.
          </span>
        </li>
      </ol>
    </section>
  );
}

// ─── PendingEditsTray ─────────────────────────────────────────────────────


function PendingEditsTray({
  edits,
  line_items,
  on_revert,
  on_jump,
}: {
  edits: PendingEdit[];
  line_items: LineItemRow[];
  on_revert: (path: string, fy: FiscalKey) => void;
  on_jump: (path: string) => void;
}): React.ReactElement {
  const labelByPath = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of line_items) m[r.path] = r.label;
    return m;
  }, [line_items]);

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-body-sm font-semi text-amber-900">
          Pending edits ({edits.length})
        </h3>
        <span className="text-mono-sm font-mono text-amber-900/70">
          Click a row to jump · revert to undo · save to commit
        </span>
      </header>
      <ul className="grid gap-1.5 text-body-sm sm:grid-cols-2">
        {edits.map((e) => (
          <li
            key={`${e.path}::${e.fiscal_year}`}
            className="flex items-center justify-between gap-2 rounded-md bg-paper px-2 py-1.5 ring-1 ring-amber-200"
          >
            <button
              type="button"
              onClick={() => on_jump(e.path)}
              className="flex-1 truncate text-left hover:underline"
              title={e.adjustment.rationale}
            >
              <span className="font-medium text-ink-1">
                {labelByPath[e.path] ?? e.path}
              </span>{" "}
              <span className="text-mono-sm font-mono text-ink-3">
                · {e.fiscal_year}
              </span>{" "}
              <span className="font-mono text-mono-sm text-amber-700">
                {fmtSignedUsd(e.adjustment.amount)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => on_revert(e.path, e.fiscal_year)}
              className="rounded-md text-mono-sm font-mono text-ink-3 hover:text-semantic-danger"
              aria-label={`Revert ${labelByPath[e.path] ?? e.path}`}
              title="Revert this edit"
            >
              ↺
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────


function Sparkline({
  values,
  larger_is_better,
}: {
  values: (number | null)[];
  larger_is_better: boolean;
}): React.ReactElement | null {
  const real = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (real.length < 2) return null;

  const W = 60;
  const H = 18;
  const min = Math.min(...real);
  const max = Math.max(...real);
  const range = max - min || 1;
  const step = values.length > 1 ? W / (values.length - 1) : W;

  const points = values
    .map((v, i) => {
      if (v === null || !Number.isFinite(v)) return null;
      const x = i * step;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((p): p is string => p !== null)
    .join(" ");

  const last = real[real.length - 1] ?? 0;
  const first = real[0] ?? 0;
  const trendUp = last > first;
  const trendIsGood = trendUp === larger_is_better;
  const stroke = trendIsGood
    ? "stroke-emerald-500"
    : trendUp === larger_is_better
      ? "stroke-emerald-500"
      : "stroke-rose-500";

  // Last point dot — search from the end for the last real value
  let lastIdx = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) {
      lastIdx = i;
      break;
    }
  }
  const lastX = lastIdx * step;
  const lastY = H - ((last - min) / range) * H;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0"
      role="img"
      aria-label={`Sparkline ${first.toFixed(0)} → ${last.toFixed(0)}`}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        className={cn(stroke)}
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2}
        className={cn(stroke, "fill-current")}
      />
    </svg>
  );
}

// ─── ShortcutHelp ─────────────────────────────────────────────────────────


function ShortcutHelp({
  on_close,
}: {
  on_close: () => void;
}): React.ReactElement {
  const shortcuts: { key: string; label: string }[] = [
    { key: "/", label: "Focus the line-item filter" },
    { key: "?", label: "Toggle this help panel" },
    { key: "Esc", label: "Close any open dialog" },
    { key: "click cell", label: "View citation (or open adjustment if no citation)" },
    { key: "+ adjust", label: "Open adjustment editor for the primary year" },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={on_close}
    >
      <div
        className="w-full max-w-md rounded-lg bg-paper p-5 shadow-lg ring-1 ring-rule"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-h4 font-serif font-semi text-ink-1">
            Keyboard shortcuts
          </h3>
          <button
            type="button"
            onClick={on_close}
            aria-label="Close"
            className="text-ink-3 hover:text-ink-1"
          >
            ✕
          </button>
        </header>
        <ul className="grid gap-2 text-body-sm">
          {shortcuts.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between rounded-md bg-paper-2 px-3 py-2"
            >
              <span className="text-ink-2">{s.label}</span>
              <kbd className="rounded-md border border-rule bg-paper px-2 py-0.5 font-mono text-mono-sm text-ink-1">
                {s.key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────


/**
 * For trend arrows, return whether a larger value is "good" for this
 * line item. Revenue / EBITDA / equity / cash flow → larger better.
 * Debt / interest expense / capex → smaller better.
 */
function isLargerBetter(path: string): boolean {
  const smallerBetter = [
    "balance_sheet.total_debt",
    "balance_sheet.long_term_debt",
    "balance_sheet.short_term_debt",
    "income_statement.interest_expense",
    "income_statement.tax_expense",
    "cash_flow.capex",
  ];
  return !smallerBetter.includes(path);
}

/**
 * Live-recompute key ratios under pending adjustments. Only the
 * primary year is re-computed; downstream years are unchanged.
 *
 * If you need the exact peer-comparable ratios + stress-tested values,
 * those still come from the server after save (the workbench is a
 * preview, not the source of truth).
 */
function previewRatios(
  data: SpreadingViewModel,
  edits: PendingEdit[],
): RatioRow[] {
  if (edits.length === 0) return data.ratios;

  // Pull the primary-year normalized values into a map keyed by path.
  const map: Record<string, number | null> = {};
  for (const r of data.line_items) {
    const v = r.normalized[data.primary_fiscal_year]?.value ?? null;
    map[r.path] = v;
  }
  // Apply edits
  for (const e of edits) {
    if (e.fiscal_year === data.primary_fiscal_year) {
      map[e.path] = e.new_value;
    }
  }

  return data.ratios.map((r) => {
    const recomputed = recomputeRatio(r.key, map);
    if (recomputed === null) return r;
    return {
      ...r,
      values: { ...r.values, [data.primary_fiscal_year]: recomputed },
      band: bandForRatio(r.key, recomputed, r.floor ?? null, r.ceiling ?? null),
    };
  });
}

function recomputeRatio(key: string, m: Record<string, number | null>): number | null {
  const get = (k: string) => m[k] ?? null;
  switch (key) {
    case "dscr_base": {
      const ebitda = get("income_statement.ebitda");
      const capex = get("cash_flow.capex") ?? 0;
      const interest = get("income_statement.interest_expense");
      // Approximation; real DSCR uses scheduled debt service.
      if (ebitda === null || interest === null || interest === 0) return null;
      return (ebitda - Math.abs(capex)) / interest;
    }
    case "leverage": {
      const debt = get("balance_sheet.total_debt");
      const ebitda = get("income_statement.ebitda");
      if (debt === null || ebitda === null || ebitda === 0) return null;
      return debt / ebitda;
    }
    case "current_ratio": {
      const ca = get("balance_sheet.current_assets");
      const cl = get("balance_sheet.current_liabilities");
      if (ca === null || cl === null || cl === 0) return null;
      return ca / cl;
    }
    case "interest_coverage": {
      const ebitda = get("income_statement.ebitda");
      const interest = get("income_statement.interest_expense");
      if (ebitda === null || interest === null || interest === 0) return null;
      return ebitda / interest;
    }
    case "debt_to_equity": {
      const debt = get("balance_sheet.total_debt");
      const equity = get("balance_sheet.total_equity");
      if (debt === null || equity === null || equity === 0) return null;
      return debt / equity;
    }
    default:
      return null;
  }
}

function bandForRatio(
  key: string,
  v: number,
  floor: number | null,
  ceiling: number | null,
): "good" | "warning" | "concern" | "neutral" {
  // Larger-is-better for DSCR, current ratio, interest coverage; smaller-is-better
  // for leverage and debt/equity.
  const smallerBetter = key === "leverage" || key === "debt_to_equity";
  if (smallerBetter) {
    if (ceiling !== null && v > ceiling) return "concern";
    if (ceiling !== null && v > ceiling * 0.9) return "warning";
    return "good";
  }
  if (floor !== null && v < floor) return "concern";
  if (floor !== null && v < floor * 1.15) return "warning";
  return "good";
}
