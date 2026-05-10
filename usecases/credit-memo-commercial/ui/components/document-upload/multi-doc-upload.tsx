"use client";

/**
 * MultiDocUpload — replaces the legacy single-PDF DocumentDropzone with
 * the v3 multi-document upload flow.
 *
 * UX:
 *   1. Banker enters borrower metadata (name, loan amount, NAICS, facility).
 *   2. Adds one or more PDFs, each labeled with a doc_type (10-K, 10-Q,
 *      AR_aging, board_minutes, audited_financials, appraisal, business_plan).
 *   3. Clicks "Submit application" → POST multipart/form-data to
 *      /api/applications → Eventarc → Cloud Workflows v3 starts.
 *   4. Redirects to /cases/<application_id> where the per-doc panel +
 *      checkpoint action bar drive the rest of the lifecycle.
 *
 * For demo speed there's also a "Load demo" button that pre-fills a
 * canned borrower (Berkshire Industrial Holdings, $25M term loan).
 */

import * as React from "react";
import { useRouter } from "next/navigation";

const DOC_TYPES = [
  { value: "10-K", label: "Annual report (10-K)" },
  { value: "10-Q", label: "Quarterly report (10-Q)" },
  { value: "audited_financials", label: "Audited financials" },
  { value: "AR_aging", label: "AR aging" },
  { value: "board_minutes", label: "Board minutes" },
  { value: "appraisal", label: "Appraisal (RE)" },
  { value: "business_plan", label: "Business plan" },
] as const;

const FACILITY_TYPES = [
  "term_loan",
  "revolver",
  "asset_based_loan",
  "real_estate_secured",
  "lc_facility",
] as const;

interface DocSlot {
  id: string;
  file: File | null;
  doc_type: string;
}

const newSlotId = () => `slot-${Math.random().toString(36).slice(2, 10)}`;

/** Guess a doc_type from the PDF filename — saves the banker from
 *  picking from a dropdown for every dropped file. The mappings cover
 *  the common SEC / underwriting filename patterns the bank sees in
 *  practice. The banker can always override the auto-pick from the row's
 *  dropdown afterwards. */
function guessDocType(filename: string): string {
  const f = filename.toLowerCase();
  if (/(10[-_ ]?k|annual[-_ ]?report)/.test(f)) return "10-K";
  if (/(10[-_ ]?q|quarterly)/.test(f)) return "10-Q";
  if (/(audit(ed)?)/.test(f)) return "audited_financials";
  if (/(ar[-_ ]?aging|receivabl|aging)/.test(f)) return "AR_aging";
  if (/(board|minutes)/.test(f)) return "board_minutes";
  if (/(appraisal|appraised)/.test(f)) return "appraisal";
  if (/(business[-_ ]?plan|biz[-_ ]?plan|projection)/.test(f))
    return "business_plan";
  return "10-K"; // sensible default — most uploads start with a 10-K
}

