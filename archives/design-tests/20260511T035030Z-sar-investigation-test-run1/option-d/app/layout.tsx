import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "BSA/AML SAR · Counterparty graph",
  description:
    "Option D — the SAR case is its counterparty graph. Edges are transactions, nodes are parties, the narrative writes itself from the selected sub-graph.",
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
