# option-a (credit-memo-commercial-test) — sparse-executive density.
#
# Adapted from ui/apps/pipeline-console/Dockerfile. This image builds the
# option-a proposal as a standalone Next.js Cloud Run service, with the
# same workspace structure (ui/ + usecases/) the parent shell expects.
#
# Build context = REPO ROOT.

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

# Bring in ui/ AND the option-a slice under usecases/. The build mounts
# option-a's app/ + components/ + lib/ via the pipeline-console host.
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
