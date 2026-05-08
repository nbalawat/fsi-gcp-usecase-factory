"use client";

import * as React from "react";
import { Briefcase, Wrench } from "lucide-react";
import { cn } from "@/lib/ui";

export type ViewMode = "banker" | "engineer";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
}

/**
 * Two-state toggle: Banker (default) vs Engineer. Persists to localStorage
 * so a credit officer or platform engineer keeps their preference.
 */
export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  value,
  onChange,
}) => {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-md border border-rule bg-paper-2 p-0.5"
    >
      <Option
        active={value === "banker"}
        onClick={() => onChange("banker")}
        label="Banker"
        icon={<Briefcase className="h-3 w-3" />}
      />
      <Option
        active={value === "engineer"}
        onClick={() => onChange("engineer")}
        label="Engineer"
        icon={<Wrench className="h-3 w-3" />}
      />
    </div>
  );
};

const Option: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}> = ({ active, onClick, label, icon }) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-mono-sm font-mono",
      active
        ? "bg-paper text-ink-1 shadow-sm"
        : "text-ink-3 hover:text-ink-1",
    )}
  >
    {icon}
    {label}
  </button>
);

const STORAGE_KEY = "pipeline-console:audit-view-mode";

/** Hook that owns the toggle's state + persists to localStorage. */
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = React.useState<ViewMode>("banker");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "banker" || saved === "engineer") {
      setMode(saved);
    }
  }, []);

  const update = React.useCallback((m: ViewMode) => {
    setMode(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, m);
    }
  }, []);

  return [mode, update];
}
