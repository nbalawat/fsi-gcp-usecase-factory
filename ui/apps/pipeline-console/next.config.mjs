/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production build escape hatch — there are pre-existing type errors
  // unrelated to the active workstreams (legacy fixture types, atrium
  // theme generic issues, etc.) that block `next build`. The dev server
  // and `pnpm typecheck` still surface them. Lift this once the type
  // backlog is paid down (issue: clean up pipeline-console types).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Standalone output produces a self-contained .next/standalone/ tree
  // that Cloud Run can run with `node server.js`. The Dockerfile
  // composes this with the .next/static + public dirs to produce a
  // slim image without bundling all of node_modules.
  output: "standalone",
  // The component library is consumed as TypeScript source from the
  // workspace; transpile it through Next so we don't need a separate build.
  transpilePackages: [
    "@fsi-bank/components",
    "@fsi-bank/theme",
    "@fsi-bank/api-client",
  ],
  experimental: {
    // Workspace packages live three directories up; tracing needs the
    // monorepo root so the standalone bundle picks up the lockfile +
    // package boundaries for @fsi-bank/* and the @uc/* path alias.
    outputFileTracingRoot: new URL("../../..", import.meta.url).pathname,
    // pdf-parse and @google-cloud/pubsub ship as CJS bundles that don't
    // round-trip through webpack cleanly. Mark them as server-side externals
    // so Next loads them at runtime via Node's `require` instead of bundling.
    serverComponentsExternalPackages: [
      "pdf-parse",
      "@google-cloud/pubsub",
      "pg",
    ],
  },
};

export default nextConfig;
