import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  TIER1_CAPITAL_USD,
  SINGLE_BORROWER_HARD_LIMIT_PCT,
} from "@/lib/bank-config";

export type CheckStatus = "pass" | "warn" | "breach";

export interface CheckResult {
  status: CheckStatus;
  headline: string;
  detail: string;
  citation?: string;
  data?: Record<string, number | string>;
}

export interface PrescreenView {
  borrower: {
    legal_name: string;
    naics_code: string | null;
    primary_state: string | null;
  };
  proposed_amount: number;
  facility_type: string;
  term_years: number;
  insider: CheckResult;
  single_borrower: CheckResult;
  concentration: CheckResult;
  overall: CheckStatus;
}

const fmtFull = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "standard",
    maximumFractionDigits: 0,
  }).format(n);

const statusStyles: Record<
  CheckStatus,
  { Icon: React.ComponentType<{ className?: string }>; tone: "success" | "warning" | "danger"; ring: string; label: string }
> = {
  pass: { Icon: CheckCircle2, tone: "success", ring: "border-semantic-success/40", label: "Pass" },
  warn: { Icon: AlertTriangle, tone: "warning", ring: "border-semantic-warning/40", label: "Watch" },
  breach: { Icon: XCircle, tone: "danger", ring: "border-semantic-danger/40", label: "Breach" },
};

interface CheckCardProps {
  title: string;
  result: CheckResult;
  /** Optional sub-component rendered inside the card (meter, breakdown). */
  children?: React.ReactNode;
}

const CheckCard: React.FC<CheckCardProps> = ({ title, result, children }) => {
  const s = statusStyles[result.status];
  const { Icon } = s;
  return (
    <div className={"flex flex-col gap-3 rounded-md border bg-paper p-4 " + s.ring}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon
            className={
              "h-5 w-5 " +
              (s.tone === "success"
                ? "text-semantic-success"
                : s.tone === "warning"
                  ? "text-semantic-warning"
                  : "text-semantic-danger")
            }
          />
          <p className="text-body-sm font-semi text-ink-1">{title}</p>
        </div>
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      </div>
      <div>
        <p className="text-body-sm font-semi text-ink-1">{result.headline}</p>
        <p className="mt-1 text-body-sm text-ink-2">{result.detail}</p>
        {result.citation && (
          <p className="mt-2 inline-flex items-center gap-1 font-mono text-mono-sm text-ink-3">
            {result.citation}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </p>
        )}
      </div>
      {children}
    </div>
  );
};

const SingleBorrowerMeter: React.FC<{ result: CheckResult }> = ({ result }) => {
  const data = result.data ?? {};
  const current = Number(data.current ?? 0);
  const proposed = Number(data.proposed ?? 0);
  const newTotal = current + proposed;
  const limit =
    TIER1_CAPITAL_USD * (SINGLE_BORROWER_HARD_LIMIT_PCT / 100);
  const scale = limit * 1.15;
  const currentW = Math.min(100, (current / scale) * 100);
  const proposedW = Math.min(100, (proposed / scale) * 100);
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-rule bg-paper-2 p-3">
      <div className="relative h-6 w-full overflow-hidden rounded-sm bg-paper">
        <span
          className="absolute left-0 top-0 h-full bg-accent/70"
          style={{ width: `${currentW}%` }}
        />
        <span
          className="absolute top-0 h-full bg-accent"
          style={{ left: `${currentW}%`, width: `${proposedW}%` }}
        />
        <span
          aria-hidden
          className="absolute top-0 h-full border-l-2 border-semantic-danger"
          style={{ left: `${100 / 1.15}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-mono-sm text-ink-3">
        <span>Existing {fmtFull(current)}</span>
        <span>+ Proposed {fmtFull(proposed)}</span>
        <span>Combined {fmtFull(newTotal)}</span>
      </div>
    </div>
  );
};

interface Props {
  view: PrescreenView;
  /** Triggered when the RM clicks "Continue to credit memo". */
  onContinue: () => void;
  /** True while the application is being submitted. */
  submitting: boolean;
  submitError: string | null;
}

export const PreScreenResult: React.FC<Props> = ({
  view,
  onContinue,
  submitting,
  submitError,
}) => {
  const blocked = view.overall === "breach";
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <CheckCard title="Reg O insider check" result={view.insider} />
        <CheckCard title="Single-borrower limit" result={view.single_borrower}>
          <SingleBorrowerMeter result={view.single_borrower} />
        </CheckCard>
        <CheckCard title="Concentration appetite" result={view.concentration} />
      </div>

      {blocked ? (
        <div className="rounded-md border border-semantic-danger/40 bg-semantic-dangerTint/20 p-4">
          <p className="font-serif text-h3 font-semi text-semantic-danger">
            Decline early — escalate before drafting a memo
          </p>
          <p className="mt-1 text-body-sm text-ink-2">
            One or more pre-screen checks would breach a regulatory or
            internal policy line. Resolve the underlying concentration or
            insider issue before submitting; otherwise this application
            burns cycle time without a viable path to approval.
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href="mailto:cco@example.com?subject=Pre-screen breach&body=Discuss before proceeding"
              className="inline-flex h-9 items-center rounded-md border border-semantic-danger/50 bg-paper px-4 text-mono-sm font-medium text-semantic-danger hover:bg-semantic-dangerTint/40"
            >
              Discuss with credit officer
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Ready to submit
            </p>
            <p className="mt-1 font-serif text-h3 font-semi text-ink-1">
              Continue to the credit memo
            </p>
            <p className="mt-1 text-body-sm text-ink-2">
              The application enters the underwriting queue. Spreading,
              policy checks, and the agent-drafted memo run automatically;
              you&rsquo;ll get a notification when it&rsquo;s ready for your
              concurrence.
            </p>
          </div>
          {submitError && (
            <p className="text-body-sm text-semantic-danger">{submitError}</p>
          )}
          <div>
            <button
              type="button"
              onClick={onContinue}
              disabled={submitting}
              className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-body-sm font-medium text-accent-fg transition hover:bg-accent-hov active:bg-accent-pressed disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Continue to credit memo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
