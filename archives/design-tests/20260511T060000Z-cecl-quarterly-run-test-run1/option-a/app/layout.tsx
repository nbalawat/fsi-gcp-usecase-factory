import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "CECL Quarterly Run · Executive view",
  description:
    "Option A — sparse executive surface where the four-stage rail IS the page; click a stage to reveal the dense numeric ledger.",
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
