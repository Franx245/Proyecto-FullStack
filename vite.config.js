import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createHash } from "node:crypto";
import fs from "node:fs";

const apiPort = Number(process.env.API_PORT || 3001);
const storePort = Number(process.env.STORE_PORT || 5173);

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

function createServiceWorkerSource(cachePrefix, precacheUrls) {
  const cacheVersion = createHash("sha1")
    .update(precacheUrls.join("|"))
    .digest("hex")
    .slice(0, 10);

  return `const CACHE_NAME = "${cachePrefix}-${cacheVersion}";
const SHELL_CACHE_URL = "/index.html";
const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("${cachePrefix}-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedShell = (await cache.match(SHELL_CACHE_URL)) || (await cache.match("/"));
      const networkUpdate = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(SHELL_CACHE_URL, response.clone());
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cachedShell);

      return cachedShell || networkUpdate;
    })());
    return;
  }

  if (!url.pathname.startsWith("/assets/") && !PRECACHE_URLS.includes(url.pathname)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  })());
});
`;
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
      const precacheUrls = [
        "/",
        "/index.html",
        "/manifest.json",
        "/icon.svg",
        ...Object.values(bundle)
          .filter((file) => file.fileName !== "index.html")
          .map((file) => `/${file.fileName}`),
      ];

      htmlAsset.source = htmlSource.replace(
        new RegExp(`<link rel="stylesheet" crossorigin href="${escapedStylesheetHref}">`),
        deferredStylesheet
      );
      bundle["sw.js"] = {
        type: "asset",
        fileName: "sw.js",
        source: createServiceWorkerSource("duelvault-shell", [...new Set(precacheUrls)]),
      };
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
        manualChunks: {
          "react-query": ["@tanstack/react-query"],
          "ui-kit": ["lucide-react"],
        },
      },
    },
  },
});