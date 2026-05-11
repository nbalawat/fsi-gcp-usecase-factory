import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "CECL Q2 · Run console (inline-action)",
  description:
    "Option C — affordance axis. Each segment row carries its own PD/LGD inputs, computed reserve, and the action it enables. Approve methodology happens on the row. CFO attestation is the only escape — it lives at /approval.",
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
