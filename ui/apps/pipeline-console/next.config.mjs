/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The component library is consumed as TypeScript source from the
  // workspace; transpile it through Next so we don't need a separate build.
  transpilePackages: [
    "@fsi-bank/components",
    "@fsi-bank/theme",
    "@fsi-bank/api-client",
  ],
  experimental: {
    // Allow the app to read files from outside the app dir (the use-case
    // console.yaml + demo-data scenarios live in usecases/<uc>/).
    outputFileTracingRoot: undefined,
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
