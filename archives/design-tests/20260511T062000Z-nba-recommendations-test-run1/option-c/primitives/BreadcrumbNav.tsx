import * as React from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbNavProps {
  usecase: string;
  usecaseLabel?: string;
  stage?: string;
  caseId?: string;
  borrowerName?: string;
  backHref?: string;
  backLabel?: string;
}

/**
 * Breadcrumb path: usecase → stage? → case?
 *
 * Server component (no client interactivity). All hrefs are anchor tags;
 * routing is handled by the host app.
 *
 * source: shared
 */
export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  usecase,
  usecaseLabel,
  stage,
  caseId,
  borrowerName,
  backHref = "/",
  backLabel = "Queue",
}) => {
  const crumbs: Crumb[] = [
    { label: usecaseLabel ?? usecase, href: `/` },
  ];
  if (stage) crumbs.push({ label: stage });
  if (borrowerName) crumbs.push({ label: borrowerName });
  if (caseId) crumbs.push({ label: caseId });

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center justify-between border-b border-rule bg-paper px-6 py-3"
    >
      <ol className="flex items-center gap-2 text-ui">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-ink-3" aria-hidden>
                  /
                </span>
              )}
              {c.href && !isLast ? (
                <a
                  href={c.href}
                  className="text-ink-1 hover:text-accent-pressed hover:underline"
                >
                  {c.label}
                </a>
              ) : (
                <span
                  className={
                    isLast ? "font-semi text-ink-1" : "text-ink-2"
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
        className="text-ui text-ink-2 hover:text-accent-pressed"
      >
        ← {backLabel}
      </a>
    </nav>
  );
};
