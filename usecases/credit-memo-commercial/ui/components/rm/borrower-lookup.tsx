"use client";

import * as React from "react";
import { Search, X, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface BorrowerHit {
  borrower_id: string;
  legal_name: string;
  dba_name: string | null;
  ein: string | null;
  naics_code: string | null;
  primary_state: string | null;
  risk_rating: string | null;
  relationship_since: string | null;
  committed_usd: number;
}

interface Props {
  selected: BorrowerHit | null;
  onSelect: (b: BorrowerHit | null) => void;
}

const fmtCompact = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

/**
 * RM origination borrower lookup. Single search box that hits
 * /api/borrowers/search (debounced 200ms) and renders a typeahead. On select
 * the parent gets a full BorrowerHit and renders the preview card.
 */
export const BorrowerLookup: React.FC<Props> = ({ selected, onSelect }) => {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<BorrowerHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Debounced fetch.
  React.useEffect(() => {
    if (selected) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/borrowers/search?q=${encodeURIComponent(term)}`,
          { signal: ctrl.signal },
        );
        const data = await r.json();
        if (!r.ok || !data.ok) {
          setError(data.error ?? `Search failed (HTTP ${r.status})`);
          setHits([]);
        } else {
          setHits(data.hits as BorrowerHit[]);
          setActiveIdx(0);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, selected]);

  // Outside click / escape closes.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onPick = (b: BorrowerHit) => {
    onSelect(b);
    setOpen(false);
    setQ("");
    setHits([]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = hits[activeIdx];
      if (pick) onPick(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (selected) {
    return (
      <div className="rounded-md border border-rule bg-paper p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Borrower
            </p>
            <p className="mt-1 font-serif text-h2 font-semi tracking-tight text-ink-1">
              {selected.legal_name}
            </p>
            {selected.dba_name && (
              <p className="text-body-sm text-ink-2">d/b/a {selected.dba_name}</p>
            )}
            <p className="mt-1 font-mono text-mono-sm text-ink-3">
              {selected.borrower_id}
              {selected.ein ? ` · EIN ${selected.ein}` : ""}
              {selected.naics_code ? ` · NAICS ${selected.naics_code}` : ""}
              {selected.primary_state ? ` · ${selected.primary_state}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="Clear borrower selection"
            className="rounded-sm p-1 text-ink-3 hover:bg-paper-2 hover:text-ink-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-mono-sm">
          <div>
            <dt className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Relationship since
            </dt>
            <dd className="mt-1 text-body-sm text-ink-1">
              {selected.relationship_since ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Current rating
            </dt>
            <dd className="mt-1 text-body-sm text-ink-1">
              {selected.risk_rating
                ? selected.risk_rating.replace(/^(\d)-(.+)$/, "$1 · $2")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Existing committed
            </dt>
            <dd className="mt-1 text-body-sm text-ink-1 tabular-nums">
              {fmtCompact(selected.committed_usd)}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label
        className="flex h-11 items-center gap-2 rounded-md border border-rule bg-paper px-3 text-body-sm text-ink-2 focus-within:border-accent"
      >
        <Search className="h-4 w-4 text-ink-3" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Lookup borrower by name, EIN, or DUNS"
          aria-label="Borrower search"
          aria-autocomplete="list"
          aria-expanded={open}
          className="w-full bg-transparent text-ink-1 placeholder:text-ink-3 focus:outline-none"
        />
        {loading && (
          <span className="font-mono text-mono-sm text-ink-3">searching…</span>
        )}
      </label>

      {open && (q.trim().length >= 2 || hits.length > 0) && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-md border border-rule bg-paper shadow-pop">
          {error ? (
            <div className="p-3 text-body-sm text-semantic-danger">{error}</div>
          ) : hits.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-body-sm font-semi text-ink-1">No matches</p>
              <p className="mt-1 text-mono-sm text-ink-3">
                Try a different fragment of the legal name or EIN suffix. New
                borrowers are added through the customer-onboarding workflow.
              </p>
            </div>
          ) : (
            <ul role="listbox" className="flex max-h-80 flex-col overflow-auto">
              {hits.map((h, i) => (
                <li key={h.borrower_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    onClick={() => onPick(h)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={
                      "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition " +
                      (i === activeIdx ? "bg-paper-2" : "hover:bg-paper-2")
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-semi text-ink-1">
                        {h.legal_name}
                      </p>
                      <p className="truncate font-mono text-mono-sm text-ink-3">
                        {h.borrower_id}
                        {h.ein ? ` · EIN ${h.ein}` : ""}
                        {h.naics_code ? ` · NAICS ${h.naics_code}` : ""}
                        {h.primary_state ? ` · ${h.primary_state}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <Badge tone={h.risk_rating?.startsWith("1") ? "success" : "warning"} dot>
                        {h.risk_rating ?? "unrated"}
                      </Badge>
                      <span className="font-mono text-mono-sm tabular-nums text-ink-3">
                        {fmtCompact(h.committed_usd)} committed
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {q.trim().length === 0 && !selected && (
        <div className="mt-2 flex items-center gap-2 text-body-sm text-ink-3">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>
            Start typing — autocomplete searches the full borrower master.
          </span>
        </div>
      )}
    </div>
  );
};
