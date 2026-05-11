import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "CRE Surveillance · Examiner workbench",
  description:
    "Option D — every screen IS the OCC examiner's view. Citation chains from threshold to policy to reserve booking.",
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
