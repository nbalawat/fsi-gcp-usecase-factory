# option-c — self-contained Next.js 14 Cloud Run image.
#
# Build context = REPO ROOT (Cloud Build submits . as context).
# This Dockerfile is fully standalone — NO _vendor symlinks, NO
# workspace-package copy step. All shared primitives are materially
# inlined under ./primitives/, so the option directory is everything
# the build needs.

# ── 1. deps stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY usecases/nba-recommendations-test/ui/proposals/option-c/package.json ./package.json
RUN npm install --no-audit --no-fund

# ── 2. builder stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY usecases/nba-recommendations-test/ui/proposals/option-c/ ./

# Build the Next.js standalone bundle.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# ── 3. runner stage ───────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
