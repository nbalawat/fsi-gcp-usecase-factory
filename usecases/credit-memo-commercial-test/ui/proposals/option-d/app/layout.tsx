import * as React from "react";
import "./globals.css";

export const metadata = {
  title: "Commercial Credit · Conversation timeline",
  description:
    "Option D — the case as a transcript of every agent, service, and human decision.",
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
