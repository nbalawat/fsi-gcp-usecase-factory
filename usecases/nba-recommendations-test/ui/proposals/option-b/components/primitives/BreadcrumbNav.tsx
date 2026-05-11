import * as React from "react";

/**
 * SHARED PRIMITIVE — inlined copy of ui/packages/components/src/BreadcrumbNav.tsx
 * Source: shared.
 */
export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbNavProps {
  crumbs: Crumb[];
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({ crumbs }) => (
  <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-6 py-3 text-mono-sm font-mono text-ink-3">
    {crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      return (
        <React.Fragment key={i}>
          {c.href && !isLast ? (
            <a href={c.href} className="hover:text-ink-1 hover:underline">
              {c.label}
            </a>
          ) : (
            <span className={isLast ? "text-ink-1" : ""}>{c.label}</span>
          )}
          {!isLast && <span className="mx-1 text-ink-4">/</span>}
        </React.Fragment>
      );
    })}
  </nav>
);
