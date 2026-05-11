import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "CRE surveillance · Executive grid",
  description:
    "Option A — the 2D facility × risk-dimension grid is the page. Executive 30-second scan.",
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
