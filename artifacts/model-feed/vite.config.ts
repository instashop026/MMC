import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Use only environment variables set at build time (Netlify provides these).
// Never use loadEnv() which reads .env files (which may contain secrets committed to git).
export default defineConfig(({ mode }) => {
  return {
    root: rootDir,
    base: process.env.BASE_PATH || "/",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.SUPABASE_URL || ""),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.SUPABASE_PUBLISHABLE_KEY || ""
      ),
    },
    build: {
      outDir: resolve(rootDir, "dist"),
      emptyOutDir: true,
    },
    server: {
      host: "0.0.0.0",
      port: Number(process.env.PORT || 5173),
      strictPort: true,
      allowedHosts: true,
      fs: { strict: true },
    },
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.PORT || 5173),
      allowedHosts: true,
    },
  };
});
