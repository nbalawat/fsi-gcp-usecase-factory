"use client";

/**
 * Document upload — the hero head-turner moment of the demo.
 *
 * Drag a real 10-K PDF (or any PDF) onto the page. The component:
 *
 *   1. Accepts the file from a dropzone (clickable + drag-and-drop) AND from
 *      a full-page drop overlay so the user can drop anywhere on the route.
 *   2. POSTs the file as multipart/form-data to /api/ingest-10k.
 *   3. The server runs pdf-parse, builds a synthetic loan application from
 *      the 10-K text (or falls back to the curated BRW-LECO fixture when
 *      extraction quality is poor), generates an application_id, and
 *      publishes to the loans.application.submitted Pub/Sub topic. It also
 *      stashes the parsed text in the application_artifacts table so
 *      citation popovers can later resolve back to the source doc.
 *   4. The component flips through `idle → parsing → processing → success`
 *      states. On `processing`, it shows a link to the case detail page so
 *      the user lands on the live agent activity within ~3-5s of the drop.
 *   5. On error, an inline retry is offered.
 *
 * Visual design notes:
 *   - Resting state: 1px dashed border-rule.
 *   - Drag-over state: 2px solid accent — the moment of truth for the demo.
 *   - File accepted: small scale 1.0 → 1.02, fade-in.
 *   - Stage chips read live state from the orchestrator on the case detail
 *     page; here we only show the upload-side progression.
 */

import * as React from "react";
import { UploadCloud, FileText } from "lucide-react";
import { cn } from "@/lib/ui";
import { UploadProgress } from "./upload-progress";
import { UploadSuccess } from "./upload-success";
import { UploadError } from "./upload-error";

type Phase =
  | { kind: "idle" }
  | { kind: "parsing"; file: { name: string; size: number } }
  | {
      kind: "processing";
      file: { name: string; size: number };
      applicationId: string;
      parseQuality: "high" | "medium" | "low" | "fallback";
    }
  | { kind: "error"; file: { name: string; size: number }; message: string };

export interface DocumentDropzoneProps {
  /** Compact appearance for the case-detail "replace document" affordance. */
  compact?: boolean;
  /** Optional title override. */
  title?: string;
  /** Optional descriptive helper text. */
  description?: string;
  /** Called once a successful upload has been published. */
  onUploaded?: (applicationId: string) => void;
}

const KB = 1024;
const MAX_BYTES = 25 * KB * KB; // 25MB — bigger than any real 10-K excerpt.

