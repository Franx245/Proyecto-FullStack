import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiPort = Number(process.env.API_PORT || 3311);
const storePort = Number(process.env.STORE_PORT || process.env.NEXT_STORE_PORT || 3005);

function normalizeModuleId(moduleId) {
  return typeof moduleId === "string" ? moduleId.replace(/\\/g, "/") : "";
}

function createModulePreloadMarkup(bundle, moduleIds) {
  return Object.values(bundle)
    .filter(
      (file) =>
        file.type === "chunk" &&
        moduleIds.some((moduleId) => normalizeModuleId(file.facadeModuleId).endsWith(moduleId))
    )
    .map((file) => `<link rel="modulepreload" crossorigin href="/${file.fileName}">`)
    .join("");
}

function inlineMainStylesheet() {
  const criticalCssPath = path.resolve(__dirname, "./src/critical.css");

  return {
    name: "inline-main-stylesheet",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const htmlAsset = Object.values(bundle).find(
        (file) => file.type === "asset" && file.fileName === "index.html"
      );

      const stylesheetAsset = Object.values(bundle).find(
        (file) => file.type === "asset" && /^assets\/index-.*\.css$/.test(file.fileName)
      );

      if (!htmlAsset || !stylesheetAsset) {
        return;
      }

      const htmlSource = String(htmlAsset.source);
      const stylesheetHref = `/${stylesheetAsset.fileName}`;
      const criticalCssSource = fs.readFileSync(criticalCssPath, "utf8");
      const escapedStylesheetHref = stylesheetHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const deferredStylesheet = [
        `<style data-critical-css>${criticalCssSource}</style>`,
        `<link rel="preload" as="style" crossorigin href="${stylesheetHref}" data-full-stylesheet onload="this.onload=null;this.rel='stylesheet'">`,
        `<noscript><link rel="stylesheet" crossorigin href="${stylesheetHref}"></noscript>`,
      ].join("");
      htmlAsset.source = htmlSource.replace(
        new RegExp(`<link rel="stylesheet" crossorigin href="${escapedStylesheetHref}">`),
        deferredStylesheet
      );
    },
  };
}

export default defineConfig({
  logLevel: "error",

  plugins: [react(), inlineMainStylesheet()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: "127.0.0.1",
    port: storePort,
    strictPort: true,
    open: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },

  preview: {
    host: "127.0.0.1",
    port: storePort,
    strictPort: true,
  },

  build: {
    chunkSizeWarningLimit: 1000,
    modulePreload: {
      resolveDependencies(_, dependencies) {
        return dependencies.filter((dependency) => !/\/motion-[^/]+\.js$/.test(dependency));
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          const nm = "node_modules/";
          const idx = id.indexOf(nm);
          if (idx === -1) return;
          const pkg = id.slice(idx + nm.length);
          if (pkg.startsWith("react/") || pkg.startsWith("react-dom/") || pkg.startsWith("scheduler/")) return "vendor-react";
          if (pkg.startsWith("@tanstack/react-query") || pkg.startsWith("@tanstack/query-")) return "react-query";
          if (pkg.startsWith("lucide-react")) return "ui-kit";
          if (pkg.startsWith("framer-motion") || pkg.startsWith("motion/")) return "motion";
          if (pkg.startsWith("@supabase/")) return "supabase";
          if (pkg.startsWith("sonner")) return "sonner";
        },
      },
    },
  },
});
