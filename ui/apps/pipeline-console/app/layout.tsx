import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Atrium · pipeline console",
  description:
    "Atrium pipeline console — one frontend codebase, configured per use case via console.yaml.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink-1">{children}</body>
    </html>
  );
}
