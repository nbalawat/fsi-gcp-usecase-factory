# option-d (conversation timeline) — Cloud Run image.
#
# This proposal mounts on top of the pipeline-console host shell — at
# build time the `@uc/*` path alias is rewritten to point at this
# option's directory:
#
#   "@uc/*": ["../../../usecases/credit-memo-commercial-test/ui/proposals/option-d/*"]
#
# So the IMAGE we ship is still `ui/apps/pipeline-console`; only the
# UC-component bundle differs per option. Build context = REPO ROOT.
#
# Three stages (mirrors pipeline-console/Dockerfile):
#   1. deps    — pnpm install with the workspace lockfile (cacheable)
#   2. builder — `next build` with output: "standalone"; alias overridden
#   3. runner  — slim standalone tree
#
# Deploy:
#   gcloud run deploy fsi-ui-credit-memo-test-option-d \
#     --source . \
#     --dockerfile usecases/credit-memo-commercial-test/ui/proposals/option-d/Dockerfile \
#     --region us-central1 \
#     --set-env-vars UC_VARIANT=option-d

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
COPY ui ./ui
COPY usecases ./usecases

# Point the @uc/* alias at this option's bundle. We patch the existing
# pipeline-console tsconfig at build time — no separate Next app needed.
RUN node -e "const fs=require('fs');const p='ui/apps/pipeline-console/tsconfig.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.compilerOptions.paths=j.compilerOptions.paths||{};j.compilerOptions.paths['@uc/*']=['../../../usecases/credit-memo-commercial-test/ui/proposals/option-d/*'];j.include=(j.include||[]).filter(x=>!x.includes('credit-memo-commercial/ui'));j.include.push('../../../usecases/credit-memo-commercial-test/ui/proposals/option-d/**/*.ts');j.include.push('../../../usecases/credit-memo-commercial-test/ui/proposals/option-d/**/*.tsx');fs.writeFileSync(p,JSON.stringify(j,null,2));"

ENV NEXT_TELEMETRY_DISABLED=1
ENV UC_VARIANT=option-d
WORKDIR /repo/ui/apps/pipeline-console
RUN mkdir -p public
RUN pnpm build


# ── 3. runner stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV UC_VARIANT=option-d

COPY --from=builder /repo/ui/apps/pipeline-console/.next/standalone ./
COPY --from=builder /repo/ui/apps/pipeline-console/.next/static ./ui/apps/pipeline-console/.next/static
COPY --from=builder /repo/ui/apps/pipeline-console/public ./ui/apps/pipeline-console/public

EXPOSE 8080
CMD ["node", "ui/apps/pipeline-console/server.js"]
