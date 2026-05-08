"use client";

/**
 * Per-section citation registry.
 *
 * Each section wraps its body in <CitationProvider>; <CitationSuperscript>
 * children call `register(citation)` and receive a 1-based per-section index.
 * The section footer reads the registry via `useCitations()` to render the
 * citations index.
 *
 * Numbering is per-section — section 1 starts at 1, section 2 starts at 1
 * again. This matches how a senior banker reads a typeset memo.
 */

import * as React from "react";
import type { Citation } from "./types";

interface CitationRegistry {
  register: (c: Citation) => number;
  list: () => Citation[];
}

const Ctx = React.createContext<CitationRegistry | null>(null);

export const CitationProvider: React.FC<{
  children: React.ReactNode;
  /**
   * Optional pre-seed of citations from the section payload. They are NOT
   * automatically rendered — superscripts must be inserted in body text. This
   * is just here so the section footer can render every citation listed in the
   * payload, even ones not yet referenced inline (defensive: we'd rather show
   * one extra citation than drop it).
   */
  prefill?: Citation[];
}> = ({ children, prefill }) => {
  // Use a ref-keyed map: identity (claim+source) → assigned 1-based index.
  // We can't useState during render, so we mutate a ref and rely on useId-style
  // stability. Each section gets a fresh provider, so this is local.
  const registryRef = React.useRef<Map<string, { idx: number; c: Citation }>>(
    new Map(),
  );
  const counterRef = React.useRef(0);

  // Reset on each render so re-running the section starts at 1 again.
  // (React strict-mode double-render is fine: keys are stable per citation.)
  registryRef.current = new Map();
  counterRef.current = 0;

  const register = React.useCallback((c: Citation): number => {
    const key = `${c.source}::${c.page ?? ""}::${c.claim.slice(0, 80)}`;
    const existing = registryRef.current.get(key);
    if (existing) return existing.idx;
    counterRef.current += 1;
    registryRef.current.set(key, { idx: counterRef.current, c });
    return counterRef.current;
  }, []);

  const list = React.useCallback((): Citation[] => {
    // Combine inline-registered citations with any prefill that wasn't used.
    const seen = new Set(registryRef.current.keys());
    const inline = Array.from(registryRef.current.values())
      .sort((a, b) => a.idx - b.idx)
      .map((v) => v.c);
    const extras = (prefill ?? []).filter(
      (c) => !seen.has(`${c.source}::${c.page ?? ""}::${c.claim.slice(0, 80)}`),
    );
    return [...inline, ...extras];
  }, [prefill]);

  const value = React.useMemo<CitationRegistry>(
    () => ({ register, list }),
    [register, list],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useCitations(): CitationRegistry {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    // Fallback: no-op provider so a citation outside a section doesn't crash.
    return {
      register: () => 0,
      list: () => [],
    };
  }
  return ctx;
}
