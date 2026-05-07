import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Pipeline console — FSI banking",
  description:
    "Pipeline console pattern. One frontend codebase, configured per use case via console.yaml.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-canvas text-text-primary">
        {children}
      </body>
    </html>
  );
}
