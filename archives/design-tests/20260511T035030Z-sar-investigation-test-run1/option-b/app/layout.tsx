import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "BSA / AML SAR · The 30-day clock",
  description:
    "Option B — the SAR investigation hung off the 30-day regulatory clock; every section anchored to days remaining.",
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
