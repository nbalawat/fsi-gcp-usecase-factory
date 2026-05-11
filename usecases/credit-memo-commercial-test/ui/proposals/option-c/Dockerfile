# option-c — Cloud Run image for the inline-per-section design.
#
# Build context = REPO ROOT (so the image can see both ui/ and
# usecases/ which the @uc/* path alias points at). Three-stage build:
#   1. deps    — pnpm install with the lockfile (cacheable)
#   2. builder — `next build` with output: "standalone"
#   3. runner  — slim image: standalone tree + static + public assets
#
# Adapted from ui/apps/pipeline-console/Dockerfile so option C's two
# routes (case/[id], approval/[id]) deploy as a peer Cloud Run service.

# ── 1. deps stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY ui/package.json ui/pnpm-workspace.yaml ui/pnpm-lock.yaml ui/tsconfig.base.json ./ui/
COPY ui/apps/pipeline-console/package.json ./ui/apps/pipeline-console/
COPY ui/packages/components/package.json ./ui/packages/components/
COPY ui/packages/theme/package.json ./ui/packages/theme/
COPY ui/packages/api-client/package.json ./ui/packages/api-client/

WORKDIR /repo/ui
RUN pnpm install --frozen-lockfile


# ── 2. builder stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY --from=deps /repo/ui ./ui

# Bring in the full source for ui/ AND usecases/ (the @uc/* path
# alias points at the use case's ui/ tree, and option C's proposals
# live there).
COPY ui ./ui
COPY usecases ./usecases

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/ui/apps/pipeline-console
RUN mkdir -p public
RUN pnpm build


# ── 3. runner stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

COPY --from=builder /repo/ui/apps/pipeline-console/.next/standalone ./
COPY --from=builder /repo/ui/apps/pipeline-console/.next/static ./ui/apps/pipeline-console/.next/static
COPY --from=builder /repo/ui/apps/pipeline-console/public ./ui/apps/pipeline-console/public

EXPOSE 8080
CMD ["node", "ui/apps/pipeline-console/server.js"]
