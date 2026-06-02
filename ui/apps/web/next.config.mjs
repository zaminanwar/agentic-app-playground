import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image can ship only the minimal Node server + traced deps,
  // instead of the whole pnpm/turbo workspace + node_modules.
  // See ui/apps/web/Dockerfile for how the standalone output is assembled.
  output: "standalone",
  // In a pnpm monorepo the workspace root is one level above apps/web, so
  // Next must trace files from the repo (ui/) root to bundle correctly.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
};

export default nextConfig;
