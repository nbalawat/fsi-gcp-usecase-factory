# option-b · workflow-first design proposal — Cloud Run image.
#
# Mirrors ui/apps/pipeline-console/Dockerfile. The proposal mounts ON TOP of
# the shared pipeline-console shell; we package it as its own Next.js app
# pointing at this proposal's app/ directory so the comparator can pin a
# stable URL per option.
#
# Build context = REPO ROOT (so we can see both ui/ packages and the
# usecases/credit-memo-commercial-test/ui/proposals/option-b sources).

# ── 1. deps stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copy ONLY the workspace manifests so Docker caches install layers.
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

# Bring in the full source for ui/ AND usecases/ — the proposal lives under
# usecases/credit-memo-commercial-test/ui/proposals/option-b/.
COPY ui ./ui
COPY usecases ./usecases

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_PROPOSAL=option-b

# The pipeline-console build is the shared shell; this Dockerfile reuses
# its build so the standalone tree includes the proposal sources via the
# @uc/* path alias. The comparator-deploy pipeline rewires the
# pipeline-console tsconfig to point @uc/* at this proposal before build.
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
