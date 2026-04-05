import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const LOCAL_API_ORIGIN = "http://127.0.0.1:3311";
const ADMIN_PORT = 5198;

function createCleanupServiceWorkerSource(cachePrefixes) {
  return `const CACHE_PREFIXES = ${JSON.stringify(cachePrefixes)};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => caches.delete(key))
    );

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await self.registration.unregister();
    await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => undefined)));
  })());
});
`;
}

function adminPreloadAndSw() {
  return {
    name: "admin-preload-and-sw",
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

      const stylesheetHref = `/${stylesheetAsset.fileName}`;

      htmlAsset.source = String(htmlAsset.source).replace(
        `<link rel="stylesheet" crossorigin href="${stylesheetHref}">`,
        `<link rel="preload" as="style" crossorigin href="${stylesheetHref}" onload="this.onload=null;this.rel='stylesheet'" data-full-stylesheet><noscript><link rel="stylesheet" crossorigin href="${stylesheetHref}"></noscript>`
      );
      htmlAsset.source = String(htmlAsset.source).replace(
        /\s*<link rel="modulepreload" crossorigin href="\/assets\/InventoryView-[^"]+\.js">/g,
        ""
      );
      bundle["sw.js"] = {
        type: "asset",
        fileName: "sw.js",
        source: createCleanupServiceWorkerSource(["duelvault-admin-shell"]),
      };
    },
  };
}

export default defineConfig({
  envDir: ".",
  plugins: [react(), adminPreloadAndSw()],
  server: {
    host: "127.0.0.1",
    port: ADMIN_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: LOCAL_API_ORIGIN,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: ADMIN_PORT,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-query": ["@tanstack/react-query"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});