import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "SAR investigation - Annotated narrative",
  description:
    "Option C - Every claim in the SAR narrative carries an inline citation. Read the narrative; cite-chips expand to the underlying evidence.",
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
