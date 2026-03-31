import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";
import "@/index.css";

const DYNAMIC_IMPORT_RELOAD_KEY = "duelvault_store_dynamic_import_reload";

async function cleanupLegacyStoreShell() {
  if (typeof window === "undefined") {
    return;
  }

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {}
  }

  if ("caches" in window) {
    try {
      const cacheKeys = await window.caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith("duelvault-shell"))
          .map((key) => window.caches.delete(key))
      );
    } catch {}
  }
}

if (typeof window !== "undefined") {
  void cleanupLegacyStoreShell();

  window.addEventListener("unhandledrejection", (event) => {
    const reason = String(event.reason?.message || event.reason || "");
    if (!/Failed to fetch dynamically imported module/i.test(reason)) {
      return;
    }

    if (window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === "1") {
      return;
    }

    window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, "1");
    event.preventDefault();

    void cleanupLegacyStoreShell().finally(() => {
      window.location.reload();
    });
  });

  window.addEventListener("load", () => {
    window.sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
  }, { once: true });
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);