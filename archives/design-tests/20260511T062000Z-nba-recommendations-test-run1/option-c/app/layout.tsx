import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "NBA Recommendations · inline disposition",
  description:
    "Option C — disposition lives where the rationale is. Every recommendation card carries Accept · Reject · Snooze · Escalate inline. Send-to-customer is the only walk-out.",
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
