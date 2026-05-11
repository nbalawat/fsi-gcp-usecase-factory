import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Payment fraud · live floor",
  description:
    "Option A — sparse-density throughput dashboard. Decisions tick past at line rate.",
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
