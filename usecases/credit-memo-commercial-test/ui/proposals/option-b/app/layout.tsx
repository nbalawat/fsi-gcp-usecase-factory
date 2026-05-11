import type { Metadata } from "next";
import * as React from "react";

export const metadata: Metadata = {
  title: "Commercial Credit · Option B (workflow-first)",
  description:
    "Workflow-first credit-memo console: stages drive the layout. Pipeline activity is the spine.",
};

/**
 * Minimal shell — no global app chrome. The case + approval pages render
 * their own chrome via the shared AppShell so the workflow-first metaphor
 * is consistent across both routes.
 */
export default function OptionBLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink-1 antialiased">
        {children}
      </body>
    </html>
  );
}
