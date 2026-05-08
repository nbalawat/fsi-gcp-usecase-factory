import * as React from "react";
import { LiveStatus } from "./live-status";
import { PersonaSwitcher } from "./persona-switcher";
import type { Persona } from "../lib/personas";

interface PersonaTopbarProps {
  current: Persona;
  /** Optional left-side content (back link, breadcrumb, page id). */
  left?: React.ReactNode;
  /** Optional centre content (search, filters). */
  centre?: React.ReactNode;
}

/**
 * Sticky topbar rendered at the top of every persona page's main scroll area.
 * Provides the persona switcher + live-status indicator next to whatever
 * page-specific affordance the page wants on the left (back link, etc.).
 *
 * Designed to live INSIDE the AppShell main pane — AppShell's own header is
 * the global brand bar; this is the page-level chrome a banker sees first.
 */
export const PersonaTopbar: React.FC<PersonaTopbarProps> = ({
  current,
  left,
  centre,
}) => (
  <div className="sticky top-0 z-30 flex items-center gap-4 border-b border-rule bg-paper/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
    <div className="flex min-w-0 items-center gap-3">{left}</div>
    {centre && <div className="min-w-0 flex-1">{centre}</div>}
    {!centre && <div className="flex-1" />}
    <LiveStatus />
    <PersonaSwitcher current={current} />
  </div>
);
