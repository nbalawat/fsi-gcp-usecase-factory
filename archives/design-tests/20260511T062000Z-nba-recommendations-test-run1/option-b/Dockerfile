# option-b — self-contained Next.js 14 Cloud Run image.
#
# Build context = REPO ROOT (Cloud Build submits . as context).
# Per Rule 38 / self-contained constraint: NO _vendor symlinks. The
# proposal directory carries its own copies of every shared primitive
# under components/primitives/ and its own data fixtures under lib/.
# This Dockerfile copies ONLY the option directory and builds.

# ── 1. deps stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY usecases/nba-recommendations-test/ui/proposals/option-b/package.json ./package.json
RUN npm install --no-audit --no-fund

# ── 2. builder stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY usecases/nba-recommendations-test/ui/proposals/option-b/ ./

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
