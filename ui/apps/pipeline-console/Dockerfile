# pipeline-console — Cloud Run image.
#
# Build context = REPO ROOT (so the image can see both ui/ and usecases/
# which the @uc/* path alias points at). Three-stage build:
#   1. deps    — pnpm install with the lockfile (cacheable)
#   2. builder — `next build` with output: "standalone"
#   3. runner  — slim image: standalone tree + static + public assets
#
# Deploy:
#   gcloud run deploy fsi-ui-pipeline-console \
#     --source . \
#     --dockerfile ui/apps/pipeline-console/Dockerfile \
#     --region us-central1 \
#     --add-cloudsql-instances <project>:<region>:fsi-banking-dev \
#     --set-env-vars INSTANCE_CONNECTION_NAME=...,DB_USER=fsi_app,...
#
# DB access uses the Cloud SQL unix socket at /cloudsql/<INSTANCE>; lib/db.ts
# detects INSTANCE_CONNECTION_NAME and switches to the unix-socket path.

# ── 1. deps stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copy ONLY the workspace manifests so Docker can cache the install
# layer until any package.json or lockfile changes.
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

# Bring in the full source for ui/ AND usecases/ (the latter is the
# source of truth for @uc/* path-alias imports — UC-specific React
# components, hooks, libs).
COPY ui ./ui
COPY usecases ./usecases

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/ui/apps/pipeline-console
# Ensure public/ exists even if the app ships no public assets — the
# runner stage's COPY of public/ would otherwise fail.
RUN mkdir -p public
RUN pnpm build


# ── 3. runner stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run binds $PORT — default 8080 lines up with the platform.
ENV PORT=8080

# Standalone output: self-contained server.js + minimal node_modules.
# The standalone tree mirrors the workspace layout under /app — Next
# compiles the entrypoint at /app/ui/apps/pipeline-console/server.js.
COPY --from=builder /repo/ui/apps/pipeline-console/.next/standalone ./
COPY --from=builder /repo/ui/apps/pipeline-console/.next/static ./ui/apps/pipeline-console/.next/static
COPY --from=builder /repo/ui/apps/pipeline-console/public ./ui/apps/pipeline-console/public

EXPOSE 8080
CMD ["node", "ui/apps/pipeline-console/server.js"]
