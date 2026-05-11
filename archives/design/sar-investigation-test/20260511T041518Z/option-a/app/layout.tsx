import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "SAR Investigation · Sparse executive view",
  description:
    "Option A — every BSA/AML alert reduced to the decision, the 30-day clock, and the one reason that explains the case.",
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
