import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Next-best-action · Dense queue",
  description:
    "Option A — recommendations as a dense table. Triage 50-200 per day; each row is a complete unit.",
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
