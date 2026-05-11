import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Commercial Credit · Inline-per-section memo",
  description:
    "Option C — every memo section ends with the action it enables; decisions live next to the data that informs them.",
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
