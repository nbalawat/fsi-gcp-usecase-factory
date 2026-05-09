import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Commercial Credit · Underwriter",
  description:
    "Commercial credit underwriting console — pipeline view of in-flight loan applications.",
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