export function MultiDocUpload(): React.ReactElement {
  const router = useRouter();
  const [borrowerName, setBorrowerName] = React.useState("");
  const [borrowerId, setBorrowerId] = React.useState("");
  const [loanAmount, setLoanAmount] = React.useState<number | "">("");
  const [naicsCode, setNaicsCode] = React.useState("");
  const [facilityType, setFacilityType] = React.useState<string>("term_loan");
  const [termYears, setTermYears] = React.useState<number | "">(5);
  const [docs, setDocs] = React.useState<DocSlot[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  function loadDemo() {
    setBorrowerName("Berkshire Industrial Holdings");
    setBorrowerId("BRW-BERKSHIRE-2024");
    setLoanAmount(25_000_000);
    setNaicsCode("333992");
    setFacilityType("term_loan");
    setTermYears(5);
  }

  function addDocSlot() {
    setDocs((prev) => [...prev, { id: newSlotId(), file: null, doc_type: "10-K" }]);
  }
  function removeDocSlot(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }
  function setSlotFile(id: string, file: File | null) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, file } : d)));
  }
  function setSlotType(id: string, doc_type: string) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, doc_type } : d)));
  }

  /** Append one row per dropped file. Filters out non-PDFs and ignores
   *  duplicates (same name + size already in the list). The auto-doctype
   *  guess saves the banker from picking from the dropdown for every
   *  file — override is one click away on the row's selector. */
  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (incoming.length === 0) {
      setError("Only PDFs are supported. Drop or pick a .pdf file.");
      return;
    }
    setError(null);
    setDocs((prev) => {
      const existing = new Set(
        prev.filter((d) => d.file).map((d) => `${d.file!.name}::${d.file!.size}`),
      );
      const fresh: DocSlot[] = [];
      for (const f of incoming) {
        const key = `${f.name}::${f.size}`;
        if (existing.has(key)) continue;
        existing.add(key);
        fresh.push({
          id: newSlotId(),
          file: f,
          doc_type: guessDocType(f.name),
        });
      }
      return [...prev, ...fresh];
    });
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  const validDocs = docs.filter((d) => d.file !== null);
  const canSubmit =
    !submitting &&
    borrowerName.trim().length > 0 &&
    borrowerId.trim().length > 0 &&
    typeof loanAmount === "number" &&
    loanAmount > 0 &&
    validDocs.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData();
    fd.append(
      "metadata",
      JSON.stringify({
        borrower_id: borrowerId.trim(),
        borrower_name: borrowerName.trim(),
        loan_amount_usd: loanAmount,
        naics_code: naicsCode.trim() || undefined,
        facility_type: facilityType,
        term_years: typeof termYears === "number" ? termYears : undefined,
        scenario_tag: "ui-multi-doc-upload",
      }),
    );
    const documents = validDocs.map((d, i) => ({
      field: `file_${i}`,
      doc_type: d.doc_type,
    }));
    fd.append("documents", JSON.stringify(documents));
    validDocs.forEach((d, i) => fd.append(`file_${i}`, d.file!));

    try {
      const r = await fetch("/api/applications", { method: "POST", body: fd });
      const text = await r.text();
      if (!r.ok) {
        try {
          const parsed = JSON.parse(text) as { error?: string };
          setError(parsed.error ?? text.slice(0, 200));
        } catch {
          setError(text.slice(0, 200));
        }
        setSubmitting(false);
        return;
      }
      const body = JSON.parse(text) as { application_id: string };
      router.push(`/cases/${body.application_id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Borrower metadata */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Borrower name *">
          <input
            type="text"
            className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-body-sm focus:border-accent focus:outline-none"
            placeholder="Acme Manufacturing Co."
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value)}
          />
        </Field>
        <Field label="Borrower ID *">
          <input
            type="text"
            className="w-full rounded-md border border-rule bg-paper px-3 py-2 font-mono text-mono-sm focus:border-accent focus:outline-none"
            placeholder="BRW-ACME-001"
            value={borrowerId}
            onChange={(e) => setBorrowerId(e.target.value)}
          />
        </Field>
        <Field label="Loan amount (USD) *">
          <input
            type="number"
            className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-body-sm tabular-nums focus:border-accent focus:outline-none"
            placeholder="25000000"
            value={loanAmount}
            min={1}
            onChange={(e) =>
              setLoanAmount(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </Field>
        <Field label="NAICS code">
          <input
            type="text"
            className="w-full rounded-md border border-rule bg-paper px-3 py-2 font-mono text-mono-sm focus:border-accent focus:outline-none"
            placeholder="333992"
            value={naicsCode}
            onChange={(e) => setNaicsCode(e.target.value)}
          />
        </Field>
        <Field label="Facility type">
          <select
            className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-body-sm focus:border-accent focus:outline-none"
            value={facilityType}
            onChange={(e) => setFacilityType(e.target.value)}
          >
            {FACILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Term (years)">
          <input
            type="number"
            className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-body-sm tabular-nums focus:border-accent focus:outline-none"
            value={termYears}
            min={1}
            max={30}
            onChange={(e) =>
              setTermYears(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </Field>
      </div>

      {/* Documents */}
      <div className="rounded-md border border-rule bg-paper-2 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-body-sm font-semi text-ink-1">
            Documents ({validDocs.length} ready)
          </h3>
          {docs.length > 0 ? (
            <button
              type="button"
              onClick={addDocSlot}
              className="rounded-md border border-rule bg-paper px-2 py-1 text-mono-sm font-mono text-ink-2 hover:border-accent"
            >
              + add empty row
            </button>
          ) : null}
        </div>

        {/* Dropzone — accepts multiple PDFs at once. Each dropped file
            becomes a new row with doc_type auto-guessed from the
            filename; the banker can override via the per-row dropdown. */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver
              ? "border-accent bg-accent/5"
              : "border-rule bg-paper hover:border-accent/60 hover:bg-accent/5"
          }`}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              // Reset so re-picking the same file fires onChange
              e.target.value = "";
            }}
          />
          <p className="text-body-sm font-semi text-ink-1">
            Drag &amp; drop PDFs here, or click to browse
          </p>
          <p className="mt-0.5 text-mono-sm font-mono text-ink-3">
            Multiple files at once · doc-type auto-detected from filename · override per row below
          </p>
        </label>

        {docs.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="grid grid-cols-1 items-center gap-2 rounded-md border border-rule bg-paper p-2 sm:grid-cols-[200px_1fr_auto]"
              >
                <select
                  className="rounded-md border border-rule bg-paper-2 px-2 py-1.5 text-body-sm focus:border-accent focus:outline-none"
                  value={d.doc_type}
                  onChange={(e) => setSlotType(d.id, e.target.value)}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {d.file ? (
                  <div className="min-w-0 flex items-baseline gap-2">
                    <span className="truncate font-mono text-mono-sm text-ink-1">
                      {d.file.name}
                    </span>
                    <span className="shrink-0 font-mono text-mono-sm text-ink-3">
                      {(d.file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="text-body-sm text-ink-2 file:mr-2 file:rounded-md file:border file:border-rule file:bg-paper-2 file:px-3 file:py-1.5 file:text-mono-sm file:font-mono file:text-ink-1 hover:file:border-accent"
                    onChange={(e) =>
                      setSlotFile(
                        d.id,
                        e.target.files && e.target.files[0] ? e.target.files[0] : null,
                      )
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeDocSlot(d.id)}
                  className="rounded-md border border-rule bg-paper-2 px-2 py-1 text-mono-sm font-mono text-ink-3 hover:border-semantic-danger hover:text-semantic-danger"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error && (
        <div className="rounded-md border border-semantic-danger/40 bg-semantic-dangerTint/30 p-3 text-body-sm text-semantic-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-md border border-rule bg-paper px-3 py-2 text-body-sm text-ink-2 hover:border-accent"
          >
            Load demo borrower
          </button>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-accent px-4 py-2 text-body-sm font-semi text-paper shadow-sm hover:bg-accent-pressed disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>

      <p className="text-mono-sm font-mono text-ink-3">
        Each PDF is uploaded to GCS, the workflow extracts financials with Landing AI, and four
        human-in-the-loop checkpoints surface in the case detail page (extraction review, rating
        review, draft review, final approval). Sources cited in the memo will trace back to the
        documents you uploaded here.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
