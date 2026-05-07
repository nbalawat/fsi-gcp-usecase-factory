# FSI Banking — UI monorepo

One frontend codebase. Six configurable console patterns. Per the
agentic-banking-platform methodology in `/CLAUDE.md`, no use case ships
bespoke React — every use case configures one of the six consoles via its
`usecases/<uc>/ui/console.yaml` file.

This monorepo currently ships:

- `apps/pipeline-console` — the **pipeline console** pattern. Drives the
  `credit-memo-commercial` use case (and any other multi-day, multi-stage
  use case: mortgage, KYC, treasury onboarding, collections).
- `packages/components` — the shared component library used by every console.
- `packages/theme` — bank brand tokens (colors, typography).
- `packages/api-client` — typed client for the platform's atomic services.

## Stack

- Next.js 14 (App Router, React Server Components where appropriate)
- React 18 + TypeScript (strict mode)
- Tailwind CSS for all styling (no CSS modules, no inline styles)
- pnpm workspaces
- Storybook 8 for the component library
- Vitest + React Testing Library for component tests

## Quick start

```bash
# from the repo root:
cd ui
pnpm install

# run the pipeline console against the credit-memo-commercial demo data
pnpm --filter pipeline-console dev
# → http://localhost:3000

# run the component library in Storybook
pnpm storybook
# → http://localhost:6006

# run all tests
pnpm test

# typecheck the whole monorepo
pnpm typecheck
```

## Architecture

```
ui/
├── apps/
│   └── pipeline-console/        # Next.js app, reads console.yaml at build time
├── packages/
│   ├── components/              # BreadcrumbNav, MetricStrip, WorkflowStageRail,
│   │                            # CaseCard, AgentReasoningPanel, RegulatoryClock,
│   │                            # ApprovalGate
│   ├── theme/                   # bank brand tokens
│   └── api-client/              # typed BFF / atomic-service client
├── .storybook/                  # Storybook config (one story per component)
└── pnpm-workspace.yaml
```

The pipeline-console app:

1. Reads `usecases/credit-memo-commercial/ui/console.yaml` at build time.
2. Reads the demo scenarios from `usecases/credit-memo-commercial/demo-data/scenarios/*.json`.
3. Renders the configured components against typed props derived from the
   scenarios.

Components have **no use-case-specific logic**. They take typed props bound
from `console.yaml` `data_binding` blocks. Adding a new use case = adding a
new `console.yaml`, no React changes.

## Adding a new pipeline use case

1. Author `usecases/<new-uc>/ui/console.yaml` (the console-pipeline skill
   guides this).
2. Add demo scenarios under `usecases/<new-uc>/demo-data/scenarios/*.json`.
3. Point the pipeline-console app at the new use case via the
   `NEXT_PUBLIC_USE_CASE` env var (default: `credit-memo-commercial`).

No React code changes.

## Testing

- **Vitest unit tests** for every component: `packages/components/tests/`
- **Storybook stories**: one `.stories.tsx` per component, plus a
  `credit-memo-commercial happy path` composition story.

## What's deferred

- Real BFF integration (the pipeline canvas talks to `/api/cases` mock,
  which reads from the demo-data JSON).
- SSE / WebSocket live-update wire-up — `console.yaml` declares `push_protocol: sse`
  but the mock API serves a single response. To switch to live data, replace
  `lib/load-demo-data.ts` with a BFF client.
- Approval-gate writeback — `ApprovalGate` calls handlers via props; the
  Next.js route stub is included but not wired to Cloud Tasks.
