"use client";

import * as React from "react";

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  /** Lucide-style icon name; rendered as SVG inline (no runtime dep). */
  icon: keyof typeof iconPaths;
  badge?: string | number;
}

export interface AppShellProps {
  /** Brand label rendered next to the green dot.
   *  Banker-facing — show the use case name ("Commercial Credit"), not
   *  the platform name. The internal "atrium" label is forbidden in
   *  user-visible strings (Rule 4.13 in ui-standards.md). */
  brand?: string;
  /** Subtle subtitle next to the brand, e.g. "Pipeline console" or
   *  "Underwriter view". Optional — omit if there's only one console
   *  per use case. */
  subtitle?: string;
  /** Mono context string (env / region / project). */
  context?: string;
  /** Nav items rendered down the left rail. */
  nav: NavItem[];
  /** Currently active nav id. */
  active?: string;
  /** User avatar initials. */
  avatar?: string;
  children: React.ReactNode;
  /** Called when a nav item is selected. */
  onNavigate?: (id: string) => void;
}

/**
 * App shell — the chrome every console sits inside.
 *
 *   ┌─ header (56px) ─ <brand>· · <subtitle> · ctx · search · bell · avatar
 *   ├──────────────┬──────────────────────────
 *   │ nav (240px)  │ children
 *
 * Self-contained icons (inline SVGs) so we don't pull in a runtime icon lib.
 * Use the same shell for every console (pipeline, realtime, surveillance, …);
 * pass `brand` for the use case's banker-facing name.
 */
export const AppShell: React.FC<AppShellProps> = ({
  brand = "Commercial Credit",
  subtitle,
  context = "dev · us-central1",
  nav,
  active,
  avatar = "RT",
  children,
  onNavigate,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Header */}
      <header className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-rule bg-paper px-5">
        <span className="font-serif text-h3 font-semi tracking-tight text-ink-1">
          {brand}
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[0.55em] w-[0.55em] rounded-full bg-accent align-baseline"
          />
        </span>
        {subtitle && (
          <span className="font-sans text-body-sm text-ink-3">{subtitle}</span>
        )}
        <span className="font-mono text-mono-sm text-ink-3 tracking-tight">
          {context}
        </span>
        <div className="flex-1" />
        <label className="flex h-8 items-center gap-2 rounded-sm border border-rule bg-paper-2 px-3 text-mono-sm font-mono text-ink-3 focus-within:border-accent focus-within:bg-paper">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder="Search executions, agents, rules"
            className="w-72 bg-transparent text-ink-1 placeholder:text-ink-3 focus:outline-none"
          />
          <span className="ml-2 text-ink-4">⌘K</span>
        </label>
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications (no new)"
          className="rounded-sm p-1 text-ink-2 hover:bg-paper-2 hover:text-ink-1"
        >
          <Icon name="bell" size={18} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-semantic-info text-mono-sm font-medium text-paper">
          {avatar}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Nav */}
        <nav
          className="flex flex-col border-r border-rule bg-paper py-2 transition-all"
          style={{ width: collapsed ? 56 : 224 }}
        >
          {nav.map((n) => {
            const isActive = active === n.id;
            const inner = (
              <div
                className={[
                  "flex h-9 items-center gap-3 px-3 text-ui",
                  isActive ? "bg-paper-2 text-ink-1" : "text-ink-2 hover:bg-paper-2",
                  collapsed ? "justify-center" : "",
                ].join(" ")}
                style={{
                  borderLeft: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  fontWeight: isActive ? 500 : 420,
                }}
              >
                <Icon name={n.icon} size={16} />
                {!collapsed && (
                  <>
                    <span>{n.label}</span>
                    {n.badge !== undefined && (
                      <span className="ml-auto rounded-sm bg-accent-tint px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-pressed">
                        {n.badge}
                      </span>
                    )}
                  </>
                )}
              </div>
            );

            return n.href ? (
              <a
                key={n.id}
                href={n.href}
                onClick={() => onNavigate?.(n.id)}
                className="block"
              >
                {inner}
              </a>
            ) : (
              <button
                key={n.id}
                type="button"
                onClick={() => onNavigate?.(n.id)}
                className="w-full text-left"
              >
                {inner}
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={`flex h-8 items-center px-3 text-ink-3 hover:text-ink-1 ${
              collapsed ? "justify-center" : "justify-end"
            }`}
            aria-label={collapsed ? "Expand nav" : "Collapse nav"}
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={14} />
          </button>
        </nav>

        {/* Main scroll area */}
        <main className="flex-1 overflow-auto bg-paper">{children}</main>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline Lucide-style icons. Stroke 1.5, currentColor.
// ─────────────────────────────────────────────────────────────────────────────

const iconPaths = {
  "layout-dashboard":
    "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  workflow:
    "M3 3h7v6H3zM14 3h7v6h-7zM3 15h7v6H3zM14 15h7v6h-7zM10 18h4M17 9v6",
  bot:
    "M12 8v-4M9 4h6M5 12h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2zM9 16h.01M15 16h.01",
  "git-branch":
    "M6 3v12M18 9v6M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 21a3 3 0 100-6 3 3 0 000 6zM18 9c0 3-2 6-6 6",
  inbox:
    "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
  radio:
    "M4.93 19.07a10 10 0 010-14.14M19.07 4.93a10 10 0 010 14.14M7.76 16.24a6 6 0 010-8.48M16.24 7.76a6 6 0 010 8.48M12 12h.01",
  activity:
    "M22 12h-4l-3 9L9 3l-3 9H2",
  "settings-2":
    "M20 7h-9M14 17H5M17 17a3 3 0 100-6 3 3 0 000 6zM7 7a3 3 0 100-6 3 3 0 000 6z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
  bell:
    "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0",
  "chevron-right": "M9 18l6-6-6-6",
  "chevron-left": "M15 18l-6-6 6-6",
} as const;

interface IconProps {
  name: keyof typeof iconPaths;
  size?: number;
}

const Icon: React.FC<IconProps> = ({ name, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={iconPaths[name]} />
  </svg>
);
