import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// fileURLToPath, not URL.pathname: on Windows the latter yields a leading
// slash and percent-encoded spaces, which the bundler cannot resolve.
const here = path.dirname(fileURLToPath(import.meta.url));

/* The build, wired up directly.
 *
 * This previously came from a hosted preset that bundled these plugins for us.
 * Everything it set up is spelled out here instead, so the build depends on
 * nothing but the packages in this repo and the deployment target is ours. */
export default defineConfig(({ mode }) => {
  /* Vite only exposes VITE_-prefixed variables, and only to the CLIENT. The
   * server-side values here (the backend URL, the storefront key) must never
   * be exposed that way, so instead they are loaded out of .env and placed on
   * process.env for the server to read at runtime. In production the host sets
   * real environment variables and this simply finds nothing to add. */
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["E360_API_URL", "STOREFRONT_API_KEY"]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        // Route TanStack Start's server entry through src/server.ts, our SSR
        // error wrapper.
        server: { entry: "server" },
      }),
      // Hostinger runs a persistent Node process. Nitro packages the universal
      // TanStack fetch handler as .output/server/index.mjs for that runtime.
      nitro({ preset: "node-server" }),
      viteReact(),
    ],
    css: {
      // An inline (empty) PostCSS config stops Vite walking UP the directory
      // tree for one. There is a stray postcss.config.js several folders above
      // this project wired to Tailwind v3; picked up, it tries to process a
      // Tailwind v4 stylesheet and the build dies. Tailwind v4 runs through the
      // @tailwindcss/vite plugin above, so no PostCSS step is wanted here.
      postcss: {},
    },
    resolve: {
      // Vite 8 resolves tsconfig "paths" natively — no plugin needed.
      tsconfigPaths: true,
      alias: {
        "@": path.resolve(here, "src"),
      },
      // One copy of React and the router, whatever pulls them in.
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
    },
  };
});
