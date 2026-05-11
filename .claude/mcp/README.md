# .claude/mcp/

Project-scoped MCP servers. Each contributor runs `pnpm install` (or `npm install`)
once after cloning the repo; node_modules is gitignored.

## What's here

- **@playwright/mcp** — Microsoft's official Playwright MCP server. Gives
  Claude Code real browser automation: navigate, screenshot, click, fill,
  console capture, network capture, accessibility snapshots.
- **playwright** — the direct Node.js API. Used by
  `scripts/validate_with_playwright.mjs` so CI can run the same validation
  flow without an MCP-connected Claude Code session.
- **axe-core** — accessibility scanner injected into pages.

## Setup (one-time per dev machine)

```bash
cd .claude/mcp
npm install
npx playwright install chromium --with-deps
```

Then in the repo root, restart Claude Code so the MCP server registers.

## Verifying it works

After restart, the `mcp__playwright__*` tools should appear in Claude's
available toolset. Test with `mcp__playwright__browser_navigate` against
any URL (file:// or http://) and `mcp__playwright__take_screenshot`.

## Why project-scoped vs global

- Different repos may pin different Playwright versions.
- Browser binaries are large (~300 MB); each repo declares its own under
  `.playwright-browsers/` so they don't collide.
- The `.claude/settings.json` MCP registration uses a relative path so
  every contributor gets the same setup with no per-user config.