const fmtBytes = (n: number): string => {
  if (n < KB) return `${n} B`;
  if (n < KB * KB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / KB / KB).toFixed(1)} MB`;
};

export const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({
  compact = false,
  title,
  description,
  onUploaded,
}) => {
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = React.useState(false);
  const [pageOver, setPageOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Validation + upload ────────────────────────────────────────────────

  const submit = React.useCallback(
    async (file: File) => {
      if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setPhase({
          kind: "error",
          file: { name: file.name, size: file.size },
          message: "Only PDF files are accepted. Please drop a 10-K PDF.",
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        setPhase({
          kind: "error",
          file: { name: file.name, size: file.size },
          message: `File is ${fmtBytes(file.size)} — limit is ${fmtBytes(MAX_BYTES)}.`,
        });
        return;
      }

      setPhase({ kind: "parsing", file: { name: file.name, size: file.size } });

      try {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/ingest-10k", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          let message = `Upload failed (HTTP ${res.status})`;
          try {
            const j = JSON.parse(body);
            if (j && typeof j.error === "string") {
              message = j.error;
            }
          } catch {
            if (body) message = body.slice(0, 200);
          }
          setPhase({
            kind: "error",
            file: { name: file.name, size: file.size },
            message,
          });
          return;
        }

        const j = (await res.json()) as {
          application_id?: string;
          parse_quality?: "high" | "medium" | "low" | "fallback";
        };
        if (!j.application_id) {
          setPhase({
            kind: "error",
            file: { name: file.name, size: file.size },
            message: "Server did not return an application_id.",
          });
          return;
        }
        const next: Phase = {
          kind: "processing",
          file: { name: file.name, size: file.size },
          applicationId: j.application_id,
          parseQuality: j.parse_quality ?? "medium",
        };
        setPhase(next);
        onUploaded?.(j.application_id);
      } catch (e) {
        setPhase({
          kind: "error",
          file: { name: file.name, size: file.size },
          message: (e as Error).message ?? "Network error",
        });
      }
    },
    [onUploaded],
  );

  // ── Drag-and-drop wiring ───────────────────────────────────────────────

  const onDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);
  const onDragLeave = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);
  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void submit(f);
    },
    [submit],
  );

  // Full-page drop target — drop ANYWHERE on the route, not just on the box.
  // Only enabled while we're idle / errored, so an in-flight upload doesn't
  // get clobbered.
  React.useEffect(() => {
    if (phase.kind === "parsing" || phase.kind === "processing") return undefined;
    if (typeof window === "undefined") return undefined;

    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      depth += 1;
      setPageOver(true);
    };
    const over = (e: DragEvent) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setPageOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      depth = 0;
      setPageOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void submit(f);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [phase.kind, submit]);

  // ── Manual file picker ─────────────────────────────────────────────────

  const onClickPick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);
  const onPicked = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void submit(f);
      // Reset so the same file can be re-picked.
      e.target.value = "";
    },
    [submit],
  );

  const reset = React.useCallback(() => setPhase({ kind: "idle" }), []);

  // ── Render ─────────────────────────────────────────────────────────────

  if (phase.kind === "processing") {
    return (
      <UploadSuccess
        file={phase.file}
        applicationId={phase.applicationId}
        parseQuality={phase.parseQuality}
        compact={compact}
      />
    );
  }
  if (phase.kind === "parsing") {
    return <UploadProgress file={phase.file} compact={compact} />;
  }
  if (phase.kind === "error") {
    return (
      <UploadError
        file={phase.file}
        message={phase.message}
        onRetry={reset}
        compact={compact}
      />
    );
  }

  // Idle state — the dropzone proper.
  const dz = (
    <div
      role="button"
      tabIndex={0}
      onClick={onClickPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickPick();
        }
      }}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Drop a 10-K PDF to start a new application"
      className={cn(
        "group relative flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-paper-2/40 text-center transition-all",
        compact ? "px-5 py-6" : "px-8 py-10",
        dragOver
          ? "border-2 border-solid border-semantic-success bg-semantic-successTint/40 scale-[1.01]"
          : "border border-dashed border-rule hover:border-accent hover:bg-paper-2",
      )}
      data-action="upload-10k"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={onPicked}
        aria-hidden
      />
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
          dragOver
            ? "bg-semantic-success text-paper"
            : "bg-accent-tint text-accent-pressed group-hover:bg-accent group-hover:text-accent-fg",
        )}
      >
        <UploadCloud className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="font-serif text-h3 font-semi tracking-tight text-ink-1">
          {title ?? "Drop a 10-K to start a new application"}
        </p>
        <p className="text-body-sm text-ink-2">
          {description ??
            "Drag a PDF anywhere on this page, or click to browse. We'll spread the financials, run policy, draft the credit memo, and queue it for your decision."}
        </p>
      </div>
      <p className="font-mono text-mono-sm text-ink-3">
        PDF · up to {fmtBytes(MAX_BYTES)} · processed in &lt; 90 s
      </p>
    </div>
  );

  return (
    <>
      {dz}
      {pageOver && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-semantic-successTint/40 backdrop-blur-sm"
        >
          <div className="rounded-lg border-2 border-dashed border-semantic-success bg-paper px-8 py-6 text-center shadow-lg">
            <FileText className="mx-auto mb-2 h-10 w-10 text-semantic-success" />
            <p className="font-serif text-h2 font-semi text-ink-1">
              Drop to ingest
            </p>
            <p className="text-body-sm text-ink-2">
              Release anywhere on the page to upload your 10-K.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
