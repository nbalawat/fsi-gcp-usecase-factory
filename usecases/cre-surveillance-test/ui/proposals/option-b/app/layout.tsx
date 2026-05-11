import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "CRE Surveillance · Map of risk",
  description:
    "Option B — the map IS the page. CRE facilities live in geography; each tile is colored by aggregate watchlist risk.",
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
