/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  reactStrictMode: true,
  // Skip lint/typecheck during the proof-of-concept build; static lint
  // runs separately at pre-commit, and tsc is verified per option in
  // /fsi-design-proposals Stage 2 gates.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
