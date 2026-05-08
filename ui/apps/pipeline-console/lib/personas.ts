/**
 * Persona configuration — the three banker views layered on top of the same
 * pipeline-console data layer.
 *
 *   underwriter — runs the approval queue (default; the existing app/page.tsx).
 *   cco         — chief credit officer; portfolio + concentration + watchlist.
 *   rm          — relationship manager; origination + their pipeline.
 *
 * The active persona is stored in a cookie (`atrium-persona`) so it persists
 * across navigation. The AppShell reads it from the cookie on the server and
 * passes the right `nav` config to its children.
 */

export type Persona = "underwriter" | "cco" | "rm";

export const PERSONA_COOKIE = "atrium-persona";

export const PERSONAS: Persona[] = ["underwriter", "cco", "rm"];

export interface PersonaDef {
  id: Persona;
  /** Banker-facing label rendered in the switcher. */
  label: string;
  /** Plain-English description shown under the label. */
  blurb: string;
  /** Where the switcher routes when this persona becomes active. */
  home: string;
  /** Two-letter initials used in the avatar bubble. */
  initials: string;
}

export const PERSONA_DEFS: Record<Persona, PersonaDef> = {
  underwriter: {
    id: "underwriter",
    label: "Underwriter",
    blurb: "Approval queue · case decisioning",
    home: "/",
    initials: "RT",
  },
  cco: {
    id: "cco",
    label: "Chief Credit Officer",
    blurb: "Portfolio · concentration · watchlist",
    home: "/portfolio",
    initials: "JM",
  },
  rm: {
    id: "rm",
    label: "Relationship Manager",
    blurb: "Origination · in-flight deals",
    home: "/origination",
    initials: "AS",
  },
};

export interface PersonaNavItem {
  id: string;
  label: string;
  /** Lucide-style icon name supported by AppShell.iconPaths. */
  icon:
    | "layout-dashboard"
    | "workflow"
    | "bot"
    | "git-branch"
    | "inbox"
    | "radio"
    | "activity"
    | "settings-2"
    | "search";
  href: string;
  badge?: number;
}

/**
 * Build the persona's nav. `queueLength` is used for the underwriter's queue
 * badge; pass 0 if you don't have it yet.
 */
export function personaNav(
  persona: Persona,
  queueLength = 0,
): PersonaNavItem[] {
  switch (persona) {
    case "underwriter":
      return [
        { id: "overview", label: "Pipeline overview", icon: "layout-dashboard", href: "/" },
        { id: "queue", label: "Approval queue", icon: "inbox", href: "/", badge: queueLength },
      ];
    case "cco":
      return [
        { id: "portfolio", label: "Portfolio", icon: "layout-dashboard", href: "/portfolio" },
        { id: "concentration", label: "Concentration", icon: "git-branch", href: "/concentration" },
        { id: "watchlist", label: "Watchlist", icon: "activity", href: "/watchlist" },
      ];
    case "rm":
      return [
        { id: "origination", label: "My origination", icon: "workflow", href: "/origination" },
        { id: "pipeline", label: "My pipeline", icon: "inbox", href: "/pipeline" },
      ];
  }
}

/** Read the persona from a Next.js Request cookies header (server side). */
export function parsePersonaCookie(value: string | undefined): Persona {
  if (value === "cco" || value === "rm" || value === "underwriter") return value;
  return "underwriter";
}
