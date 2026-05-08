"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

interface CaseRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Where the row navigates on click. */
  href: string;
  children: React.ReactNode;
}

/**
 * Clickable table row. Whole row navigates to `href` on click;
 * keyboard users can Enter on the row.
 *
 * Server pages render <CaseRow href="..."> server-side; the click
 * + keyboard handlers are wired client-side via this component.
 */
export const CaseRow: React.FC<CaseRowProps> = ({ href, children, ...rest }) => {
  const router = useRouter();
  return (
    <tr
      {...rest}
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      className={
        "cursor-pointer border-b border-rule transition hover:bg-paper-2 focus:bg-paper-2 focus:outline-none " +
        (rest.className ?? "")
      }
    >
      {children}
    </tr>
  );
};
