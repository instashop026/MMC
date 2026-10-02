import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);

export default defineConfig({
  root: rootDir,
  base: process.env.BASE_PATH || "/",
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    allowedHosts: true,
    fs: { strict: true },
  },
  preview: {
    host: "0.0.0.0",
    port,
    allowedHosts: true,
  },
});