import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Commercial Credit · Executive view",
  description:
    "Option A — sparse executive decision card. The recommendation is the page.",
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
