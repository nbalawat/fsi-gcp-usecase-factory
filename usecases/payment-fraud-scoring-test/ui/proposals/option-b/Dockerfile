# option-b — self-contained Next.js 14 Cloud Run image.
#
# Build context = REPO ROOT (Cloud Build submits . as context).
# This Dockerfile is fully standalone — does NOT inherit pipeline-console
# or any other workspace app. It vendors `@fsi-bank/components` and the
# shared mock-data module at build time so the resulting image carries
# everything it needs.

# ── 1. deps stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy ONLY the option's package.json to maximize Docker layer cache.
COPY usecases/payment-fraud-scoring-test/ui/proposals/option-b/package.json ./package.json
RUN npm install --no-audit --no-fund

# ── 2. builder stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy the option's source
COPY usecases/payment-fraud-scoring-test/ui/proposals/option-b/ ./

# Vendor the shared workspace packages so the tsconfig path aliases resolve.
# We copy the SOURCE of @fsi-bank/components — Next.js bundles it via
# tsconfig 'paths' mapping; no separate package install needed.
RUN mkdir -p ./_vendor/components/src ./_vendor/theme/src
COPY ui/packages/components/src/ ./_vendor/components/src/
COPY ui/packages/theme/src/      ./_vendor/theme/src/

# Vendor the shared mock-data module. The option's source uses the
# repo-relative path `../../_shared/mock-data` (one extra `..` than the
# container layout has). Rewrite those imports to `../_shared/mock-data`
# during the build so the standalone bundle resolves cleanly.
RUN mkdir -p ./_shared
COPY usecases/payment-fraud-scoring-test/ui/proposals/_shared/mock-data.ts ./_shared/mock-data.ts
RUN find ./app ./components ./lib -type f \( -name '*.ts' -o -name '*.tsx' \) \
      -exec sed -i 's|\.\./\.\./_shared/mock-data|../_shared/mock-data|g' {} +

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

# Standalone output ships only what's needed.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
