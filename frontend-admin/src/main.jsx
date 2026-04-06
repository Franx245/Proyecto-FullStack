import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { createAdminQueryClient } from "./lib/queryClient";
import { recordAdminError, recordAdminEvent } from "./lib/observability";
import "./index.css";

const DYNAMIC_IMPORT_RELOAD_KEY = "duelvault_admin_dynamic_import_reload";

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    recordAdminError(event.error || new Error(event.message || "Unhandled runtime error"), {
      source: "window-error",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    recordAdminError(event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Unhandled promise rejection")), {
      source: "unhandledrejection",
    });

    const reason = String(event.reason?.message || event.reason || "");
    if (!/Failed to fetch dynamically imported module/i.test(reason)) {
      return;
    }

    if (window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === "1") {
      return;
    }

    window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, "1");
    event.preventDefault();

    window.location.reload();
  });

  window.addEventListener("online", () => {
    recordAdminEvent("connectivity", { status: "online" });
  });

  window.addEventListener("offline", () => {
    recordAdminEvent("connectivity", { status: "offline" });
  });

  window.addEventListener("load", () => {
    window.sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
  }, { once: true });
}

if (typeof window !== "undefined") {
  performance.mark("admin-boot-start");
}

const queryClient = createAdminQueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

if (typeof window !== "undefined") {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.mark("admin-shell-painted");
      performance.measure("admin-tti", "admin-boot-start", "admin-shell-painted");
    });
  });
}