import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Commercial Credit · Provenance graph",
  description:
    "Option D (run 2) — the case as a directed graph of values, each one click from its citation and one click from the decision it fed.",
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
