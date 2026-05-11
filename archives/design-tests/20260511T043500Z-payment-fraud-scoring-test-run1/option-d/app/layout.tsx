import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Payment fraud · Feature heatmap",
  description:
    "Option D — the firing population shown as a feature × MCC heatmap; cells stream into events.",
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
