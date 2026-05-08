# UI authoring — DEPRECATED

This file has been folded into `docs/methodology/ui-standards.md`, the
single source of truth for UI work across all use cases.

The seven rules previously in this file are now Section 4.1 through 4.7
of `ui-standards.md`. The new doc adds:

- §1 — Tokens (palette, type ramp, spacing, motion, shadows, widths)
- §2 — Primitives catalog (which `<Component>` to use when)
- §3 — Layout (AppShell skeleton, route groups, density modes)
- §4.8–4.15 — Eight more behavior gates from the credit-memo build
- §5 — Accessibility floor (keyboard map, focus, ARIA, contrast)
- §6 — Onboarding a new console
- §7 — Diagnostic questions at scaffold
- §8 — CI gates table

The skill `.claude/skills/ui-standards/` auto-invokes when any file in
`ui/apps/` or `ui/packages/` is touched and walks the team through the
relevant section. It also exposes:

- `/ui-standards onboard <console>` — scaffold a new console
- `/ui-standards check [path]` — run all gate scripts
- `/ui-standards primitive <need>` — answer "which primitive for X?"
- `/ui-standards review` — full gate battery

See `docs/methodology/ui-standards.md` for the contract.
