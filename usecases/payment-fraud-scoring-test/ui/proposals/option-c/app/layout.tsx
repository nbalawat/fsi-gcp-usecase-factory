import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Payment Fraud · Decline-reason actionable",
  description:
    "Option C — every declined transaction is one click away from override, allowlist, or threshold tune.",
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
