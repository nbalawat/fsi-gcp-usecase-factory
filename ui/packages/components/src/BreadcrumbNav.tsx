import * as React from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbNavProps {
  /** Use case slug, rendered as the root crumb */
  usecase: string;
  /** Use-case display name */
  usecaseLabel?: string;
  /** Optional stage id (e.g. "underwrite") */
  stage?: string;
  /** Optional case id (e.g. "DEMO-APP-MFG-001-2026") */
  caseId?: string;
  /** Optional borrower display name shown after the stage crumb */
  borrowerName?: string;
  /** Path to "back to live floor" — defaults to `/` */
  backHref?: string;
  /** Label for the back link */
  backLabel?: string;
}

/**
 * Breadcrumb path: usecase → stage? → case?
 *
 * Server component (no client interactivity). All hrefs are anchor tags;
 * routing is handled by the host app.
 */
export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  usecase,
  usecaseLabel,
  stage,
  caseId,
  borrowerName,
  backHref = "/",
  backLabel = "Live floor",
}) => {
  const crumbs: Crumb[] = [
    { label: usecaseLabel ?? usecase, href: `/${usecase}` },
  ];
  if (stage) crumbs.push({ label: stage });
  if (borrowerName) crumbs.push({ label: borrowerName });
  if (caseId) crumbs.push({ label: caseId });

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center justify-between border-b border-surface-border bg-surface-panel px-6 py-3"
    >
      <ol className="flex items-center gap-2 text-sm">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-text-muted" aria-hidden>
                  /
                </span>
              )}
              {c.href && !isLast ? (
                <a
                  href={c.href}
                  className="text-brand-primary hover:underline"
                >
                  {c.label}
                </a>
              ) : (
                <span
                  className={
                    isLast
                      ? "font-semibold text-text-primary"
                      : "text-text-secondary"
                  }
                  aria-current={isLast ? "page" : undefined}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <a
        href={backHref}
        className="text-sm text-text-secondary hover:text-brand-primary"
      >
        ← {backLabel}
      </a>
    </nav>
  );
};
