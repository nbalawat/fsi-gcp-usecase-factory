"use client";

/**
 * MemoEditDrawer — banker edits a memo section's narrative + citations.
 *
 * Opens as a right-side drawer when the underwriter clicks "Edit" on a
 * section header. Provides:
 *   - Textarea for narrative prose (largest field, most-edited)
 *   - Citation chip editor: add a chip by picking a document + page +
 *     optional excerpt; remove an existing chip with ✕
 *   - Save → POSTs to /api/applications/<id>/memo/edit-section,
 *     bumps revision_number, writes a memo_edited audit event, then
 *     refreshes the page so the new revision renders
 *   - Cancel discards the buffer
 *
 * The drawer doesn't try to edit the structured tables (covenant
 * thresholds, peer ratios, etc.) — that's deferred to V2; here we
 * focus on the prose + citation grounding which is what bankers most
 * frequently want to override.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/ui";

interface DocOption {
  doc_id: string;
  doc_type: string;
  original_filename: string;
  page_count: number | null;
}

interface CitationDraft {
  doc_id: string;
  page: number;
  excerpt: string;
}

interface SectionDraft {
  narrative: string;
  citations: CitationDraft[];
}

/** A chunk Landing AI extracted from one of the uploaded PDFs. The
 *  drawer shows these as click-to-add suggestion cards so the banker
 *  doesn't have to open the PDF and read pages manually. */
export interface SuggestedChunk {
  doc_id: string;
  doc_type: string;
  doc_filename: string;
  /** Field this chunk grounded — gives a quick hint of what's in it. */
  field_path: string;
  page: number;
  excerpt: string;
}

interface Props {
  application_id: string;
  section_key: string;
  section_title: string;
  initial_narrative: string | null;
  initial_citations: CitationDraft[];
  /** Documents the banker can pick from for new citations. */
  available_documents: DocOption[];
  /** Extracted chunks across all uploaded docs — used for suggestions. */
  suggested_chunks: SuggestedChunk[];
  on_close: () => void;
}

