import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const turbopackRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: turbopackRoot,
  turbopack: {
    root: turbopackRoot,
    resolveAlias: {
      yjs: "yjs/dist/yjs.mjs",
    },
  },
};

export default nextConfig;
