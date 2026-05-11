import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "NBA · Customer narratives",
  description:
    "Option B — every recommendation is a customer story, not a data row.",
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
