import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Fraud scoring · Model health",
  description:
    "Option B — the page IS the model. Score distribution, feature firing, drift, and the latest sample are the primary surface.",
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
