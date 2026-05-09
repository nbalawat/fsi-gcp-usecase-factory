"use client";

/**
 * Sticky left-rail table of contents for the credit memo.
 *
 * - Lists the 10 sections (and an "Appendices" item, collapsed by default if
 *   none are present).
 * - Each item shows a status dot: complete / drafting / pending.
 * - Active section (most-visible in the viewport) is highlighted with an
 *   accent-green left-border and bolder text.
 * - Click an item → smooth-scroll to that section, accounting for the
 *   sticky header offset (96 px).
 * - Scroll-spy: an IntersectionObserver tracks each section element and sets
 *   the active id when a section's center crosses the viewport.
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import {
  SECTION_ORDER,
  SECTION_LABELS,
  type SectionKey,
} from "./types";

export type SectionStatus = "complete" | "drafting" | "pending";

interface Props {
  /** id → status, used to render the dot per item. */
  status: Record<SectionKey, SectionStatus>;
  /** Whether the memo body has appendices (controls the collapsible). */
  hasAppendices?: boolean;
  /** Optional hard override of the active section (else scroll-spy). */
  activeOverride?: SectionKey | null;
}

const HEADER_OFFSET_PX = 96;

export const MemoToc: React.FC<Props> = ({
  status,
  hasAppendices,
  activeOverride,
}) => {
  const [active, setActive] = React.useState<SectionKey>(SECTION_ORDER[0]);

  // Scroll-spy via IntersectionObserver.
  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sections = SECTION_ORDER.map(
      (id) => document.getElementById(id),
    ).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return undefined;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            visible.set(e.target.id, e.intersectionRatio);
          } else {
            visible.delete(e.target.id);
          }
        }
        // Pick the entry with the highest ratio. Falls back to first in order.
        let best: { id: string; ratio: number } | null = null;
        visible.forEach((ratio, id) => {
          if (!best || ratio > best.ratio) best = { id, ratio };
        });
        if (best) {
          const id = (best as { id: string; ratio: number }).id;
          if (SECTION_ORDER.includes(id as SectionKey)) {
            setActive(id as SectionKey);
          }
        }
      },
      {
        rootMargin: `-${HEADER_OFFSET_PX + 32}px 0px -45% 0px`,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const s of sections) observer.observe(s);
    return () => observer.disconnect();
  }, []);

  const onClick = (id: SectionKey, e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top =
      el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
    window.scrollTo({ top, behavior: "smooth" });
    // Update history without firing a navigation.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const current = activeOverride ?? active;

  return (
    <nav
      aria-label="Memo table of contents"
      className="sticky top-[80px] flex flex-col gap-1 self-start"
    >
      <p className="mb-2 text-eyebrow uppercase tracking-[0.08em] text-muted-foreground font-mono">
        Contents
      </p>
      {SECTION_ORDER.map((id, i) => {
        const isActive = current === id;
        const s = status[id] ?? "pending";
        return (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => onClick(id, e)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "group flex items-center gap-2.5 border-l-2 pl-3 py-1.5 text-body-sm transition-colors",
              isActive
                ? "border-accent text-foreground font-semi"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-ink-4",
            )}
          >
            <StatusDot status={s} />
            <span className="font-mono text-mono-sm tabular-nums text-muted-foreground group-aria-[current=true]:text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="leading-snug">{SECTION_LABELS[id]}</span>
          </a>
        );
      })}

      {hasAppendices && (
        <a
          href="#appendices"
          className="mt-3 flex items-center gap-2.5 border-l-2 border-transparent pl-3 py-1.5 text-body-sm text-muted-foreground hover:text-foreground hover:border-ink-4"
        >
          <StatusDot status="complete" />
          <span className="font-mono text-mono-sm text-muted-foreground">A.</span>
          <span>Appendices</span>
        </a>
      )}
    </nav>
  );
};

const StatusDot: React.FC<{ status: SectionStatus }> = ({ status }) => {
  if (status === "complete") {
    return (
      <span
        aria-label="Section complete"
        className="h-2 w-2 rounded-full bg-accent"
      />
    );
  }
  if (status === "drafting") {
    return (
      <span
        aria-label="Section drafting"
        className="relative h-2 w-2"
      >
        <span className="absolute inset-0 rounded-full bg-accent opacity-60 animate-ping" />
        <span className="absolute inset-0 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span
      aria-label="Section pending"
      className="h-2 w-2 rounded-full border border-ink-4 bg-paper"
    />
  );
};
