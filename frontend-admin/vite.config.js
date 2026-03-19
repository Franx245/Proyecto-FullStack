import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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

function createModulePreloadFiles(bundle, moduleIds) {
  return Object.values(bundle)
    .filter(
      (file) =>
        file.type === "chunk" &&
        moduleIds.some((moduleId) => normalizeModuleId(file.facadeModuleId).endsWith(moduleId))
    )
    .map((file) => `/${file.fileName}`);
}

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
  const modulePreloadModules = [
    "src/views/InventoryView.jsx",
    "src/views/OrdersView.jsx",
    "src/views/WhatsappSettingsView.jsx",
  ];

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
      const modulePreloadMarkup = createModulePreloadMarkup(bundle, modulePreloadModules);

      htmlAsset.source = String(htmlAsset.source).replace(
        `<link rel="stylesheet" crossorigin href="${stylesheetHref}">`,
        `<link rel="preload" as="style" crossorigin href="${stylesheetHref}" onload="this.onload=null;this.rel='stylesheet'" data-full-stylesheet><noscript><link rel="stylesheet" crossorigin href="${stylesheetHref}"></noscript>`
      );
      htmlAsset.source = String(htmlAsset.source).replace("</head>", `${modulePreloadMarkup}</head>`);
      bundle["sw.js"] = {
        type: "asset",
        fileName: "sw.js",
        source: createCleanupServiceWorkerSource(["duelvault-admin-shell"]),
      };
    },
  };
}

const apiPort = Number(process.env.API_PORT || 3001);
const adminPort = Number(process.env.ADMIN_PORT || 5174);

export default defineConfig({
  plugins: [react(), adminPreloadAndSw()],
  server: {
    host: "127.0.0.1",
    port: adminPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: adminPort,
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