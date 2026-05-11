import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Commercial Credit · Workflow-first console",
  description:
    "Option B — the pipeline workflow is the metaphor; stages drive layout.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink-1 antialiased">
        {children}
      </body>
    </html>
  );
}
