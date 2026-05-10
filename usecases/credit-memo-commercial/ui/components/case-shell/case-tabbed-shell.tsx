"use client";

/**
 * CaseTabbedShell — three-pane case-detail layout.
 *
 *   ┌─────────────┬───────────────────────────────────┬─────────────┐
 *   │  Left nav   │  Center content (active tab only) │  Right rail │
 *   │  (tabs)     │                                   │  (decision, │
 *   │  + summary  │                                   │   actions,  │
 *   │             │                                   │   clock)    │
 *   └─────────────┴───────────────────────────────────┴─────────────┘
 *
 * The HITL action bar is rendered separately in the page and is sticky
 * at the bottom of the viewport so the banker always knows what the
 * next required action is.
 *
 * Why a tabbed shell — the case page used to render 26+ stacked
 * sections (documents → spreading → 10-section memo → pipeline
 * activity). A banker couldn't tell where they were or which view they
 * wanted. The tabs collapse the page into four primary mental models
 * (Memo | Spreading | Documents | Build) and let the user pick the one
 * they need without doom-scrolling.
 */

import * as React from "react";
import { cn } from "@/lib/ui";

export interface CaseTab {
  id: string;
  label: string;
  /** Short hint shown under the label in the nav rail. */
  hint?: string;
  /** Tiny number/badge shown right of the label, e.g. "2 docs". */
  count?: string | number | null;
  /** Tab body — only rendered when active to keep DOM cheap and to
   *  reset stateful workbench state on tab switch (intentional). */
  content: React.ReactNode;
}

interface Props {
  tabs: CaseTab[];
  defaultTabId?: string;
  /** When provided, sessionStorage is keyed per-application — switching
   *  to a different case starts fresh from `defaultTabId` instead of
   *  carrying over the prior case's tab choice. */
  applicationId?: string;
  /** Top-of-page banner — borrower name, loan amount, breadcrumbs. */
  header: React.ReactNode;
  /** Persistent right-rail content — decision badge, clock, audit
   *  totals. Always visible regardless of tab. */
  rightRail: React.ReactNode;
  /** Optional summary block under the nav (key facts, peers, etc.). */
  leftSummary?: React.ReactNode;
}

const STORAGE_KEY_PREFIX = "case-tab.active.";

export function CaseTabbedShell({
  tabs,
  defaultTabId,
  applicationId,
  header,
  rightRail,
  leftSummary,
}: Props): React.ReactElement {
  // Initial state must be deterministic for SSR + hydration. Always
  // start on `defaultTabId` (or first tab) and patch from sessionStorage
  // in a useEffect after mount — that way SSR + first client render
  // match.
  const [activeId, setActiveId] = React.useState<string | undefined>(
    defaultTabId ?? tabs[0]?.id,
  );

  // Per-application storage key — was previously global, which meant
  // visiting case A on tab "memo", then case B (in-flight, no memo yet),
  // would force case B onto the "memo" tab and the user would land on
  // an empty memo state instead of the data-aware default ("build" with
  // live pipeline activity). Per-case keys fix that.
  const storageKey = applicationId
    ? `${STORAGE_KEY_PREFIX}${applicationId}`
    : STORAGE_KEY_PREFIX + "global";

  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved && tabs.some((t) => t.id === saved) && saved !== activeId) {
        setActiveId(saved);
      }
    } catch {
      /* ignore — sessionStorage may be disabled */
    }
    // Mount-only — we deliberately don't track activeId here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  React.useEffect(() => {
    if (!activeId) return;
    try {
      window.sessionStorage.setItem(storageKey, activeId);
    } catch {
      /* ignore */
    }
  }, [activeId, storageKey]);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="mx-auto w-full max-w-[1640px] px-4 pb-32 pt-4 lg:px-8">
      {/* Header band */}
      <div className="mb-4">{header}</div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr_320px]">
        {/* ── Left nav ── */}
        <nav
          aria-label="Case sections"
          className="lg:sticky lg:self-start lg:top-14 lg:max-h-[calc(100vh-3.5rem-1rem)] lg:overflow-y-auto"
        >
          <ul className="flex gap-1 overflow-x-auto rounded-md border border-rule bg-paper p-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0">
            {tabs.map((t) => {
              const isActive = t.id === active?.id;
              return (
                <li key={t.id} className="lg:w-full">
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-body-sm transition-colors",
                      // Mobile/horizontal: pill style
                      "lg:rounded-l-none lg:rounded-r-md",
                      // Desktop: left-border accent stripe for active
                      "lg:border-l-2 lg:border-l-transparent lg:px-4",
                      isActive
                        ? "bg-accent/10 font-semi text-accent-pressed lg:border-l-accent"
                        : "text-ink-2 hover:bg-paper-2 hover:text-ink-1",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate",
                            isActive ? "text-ink-1" : "text-ink-1/90",
                          )}
                        >
                          {t.label}
                        </span>
                        {t.count !== null && t.count !== undefined ? (
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded-full px-1.5 py-0 text-mono-sm font-mono tabular-nums",
                              isActive
                                ? "bg-accent/20 text-accent-pressed"
                                : "bg-paper-2 text-ink-3 ring-1 ring-rule/60",
                            )}
                          >
                            {t.count}
                          </span>
                        ) : null}
                      </span>
                      {t.hint ? (
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-body-sm font-normal",
                            isActive ? "text-ink-2" : "text-ink-3",
                          )}
                        >
                          {t.hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {leftSummary ? (
            <div className="mt-4 rounded-md border border-rule bg-paper-2 p-3 text-body-sm">
              {leftSummary}
            </div>
          ) : null}
        </nav>

        {/* ── Center content (active tab only) ── */}
        <main aria-labelledby={`tab-${active?.id}-heading`} className="min-w-0">
          {active?.content}
        </main>

        {/* ── Right rail ── */}
        <aside className="lg:sticky lg:self-start lg:top-14 lg:max-h-[calc(100vh-3.5rem-1rem)] lg:overflow-y-auto">{rightRail}</aside>
      </div>
    </div>
  );
}
