"use client";

import * as React from "react";

/**
 * SHARED PRIMITIVE — inlined copy of ui/packages/components/src/AppShell.tsx
 * Source: shared. Header + left nav skeleton, banker-facing.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: keyof typeof iconPaths;
  badge?: string | number;
}

export interface AppShellProps {
  brand?: string;
  subtitle?: string;
  context?: string;
  nav: NavItem[];
  active?: string;
  avatar?: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  brand = "NBA · Customer 360",
  subtitle,
  context = "dev · us-central1",
  nav,
  active,
  avatar = "AS",
  children,
}) => {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-rule bg-paper px-5">
        <span className="font-serif text-h3 font-semi tracking-tight text-ink-1">
          {brand}
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[0.55em] w-[0.55em] rounded-full bg-accent align-baseline"
          />
        </span>
        {subtitle && (
          <span className="font-sans text-ui text-ink-3">{subtitle}</span>
        )}
        <span className="font-mono text-mono-sm text-ink-3">{context}</span>
        <div className="flex-1" />
        <label className="flex h-8 items-center gap-2 rounded-sm border border-rule bg-paper-2 px-3 text-mono-sm font-mono text-ink-3 focus-within:border-accent focus-within:bg-paper">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder="Search customers, recommendations"
            className="w-64 bg-transparent text-ink-1 placeholder:text-ink-3 focus:outline-none"
          />
          <span className="ml-2 text-ink-4">⌘K</span>
        </label>
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          className="rounded-sm p-1 text-ink-2 hover:bg-paper-2 hover:text-ink-1"
        >
          <Icon name="bell" size={18} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-semantic-info text-mono-sm font-medium text-paper">
          {avatar}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className="flex w-56 flex-col border-r border-rule bg-paper py-2">
          {nav.map((n) => {
            const isActive = active === n.id;
            return (
              <a
                key={n.id}
                href={n.href}
                className={[
                  "flex h-9 items-center gap-3 px-3 text-ui",
                  isActive ? "bg-paper-2 text-ink-1" : "text-ink-2 hover:bg-paper-2",
                ].join(" ")}
                style={{
                  borderLeft: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  fontWeight: isActive ? 500 : 420,
                }}
              >
                <Icon name={n.icon} size={16} />
                <span>{n.label}</span>
                {n.badge !== undefined && (
                  <span className="ml-auto rounded-sm bg-accent-tint px-1.5 py-0.5 font-mono text-mono-sm text-accent-pressed">
                    {n.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto bg-paper">{children}</main>
      </div>
    </div>
  );
};

const iconPaths = {
  inbox:
    "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  activity:
    "M22 12h-4l-3 9L9 3l-3 9H2",
  "bar-chart":
    "M12 20V10M18 20V4M6 20v-4",
  bot:
    "M12 8v-4M9 4h6M5 12h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2zM9 16h.01M15 16h.01",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
  bell:
    "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0",
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
