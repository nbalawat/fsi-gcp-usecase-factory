"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ShieldCheck, Briefcase, UserCog } from "lucide-react";
import { PERSONA_COOKIE, PERSONA_DEFS, type Persona } from "../lib/personas";

interface PersonaSwitcherProps {
  /** Current persona; resolved from cookie on the server and passed in. */
  current: Persona;
}

const personaIcon: Record<Persona, React.ComponentType<{ className?: string }>> = {
  underwriter: UserCog,
  cco: ShieldCheck,
  rm: Briefcase,
};

/**
 * Persona switcher dropdown — slots into the AppShell top bar so a senior
 * banker can flip between the three views without re-authenticating.
 *
 * Side effects:
 *   - writes `atrium-persona` cookie (1-year expiry, lax samesite)
 *   - navigates to that persona's home (`/`, `/portfolio`, `/origination`)
 */
export const PersonaSwitcher: React.FC<PersonaSwitcherProps> = ({ current }) => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const def = PERSONA_DEFS[current];
  const Icon = personaIcon[current];

  // Close on outside click / Escape so it behaves like a real menu.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: Persona) => {
    if (next !== current) {
      // Persist for subsequent server renders.
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie = `${PERSONA_COOKIE}=${next}; Path=/; Max-Age=${oneYear}; SameSite=Lax`;
      router.push(PERSONA_DEFS[next].home);
      router.refresh();
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch persona"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-rule bg-paper px-2.5 text-mono-sm text-ink-2 hover:bg-paper-2 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium">{def.label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-md border border-rule bg-paper shadow-pop"
        >
          <div className="border-b border-rule bg-paper-2 px-3 py-2">
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              View as
            </p>
          </div>
          <ul className="flex flex-col">
            {(Object.values(PERSONA_DEFS)).map((p) => {
              const PIcon = personaIcon[p.id];
              const active = p.id === current;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => choose(p.id)}
                    className={
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-paper-2 focus:bg-paper-2 focus:outline-none " +
                      (active ? "bg-paper-2" : "")
                    }
                  >
                    <span
                      className={
                        "mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full " +
                        (active
                          ? "bg-accent text-accent-fg"
                          : "bg-paper-3 text-ink-2")
                      }
                    >
                      <PIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-semi text-ink-1">
                        {p.label}
                      </p>
                      <p className="mt-0.5 text-mono-sm font-mono text-ink-3">
                        {p.blurb}
                      </p>
                    </div>
                    {active && (
                      <span
                        aria-hidden
                        className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
