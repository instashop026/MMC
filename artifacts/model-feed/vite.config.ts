import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);

export default defineConfig(({ mode }) => {
  // Only the Supabase URL and publishable key are embedded in the browser.
  // Never map SUPABASE_SERVICE_ROLE_KEY or other server credentials here.
  const env = loadEnv(mode, rootDir, "");
  return {
    root: rootDir,
    base: process.env.BASE_PATH || "/",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ""),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
      ),
    },
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
  };
});