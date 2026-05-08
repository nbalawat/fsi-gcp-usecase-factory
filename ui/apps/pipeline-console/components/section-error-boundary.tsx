"use client";

/**
 * SectionErrorBoundary — wraps any subtree (a memo section, an audit
 * panel, a stat tile) and traps render-time exceptions so a single bad
 * field cannot kill the whole page.
 *
 * Default fallback: a small inline notice that says "Section data
 * unavailable" + a hint to check the audit trail. Caller can override
 * the fallback render.
 *
 * One ErrorBoundary used everywhere — replaces the urge to pepper
 * defensive null checks throughout every formatter.
 */

import * as React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Short label for the section (e.g. "Executive Summary"). */
  label?: string;
  /** Custom fallback. If absent, a stock notice renders. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** Also log to console with this label (default: true). */
  log?: boolean;
}

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (this.props.log !== false) {
      // eslint-disable-next-line no-console
      console.error(
        `[SectionErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
        error,
        info.componentStack,
      );
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return (
      <div
        role="alert"
        className="my-4 flex items-start gap-3 rounded-md border border-semantic-warning/40 bg-semantic-warningTint/30 px-4 py-3"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-semantic-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semi text-ink-1">
            {this.props.label
              ? `${this.props.label} — section data unavailable`
              : "Section data unavailable"}
          </p>
          <p className="mt-1 text-body-sm text-ink-2">
            The agent's output for this section couldn't be rendered. Check the
            audit trail for the underlying agent action and raw output.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-2 text-mono-sm font-mono text-accent-pressed hover:underline"
          >
            Retry render
          </button>
          {process.env.NODE_ENV !== "production" && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-mono-sm text-ink-3">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