export function MemoEditDrawer({
  application_id,
  section_key,
  section_title,
  initial_narrative,
  initial_citations,
  available_documents,
  suggested_chunks,
  on_close,
}: Props): React.ReactElement {
  const router = useRouter();
  const [draft, setDraft] = React.useState<SectionDraft>({
    narrative: initial_narrative ?? "",
    citations: initial_citations,
  });
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Suggestion list state
  const [suggestionQuery, setSuggestionQuery] = React.useState("");
  const [showManual, setShowManual] = React.useState(false);

  // Manual fallback form
  const [addDocId, setAddDocId] = React.useState<string>(
    available_documents[0]?.doc_id ?? "",
  );
  const [addPage, setAddPage] = React.useState<number | "">("");
  const [addExcerpt, setAddExcerpt] = React.useState("");

  const isDirty =
    draft.narrative !== (initial_narrative ?? "") ||
    JSON.stringify(draft.citations) !== JSON.stringify(initial_citations);

  function addCitation() {
    if (!addDocId || typeof addPage !== "number" || addPage < 1) return;
    setDraft((d) => ({
      ...d,
      citations: [
        ...d.citations,
        { doc_id: addDocId, page: addPage, excerpt: addExcerpt.trim() },
      ],
    }));
    setAddPage("");
    setAddExcerpt("");
  }

  function addSuggestion(s: SuggestedChunk) {
    // Don't add the same {doc_id, page} twice
    setDraft((d) => {
      const exists = d.citations.some(
        (c) => c.doc_id === s.doc_id && c.page === s.page,
      );
      if (exists) return d;
      return {
        ...d,
        citations: [
          ...d.citations,
          { doc_id: s.doc_id, page: s.page, excerpt: s.excerpt.slice(0, 280) },
        ],
      };
    });
  }

  function removeCitation(idx: number) {
    setDraft((d) => ({
      ...d,
      citations: d.citations.filter((_, i) => i !== idx),
    }));
  }

  // Rank suggestions: dedupe by (doc_id, page), then filter by the
  // banker's search box. Light heuristic — chunks whose field_path or
  // excerpt match the section_key get a small boost.
  const filteredSuggestions = React.useMemo<SuggestedChunk[]>(() => {
    const seen = new Set<string>();
    const sectionTokens = section_key.split("_").filter((t) => t.length > 3);
    const q = suggestionQuery.trim().toLowerCase();
    const scored = suggested_chunks
      .filter((s) => s.excerpt && s.excerpt.length > 10)
      .filter((s) => {
        const key = `${s.doc_id}::${s.page}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((s) => {
        const hay = `${s.field_path} ${s.excerpt}`.toLowerCase();
        let score = 0;
        if (q && hay.includes(q)) score += 10;
        for (const t of sectionTokens) if (hay.includes(t)) score += 1;
        return { s, score };
      })
      .filter((x) => (q ? x.score >= 10 : true))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 50).map((x) => x.s);
  }, [suggested_chunks, suggestionQuery, section_key]);

  // Set of {doc_id::page} already cited so the suggestion cards can
  // grey themselves out / show "✓ already added".
  const citedKeys = React.useMemo(() => {
    return new Set(draft.citations.map((c) => `${c.doc_id}::${c.page}`));
  }, [draft.citations]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/applications/${application_id}/memo/edit-section`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_key,
            patches: {
              narrative: draft.narrative,
              citations: draft.citations,
            },
            actor: "banker",
            comment: comment.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      // New revision saved — refresh the page so the rendered memo
      // shows the banker's edit.
      router.refresh();
      on_close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-1/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${section_title}`}
      onClick={on_close}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-rule px-5 py-4">
          <div>
            <p className="text-eyebrow font-mono uppercase tracking-[0.06em] text-ink-3">
              Edit memo section
            </p>
            <h2 className="mt-1 font-serif text-h3 font-semi text-ink-1">
              {section_title}
            </h2>
          </div>
          <button
            type="button"
            onClick={on_close}
            aria-label="Close"
            className="rounded-md p-1 text-ink-3 hover:bg-paper-2 hover:text-ink-1"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <label className="block">
            <span className="mb-1 block text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
              Narrative
            </span>
            <textarea
              value={draft.narrative}
              onChange={(e) =>
                setDraft((d) => ({ ...d, narrative: e.target.value }))
              }
              rows={10}
              className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 font-serif text-body text-ink-1 leading-relaxed focus:border-accent focus:outline-none"
              placeholder="Banker-authored narrative for this section…"
            />
            <span className="mt-1 block text-mono-sm font-mono text-ink-3">
              Replaces the LLM-generated prose. Original draft preserved at
              revision history.
            </span>
          </label>

          {/* Citations */}
          <section>
            <p className="mb-2 text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
              Source citations ({draft.citations.length})
            </p>
            {draft.citations.length === 0 ? (
              <p className="rounded-md border border-dashed border-rule p-3 text-body-sm text-ink-3">
                No citations yet. Add at least one below to mark this section
                as grounded.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {draft.citations.map((c, i) => {
                  const doc = available_documents.find(
                    (d) => d.doc_id === c.doc_id,
                  );
                  return (
                    <li
                      key={`${c.doc_id}-${c.page}-${i}`}
                      className="flex items-start justify-between gap-2 rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-mono-sm">
                          <span className="font-semi text-ink-1">
                            {doc?.original_filename ??
                              `${c.doc_id.slice(0, 8)}…`}
                          </span>
                          <span className="text-ink-3"> · p.{c.page}</span>
                        </div>
                        {c.excerpt ? (
                          <p className="mt-0.5 truncate font-serif italic text-ink-2">
                            “{c.excerpt}”
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCitation(i)}
                        aria-label="Remove citation"
                        className="shrink-0 rounded-md p-0.5 text-ink-3 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ── Suggested citations from extracted chunks ── */}
            {suggested_chunks.length > 0 ? (
              <div className="mt-4 rounded-md border border-rule bg-paper">
                <header className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
                  <p className="text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
                    Suggested · click to add
                  </p>
                  <input
                    type="search"
                    value={suggestionQuery}
                    onChange={(e) => setSuggestionQuery(e.target.value)}
                    placeholder="Filter chunks…"
                    className="w-44 rounded-md border border-rule bg-paper-2 px-2 py-0.5 text-mono-sm font-mono focus:border-accent focus:outline-none"
                  />
                </header>
                <ul className="max-h-72 overflow-y-auto divide-y divide-rule/60">
                  {filteredSuggestions.length === 0 ? (
                    <li className="px-3 py-4 text-center text-body-sm text-ink-3">
                      No matching chunks. Clear the filter or add manually
                      below.
                    </li>
                  ) : (
                    filteredSuggestions.map((s, i) => {
                      const key = `${s.doc_id}::${s.page}`;
                      const alreadyAdded = citedKeys.has(key);
                      return (
                        <li key={`${key}-${i}`} className="px-3 py-2">
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => addSuggestion(s)}
                            className={cn(
                              "block w-full text-left rounded-md px-2 py-1.5 transition-colors",
                              alreadyAdded
                                ? "cursor-default bg-emerald-50 ring-1 ring-emerald-200"
                                : "hover:bg-paper-2",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 text-mono-sm font-mono">
                              <span className="truncate">
                                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-slate-700">
                                  {s.doc_type}
                                </span>{" "}
                                <span className="text-ink-2">
                                  {s.doc_filename}
                                </span>
                                <span className="text-ink-3"> · p.{s.page}</span>
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded-md px-1.5 py-0.5 text-mono-sm",
                                  alreadyAdded
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-accent text-paper",
                                )}
                              >
                                {alreadyAdded ? "✓ added" : "+ add"}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-3 font-serif italic text-body-sm leading-snug text-ink-2">
                              {s.excerpt}
                            </p>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            ) : null}

            {/* Manual entry — escape hatch for citing a page that wasn't
                extracted (e.g. a chart on page 47). Hidden by default. */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowManual((s) => !s)}
                className="text-mono-sm font-mono text-ink-3 hover:text-accent"
              >
                {showManual
                  ? "Hide manual entry ▴"
                  : "Need a page that's not suggested? Enter manually ▾"}
              </button>
              {showManual ? (
                <div className="mt-2 rounded-md border border-rule bg-paper p-3">
                  {available_documents.length === 0 ? (
                    <p className="text-body-sm text-ink-3">
                      No documents have been uploaded for this application yet
                      — upload a document before citing.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-[2fr_72px_auto]">
                      <select
                        value={addDocId}
                        onChange={(e) => setAddDocId(e.target.value)}
                        className="rounded-md border border-rule bg-paper-2 px-2 py-1.5 text-body-sm focus:border-accent focus:outline-none"
                      >
                        {available_documents.map((d) => (
                          <option key={d.doc_id} value={d.doc_id}>
                            {d.doc_type} · {d.original_filename}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        placeholder="Page"
                        value={addPage}
                        onChange={(e) =>
                          setAddPage(
                            e.target.value === ""
                              ? ""
                              : Number(e.target.value),
                          )
                        }
                        className="rounded-md border border-rule bg-paper-2 px-2 py-1.5 text-body-sm tabular-nums focus:border-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addCitation}
                        disabled={!addDocId || typeof addPage !== "number"}
                        className="rounded-md bg-accent px-3 py-1.5 text-body-sm font-semi text-paper hover:bg-accent-pressed disabled:opacity-40"
                      >
                        + Add
                      </button>
                      <input
                        type="text"
                        placeholder="Optional excerpt (verbatim quote)"
                        value={addExcerpt}
                        onChange={(e) => setAddExcerpt(e.target.value)}
                        className="rounded-md border border-rule bg-paper-2 px-2 py-1.5 text-body-sm focus:border-accent focus:outline-none sm:col-span-3"
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          {/* Comment */}
          <label className="block">
            <span className="mb-1 block text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
              Edit rationale (optional)
            </span>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm focus:border-accent focus:outline-none"
              placeholder="Why are you editing this section? (e.g. 'Replaced LLM narrative with audit-grounded version')"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-semantic-danger/40 bg-semantic-dangerTint/30 p-3 text-body-sm text-semantic-danger">
              Save failed: {error}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 border-t border-rule px-5 py-3">
          <span className="text-mono-sm font-mono text-ink-3">
            {isDirty ? "Unsaved changes" : "No changes yet"}
          </span>
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
              onClick={save}
              disabled={!isDirty || saving}
              className="rounded-md bg-accent px-3 py-1.5 text-body-sm font-semi text-paper hover:bg-accent-pressed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save new revision"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
