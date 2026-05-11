// Minimal Next.js root layout that wires up the shared AppShell so
// option C's two routes get the same chrome as the rest of the
// pipeline console. AppShell is a Client component; we wrap it in a
// thin server-rendered shell so Next.js can stream the page.

import * as React from "react";
import "./globals.css";
import { AppShell, type NavItem } from "@fsi-bank/components";

const nav: NavItem[] = [
  { id: "case", label: "Case review", href: "/case/APP-2026-LECO-001", icon: "inbox" },
  {
    id: "approval",
    label: "Approval queue",
    href: "/approval/APP-2026-LECO-001",
    icon: "git-branch",
  },
];

interface LayoutProps {
  children: React.ReactNode;
}

const RootLayout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <html lang="en">
      <body>
        <AppShell
          brand="Commercial Credit"
          subtitle="Option C · inline-per-section"
          context="dev · us-central1"
          nav={nav}
          active="case"
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
};

export default RootLayout;
