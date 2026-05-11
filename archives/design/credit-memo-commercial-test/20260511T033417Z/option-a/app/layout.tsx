import type { Metadata } from "next";

// Option A — sparse-executive density. No globals.css is shipped here;
// the host pipeline-console's globals.css is what's rendered. We rely on
// the shared theme tokens (`bg-paper`, `text-ink-1`, etc.) exposed by
// the workspace's tailwind config.

export const metadata: Metadata = {
  title: "Credit memo · executive",
  description:
    "Sparse-executive surface for the commercial credit memo case detail and approval flow.",
};

export default function OptionALayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink-1 antialiased">
        {children}
      </body>
    </html>
  );
}
