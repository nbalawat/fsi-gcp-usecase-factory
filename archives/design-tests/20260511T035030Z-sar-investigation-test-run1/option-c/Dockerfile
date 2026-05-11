# option-c - self-contained Next.js 14 Cloud Run image.
#
# Build context = REPO ROOT (Cloud Build submits . as context).
# This Dockerfile is fully standalone - does NOT inherit any workspace
# app. It vendors `@fsi-bank/components` and the shared mock-data module
# at build time so the resulting image carries everything it needs.

# == 1. deps stage ==
FROM node:20-alpine AS deps
WORKDIR /app

COPY usecases/sar-investigation-test/ui/proposals/option-c/package.json ./package.json
RUN npm install --no-audit --no-fund

# == 2. builder stage ==
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY usecases/sar-investigation-test/ui/proposals/option-c/ ./

# Vendor the shared workspace packages so the tsconfig path aliases resolve.
RUN mkdir -p ./_vendor/components/src ./_vendor/theme/src
COPY ui/packages/components/src/ ./_vendor/components/src/
COPY ui/packages/theme/src/      ./_vendor/theme/src/

# Vendor the shared mock-data module. Source uses
# `../../_shared/mock-data` (one extra `..` than the container layout
# has). Rewrite imports to `../_shared/mock-data` during the build.
RUN mkdir -p ./_shared
COPY usecases/sar-investigation-test/ui/proposals/_shared/mock-data.ts ./_shared/mock-data.ts
RUN find ./app ./components ./lib -type f \( -name '*.ts' -o -name '*.tsx' \) \
      -exec sed -i 's|\.\./\.\./_shared/mock-data|../_shared/mock-data|g' {} +

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# == 3. runner stage ==
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
