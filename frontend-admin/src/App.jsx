import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  LogOut,
  Menu,
  MessageCircle,
  PackageSearch,
  ReceiptText,
  ShieldAlert,
  Star,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  clearStoredSession,
  createCustomCategory,
  createCustomProduct,
  deleteCards,
  exportOrdersWorkbook,
  getCards,
  getCustomCategories,
  getCustomProducts,
  clearOrders,
  deleteOrder,
  getDashboard,
  getContactRequests,
  getInventoryCards,
  getOrders,
  getWhatsappSettings,
  getUsers,
  refreshAdminSession,
  getStoredSession,
  loginAdmin,
  updateCustomCategory,
  updateCustomProduct,
  updateCard,
  updateCardsBulk,
  updateContactRequestStatus,
  syncCatalogToScope,
  updateOrderShipping,
  updateOrderStatus,
  updateWhatsappSettings,
  updateUserRole,
  setStoredSession,
  isConflictError,
  isTimeoutError,
} from "./lib/api";
import { clearPersistedAdminQueryCache, persistAdminQueryCacheNow } from "./lib/queryClient";
import { generateClientMutationId, recordAdminEvent, startAdminFlow } from "./lib/observability";
import { userRoleLabel } from "./views/shared";

import DashboardView from "./views/DashboardView";

function lazyWithPreload(factory) {
  const Component = lazy(factory);
  Component.preload = factory;
  return Component;
}

function scheduleIdleTask(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const callbackId = window.requestIdleCallback(callback, { timeout: 1600 });
    return () => window.cancelIdleCallback?.(callbackId);
  }

  const timeoutId = window.setTimeout(callback, 220);
  return () => window.clearTimeout(timeoutId);
}

const AnalyticsView = lazyWithPreload(() => import("./views/AnalyticsView"));
const CustomContentView = lazyWithPreload(() => import("./views/CustomContentView"));
const HomeMerchandisingView = lazyWithPreload(() => import("./views/HomeMerchandisingView"));
const InventoryView = lazyWithPreload(() => import("./views/InventoryView"));
const OrdersView = lazyWithPreload(() => import("./views/OrdersView"));
const UsersView = lazyWithPreload(() => import("./views/UsersView"));
const WhatsappSettingsView = lazyWithPreload(() => import("./views/WhatsappSettingsView"));

const sections = [
  { key: "dashboard", label: "Panel", icon: BarChart3 },
  { key: "inventory", label: "Inventario", icon: Boxes },
  { key: "home", label: "Portada", icon: Star },
  { key: "custom", label: "Tienda custom", icon: PackageSearch },
  { key: "analytics", label: "Analíticas", icon: TrendingUp },
  { key: "orders", label: "Pedidos", icon: ReceiptText },
  { key: "whatsapp", label: "Contacto", icon: MessageCircle },
  { key: "users", label: "Usuarios", icon: Users },
];

const SECTION_PATHS = {
  dashboard: "/dashboard",
  inventory: "/inventory",
  home: "/home",
  custom: "/custom",
  analytics: "/analytics",
  orders: "/orders",
  whatsapp: "/contacto",
  users: "/users",
};

const LAST_SECTION_KEY = "duelvault_admin_last_section";
const ADMIN_SHELL_STATE_KEY = "duelvault_admin_shell_state_v3";
const DEFAULT_INVENTORY_FILTERS = {
  search: "",
  rarity: "all",
  cardType: "all",
  stockStatus: "all",
  visibility: "all",
};

const SECTION_META = {
  dashboard: {
    title: "Panel central",
    description: "Resumen del duelo comercial con métricas, ventas y alertas críticas.",
  },
  inventory: {
    title: "Inventario",
    description: "Precios, stock, visibilidad y sincronización del catálogo principal.",
  },
  home: {
    title: "Portada",
    description: "Control de destacadas y últimos ingresos para la tienda pública.",
  },
  custom: {
    title: "Tienda custom",
    description: "Categorías y publicaciones propias fuera del catálogo principal.",
  },
  analytics: {
    title: "Analíticas",
    description: "Ingresos, altas y comportamiento comercial histórico del negocio.",
  },
  orders: {
    title: "Pedidos",
    description: "Cobros, estados, tracking y limpieza operativa.",
  },
  whatsapp: {
    title: "Contacto",
    description: "Canales de soporte e inbox de consultas recibidas.",
  },
  users: {
    title: "Usuarios",
    description: "Roles, actividad y resumen comercial por cliente.",
  },
};

const SECTION_REQUIREMENTS = {
  dashboard: { dashboard: true, orders: true, users: true, cards: true },
  analytics: { dashboard: true },
  inventory: { dashboard: true, inventoryCards: true },
  home: { dashboard: true, cards: true },
  orders: { dashboard: true, orders: true },
  whatsapp: { dashboard: true, whatsapp: true },
  users: { dashboard: true, users: true },
  custom: { dashboard: true, custom: true },
};

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function getSectionFromPath(pathname) {
  const normalizedPath = pathname?.replace(/\/+$/, "") || "/";
  const matchedEntry = Object.entries(SECTION_PATHS).find(([, path]) => path === normalizedPath);
  return matchedEntry?.[0] || null;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAdminShellState() {
  if (!canUseStorage()) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(ADMIN_SHELL_STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeAdminShellState(updater) {
  if (!canUseStorage()) {
    return {};
  }

  const currentState = readAdminShellState();
  const nextState = typeof updater === "function" ? updater(currentState) : { ...currentState, ...updater };
  window.localStorage.setItem(ADMIN_SHELL_STATE_KEY, JSON.stringify(nextState));
  return nextState;
}

function getStoredInventoryPage() {
  const page = Number(readAdminShellState().inventoryPage);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getStoredInventoryFilters() {
  return {
    ...DEFAULT_INVENTORY_FILTERS,
    ...(readAdminShellState().inventoryFilters || {}),
  };
}

function getStoredScrollTop(section) {
  const top = Number(readAdminShellState().scrollPositions?.[section]);
  return Number.isFinite(top) && top > 0 ? top : 0;
}

function getCachedQueryOptions(queryClient, queryKey) {
  const queryState = queryClient.getQueryState(queryKey);
  if (typeof queryState?.data === "undefined") {
    return {};
  }

  return {
    initialData: queryState.data,
    initialDataUpdatedAt: queryState.dataUpdatedAt,
  };
}

function getCardInventoryStatus(card) {
  const stock = Number(card?.stock || 0);
  const lowStockThreshold = Number(card?.low_stock_threshold || 0);

  if (stock <= 0) {
    return "out_of_stock";
  }

  if (lowStockThreshold > 0 && stock <= lowStockThreshold) {
    return "low_stock";
  }

  return "available";
}

function applyCardUpdates(card, updates) {
  if (!card) {
    return card;
  }

  const nextCard = {
    ...card,
    ...updates,
  };

  nextCard.status = getCardInventoryStatus(nextCard);
  return nextCard;
}

function findCardSnapshot(cardId, ...sources) {
  for (const source of sources) {
    const foundCard = source?.find?.((card) => card.id === cardId);
    if (foundCard) {
      return foundCard;
    }
  }

  return null;
}

function updateCardsResponse(response, updater) {
  if (!response || !Array.isArray(response.cards)) {
    return response;
  }

  let changed = false;
  const nextCards = response.cards.map((card) => {
    const nextCard = updater(card);
    if (nextCard !== card) {
      changed = true;
    }
    return nextCard;
  });

  return changed ? { ...response, cards: nextCards } : response;
}

function removeCardsFromResponse(response, idsToRemove) {
  if (!response || !Array.isArray(response.cards)) {
    return response;
  }

  const nextCards = response.cards.filter((card) => !idsToRemove.has(card.id));
  if (nextCards.length === response.cards.length) {
    return response;
  }

  const removedCount = response.cards.length - nextCards.length;
  return {
    ...response,
    cards: nextCards,
    ...(typeof response.total === "number" ? { total: Math.max(0, response.total - removedCount) } : {}),
    ...(typeof response.count === "number" ? { count: Math.max(0, response.count - removedCount) } : {}),
  };
}

function updateOrdersResponse(response, updater) {
  if (!response || !Array.isArray(response.orders)) {
    return response;
  }

  let changed = false;
  const nextOrders = response.orders.map((order) => {
    const nextOrder = updater(order);
    if (nextOrder !== order) {
      changed = true;
    }
    return nextOrder;
  });

  return changed ? { ...response, orders: nextOrders } : response;
}

function removeOrdersFromResponse(response, predicate) {
  if (!response || !Array.isArray(response.orders)) {
    return response;
  }

  const nextOrders = response.orders.filter((order) => !predicate(order));
  if (nextOrders.length === response.orders.length) {
    return response;
  }

  return { ...response, orders: nextOrders };
}

function updateUsersResponse(response, updater) {
  if (!response || !Array.isArray(response.users)) {
    return response;
  }

  let changed = false;
  const nextUsers = response.users.map((user) => {
    const nextUser = updater(user);
    if (nextUser !== user) {
      changed = true;
    }
    return nextUser;
  });

  return changed ? { ...response, users: nextUsers } : response;
}

function updateContactRequestsResponse(response, updater) {
  if (!response || !Array.isArray(response.contact_requests)) {
    return response;
  }

  let changed = false;
  const nextRequests = response.contact_requests.map((contactRequest) => {
    const nextRequest = updater(contactRequest);
    if (nextRequest !== contactRequest) {
      changed = true;
    }
    return nextRequest;
  });

  if (!changed) {
    return response;
  }

  const summary = nextRequests.reduce((accumulator, contactRequest) => {
    const key = String(contactRequest.status || "").toLowerCase();
    if (key in accumulator) {
      accumulator[key] += 1;
    }
    return accumulator;
  }, {
    total: nextRequests.length,
    new: 0,
    in_progress: 0,
    responded: 0,
    archived: 0,
  });

  return {
    ...response,
    contact_requests: nextRequests,
    summary,
  };
}

function restoreQuerySnapshots(queryClient, snapshots) {
  for (const [queryKey, data] of snapshots || []) {
    queryClient.setQueryData(queryKey, data);
  }
}

function getStoredSection() {
  if (typeof window === "undefined") {
    return "dashboard";
  }

  const fromPath = getSectionFromPath(window.location.pathname);
  if (fromPath) {
    return fromPath;
  }

  const storedSection = window.localStorage.getItem(LAST_SECTION_KEY);
  return SECTION_PATHS[storedSection] ? storedSection : "dashboard";
}

function syncSectionPath(section, { replace = false } = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const targetPath = SECTION_PATHS[section] || SECTION_PATHS.dashboard;
  if (window.location.pathname === targetPath) {
    return;
  }

  window.history[replace ? "replaceState" : "pushState"]({ section }, "", `${targetPath}${window.location.search}${window.location.hash}`);
}

function getResourceUpdatedAt(resource) {
  return typeof resource?.updated_at === "string" || resource?.updated_at instanceof Date
    ? resource.updated_at
    : null;
}

function createMutationPayload(basePayload, { resourceType, action, expectedUpdatedAt, resourceId } = {}) {
  return {
    ...(basePayload || {}),
    ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    mutation_id: generateClientMutationId(`${resourceType || "resource"}-${action || "update"}`),
    resource_id: resourceId,
  };
}

function buildCardSelectionResources(selection, sources = []) {
  const normalizedSelection = Array.isArray(selection)
    ? { ids: selection }
    : { ...(selection || {}) };
  const selectedIds = Array.isArray(normalizedSelection.ids)
    ? normalizedSelection.ids.map(Number).filter(Number.isFinite)
    : [];

  if (!selectedIds.length) {
    return [];
  }

  const resourcesById = new Map();
  for (const source of sources) {
    for (const resource of source || []) {
      if (resource?.id != null && !resourcesById.has(resource.id)) {
        resourcesById.set(resource.id, resource);
      }
    }
  }

  return selectedIds
    .map((id) => {
      const resource = resourcesById.get(id);
      const expectedUpdatedAt = getResourceUpdatedAt(resource);
      return expectedUpdatedAt ? { id, expected_updated_at: expectedUpdatedAt } : null;
    })
    .filter(Boolean);
}

function createSelectionPayload(selection, prefix = "selection", resources = []) {
  const normalizedSelection = Array.isArray(selection)
    ? { ids: selection }
    : { ...(selection || {}) };

  return {
    ...normalizedSelection,
    ...(resources.length ? { resources } : {}),
    mutation_id: generateClientMutationId(prefix),
  };
}

function getReadableMutationError(error) {
  if (isConflictError(error)) {
    return error.message || "Otro operador cambió este recurso antes que vos. Recargamos el estado actual.";
  }

  if (isTimeoutError(error)) {
    return error.message || "La operación tardó demasiado. Reintentá.";
  }

  return error?.message || "No pudimos completar la operación.";
}

function warmAdminCache(queryClient, adminId) {
  return Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ["dashboard", adminId],
      queryFn: getDashboard,
      staleTime: 1000 * 60 * 5,
    }),
    queryClient.prefetchQuery({
      queryKey: ["orders", adminId],
      queryFn: getOrders,
      staleTime: 1000 * 60 * 5,
    }),
    queryClient.prefetchQuery({
      queryKey: ["users", adminId],
      queryFn: getUsers,
      staleTime: 1000 * 60 * 5,
    }),
  ]);
}

function SkeletonBlock({ className = "h-20" }) {
  return <div className={cn("animate-pulse rounded-3xl border border-white/5 bg-white/[0.04]", className)} />;
}

function SectionNav({ section, onSectionChange, onSectionIntent, className = "" }) {
  return (
    <nav className={className}>
      {sections.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onSectionChange(key)}
          onMouseEnter={() => onSectionIntent?.(key)}
          onFocus={() => onSectionIntent?.(key)}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition whitespace-nowrap lg:w-full",
            section === key ? "border-amber-400/30 bg-amber-400/12 text-amber-100" : "border-transparent bg-white/[0.02] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function MobileSectionNav({ section, onSectionChange, onSectionIntent }) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        Sección actual
      </label>
      <select
        value={section}
        onChange={(event) => onSectionChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400"
      >
        {sections.map(({ key, label }) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-2">
        {sections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSectionChange(key)}
            onTouchStart={() => onSectionIntent?.(key)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition",
              section === key ? "border-amber-400/30 bg-amber-400/12 text-amber-100" : "border-transparent bg-white/[0.02] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: loginAdmin,
    onSuccess: (session) => {
      setError("");
      onLoggedIn(session);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glow">
        <div className="mb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            DuelVault Admin 🐉
          </p>
          <h1 className="mt-5 text-3xl font-black text-white">Panel del duelista</h1>
          <p className="mt-2 text-sm text-slate-300">Acceso por roles, sesión persistente y control táctico de la tienda.</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate({ email, password });
          }}
        >
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Usuario o email</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Contraseña</label>
            <input
              type="password"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
            <p>👑 Admin por defecto: admin / admin</p>
            <p className="mt-1">👑 Admin alternativo: admin@test.com / admin123</p>
            <p className="mt-1">🛡️ Staff: staff@test.com / staff123</p>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {loginMutation.isPending ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function getBootstrapSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const bootstrap = params.get("bootstrap");
  if (!bootstrap) {
    return null;
  }

  try {
    const session = JSON.parse(window.atob(bootstrap));
    if (!session?.accessToken || !session?.refreshToken || !session?.admin) {
      return null;
    }

    setStoredSession(session);
    params.delete("bootstrap");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
    return session;
  } catch {
    return null;
  }
}

async function resolveStorefrontLoginUrl() {
  const configuredStorefrontUrl = (import.meta.env.VITE_STOREFRONT_URL || "").replace(/\/$/, "");

  if (configuredStorefrontUrl) {
    return `${configuredStorefrontUrl}/auth?mode=login`;
  }

  const fallbackPort = 5173;

  try {
    const response = await fetch("/api/health");
    const payload = await response.json().catch(() => ({}));
    const storePort = payload?.runtime?.store_port || fallbackPort;
    return `${window.location.protocol}//${window.location.hostname}:${storePort}/auth?mode=login`;
  } catch {
    return `${window.location.protocol}//${window.location.hostname}:${fallbackPort}/auth?mode=login`;
  }
}

function AdminLoadingShell() {
  return (
    <div className="w-full min-h-screen px-4 py-4 md:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <SkeletonBlock className="h-[720px] rounded-[32px]" />
        <div className="space-y-6">
          <SkeletonBlock className="h-32 rounded-[32px]" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-32" />)}
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <SkeletonBlock className="h-[420px]" />
            <SkeletonBlock className="h-[420px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLoadingPanel() {
  return (
    <div className="glass rounded-[32px] border border-white/10 p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-28" />)}
      </div>
    </div>
  );
}

function SectionErrorPanel({ message }) {
  return (
    <div className="glass rounded-[32px] border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-100">
      {message || "No pudimos cargar esta sección."}
    </div>
  );
}

function OperationNotice({ notice, online }) {
  if (!notice && online) {
    return null;
  }

  const tone = !online
    ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
    : notice?.tone === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
      : notice?.tone === "success"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : "border-sky-400/30 bg-sky-400/10 text-sky-100";

  const message = !online
    ? "Estás sin conexión. El panel mantiene el estado visible, pero no enviará cambios hasta recuperar red."
    : notice?.message;

  return (
    <div className={cn("glass rounded-[24px] border px-4 py-3 text-sm", tone)}>
      {message}
    </div>
  );
}

function StatCard({ title, value, tone = "default" }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.04]",
    warn: "border-amber-400/30 bg-amber-400/10",
    danger: "border-rose-500/30 bg-rose-500/10",
  }[tone];

  return (
    <div className={cn("rounded-3xl border p-5 transition hover:-translate-y-0.5", toneClass)}>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function AdminShell({ session, onLogout }) {
  const [section, setSection] = useState(() => getStoredSection());
  const [inventoryPage, setInventoryPage] = useState(() => getStoredInventoryPage());
  const [inventoryFilters, setInventoryFilters] = useState(() => getStoredInventoryFilters());
  const queryClient = useQueryClient();
  const [savingCardId, setSavingCardId] = useState(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isDeletingCards, setIsDeletingCards] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [isClearingOrders, setIsClearingOrders] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [isExportingOrders, setIsExportingOrders] = useState(false);
  const [savingShippingOrderId, setSavingShippingOrderId] = useState(null);
  const [completedOrderActionKey, setCompletedOrderActionKey] = useState(null);
  const [completedShippingOrderId, setCompletedShippingOrderId] = useState(null);
  const [whatsappSavedToken, setWhatsappSavedToken] = useState(0);
  const [catalogSyncToken, setCatalogSyncToken] = useState(0);
  const [operationNotice, setOperationNotice] = useState(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [isMobileHeaderCompact, setIsMobileHeaderCompact] = useState(false);
  const [isMobileCompactMenuOpen, setIsMobileCompactMenuOpen] = useState(false);
  const clearedLegacyCacheRef = useRef(false);

  useEffect(() => {
    if (clearedLegacyCacheRef.current) {
      return;
    }

    clearedLegacyCacheRef.current = true;

    try {
      window.localStorage.removeItem("duelvault_admin_query_cache_v2");
      window.localStorage.removeItem("duelvault_admin_query_cache_v3");
      window.localStorage.removeItem("duelvault_admin_shell_state_v1");
      window.localStorage.removeItem("duelvault_admin_shell_state_v2");
    } catch {}
  }, []);

  useEffect(() => {
    return scheduleIdleTask(() => {
      void Promise.allSettled([
        OrdersView.preload?.(),
        UsersView.preload?.(),
      ]);
    });
  }, []);

  useEffect(() => {
    return scheduleIdleTask(() => {
      void warmAdminCache(queryClient, session.admin.id);
    });
  }, [queryClient, session.admin.id]);

  useEffect(() => {
    syncSectionPath(section, { replace: !getSectionFromPath(window.location.pathname) });
    window.localStorage.setItem(LAST_SECTION_KEY, section);
    recordAdminEvent("section-view", { section });
  }, [section]);

  useEffect(() => {
    writeAdminShellState((current) => ({
      ...current,
      inventoryPage,
      inventoryFilters,
    }));
  }, [inventoryFilters, inventoryPage]);

  useEffect(() => {
    let frameId = null;

    const persistScroll = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }

      writeAdminShellState((current) => ({
        ...current,
        scrollPositions: {
          ...(current.scrollPositions || {}),
          [section]: window.scrollY,
        },
      }));
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(persistScroll);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      persistScroll();
    };
  }, [section]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: getStoredScrollTop(section), behavior: "auto" });
    });
  }, [section]);

  useEffect(() => {
    const handlePopState = () => {
      setSection(getSectionFromPath(window.location.pathname) || "dashboard");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const pulseSuccess = (setter, value) => {
    setter(value);
    window.setTimeout(() => {
      setter((current) => (current === value ? null : current));
    }, 1600);
  };

  const publishNotice = (tone, message) => {
    const nextNotice = {
      id: Date.now(),
      tone,
      message,
    };

    setOperationNotice(nextNotice);
    if (tone !== "error") {
      window.setTimeout(() => {
        setOperationNotice((current) => (current?.id === nextNotice.id ? null : current));
      }, 2200);
    }
  };

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      publishNotice("info", "Conexión restablecida. El panel puede volver a sincronizar cambios.");
    };
    const goOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");

    const updateCompactState = () => {
      if (!mediaQuery.matches) {
        setIsMobileHeaderCompact(false);
        return;
      }

      setIsMobileHeaderCompact(window.scrollY > 72);
    };

    updateCompactState();
    window.addEventListener("scroll", updateCompactState, { passive: true });
    mediaQuery.addEventListener?.("change", updateCompactState);

    return () => {
      window.removeEventListener("scroll", updateCompactState);
      mediaQuery.removeEventListener?.("change", updateCompactState);
    };
  }, []);

  useEffect(() => {
    if (!isMobileHeaderCompact) {
      setIsMobileCompactMenuOpen(false);
    }
  }, [isMobileHeaderCompact]);

  useEffect(() => {
    if (!isMobileCompactMenuOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMobileCompactMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileCompactMenuOpen]);

  const sectionRequirements = SECTION_REQUIREMENTS[section] || SECTION_REQUIREMENTS.dashboard;

  const handleSectionIntent = (nextSection) => {
    if (nextSection === "inventory") {
      void InventoryView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["inventory-cards", session.admin.id, 1, DEFAULT_INVENTORY_FILTERS.search, DEFAULT_INVENTORY_FILTERS.rarity, DEFAULT_INVENTORY_FILTERS.cardType, DEFAULT_INVENTORY_FILTERS.stockStatus, DEFAULT_INVENTORY_FILTERS.visibility],
        queryFn: () => getInventoryCards({ page: 1, pageSize: 100, ...DEFAULT_INVENTORY_FILTERS }),
        staleTime: 1000 * 15,
      });
      return;
    }

    if (nextSection === "home") {
      void HomeMerchandisingView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["cards", session.admin.id],
        queryFn: getCards,
        staleTime: 1000 * 30,
      });
      return;
    }

    if (nextSection === "custom") {
      void CustomContentView.preload?.();
      void Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: ["custom-categories", session.admin.id],
          queryFn: getCustomCategories,
          staleTime: 1000 * 30,
        }),
        queryClient.prefetchQuery({
          queryKey: ["custom-products", session.admin.id],
          queryFn: getCustomProducts,
          staleTime: 1000 * 30,
        }),
      ]);
      return;
    }

    if (nextSection === "analytics") {
      void AnalyticsView.preload?.();
      return;
    }

    if (nextSection === "orders") {
      void OrdersView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["orders", session.admin.id],
        queryFn: getOrders,
        staleTime: 1000 * 15,
      });
      return;
    }

    if (nextSection === "whatsapp") {
      void WhatsappSettingsView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["whatsapp-settings", session.admin.id],
        queryFn: getWhatsappSettings,
        staleTime: 1000 * 30,
      });
      return;
    }

    if (nextSection === "users") {
      void UsersView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["users", session.admin.id],
        queryFn: getUsers,
        staleTime: 1000 * 30,
      });
    }
  };

  const handleSectionChange = (nextSection) => {
    const flow = startAdminFlow("navigate-admin-section", {
      from: section,
      to: nextSection,
    });
    setIsMobileCompactMenuOpen(false);
    handleSectionIntent(nextSection);
    syncSectionPath(nextSection);
    setSection(nextSection);
    flow.finish({ status: "ok" });
  };

  const dashboardQueryKey = ["dashboard", session.admin.id];
  const cardsQueryKey = ["cards", session.admin.id];
  const ordersQueryKey = ["orders", session.admin.id];
  const usersQueryKey = ["users", session.admin.id];
  const whatsappSettingsQueryKey = ["whatsapp-settings", session.admin.id];
  const contactRequestsQueryKey = ["contact-requests", session.admin.id];
  const customCategoriesQueryKey = ["custom-categories", session.admin.id];
  const customProductsQueryKey = ["custom-products", session.admin.id];
  const inventoryCardsQueryKey = ["inventory-cards", session.admin.id, inventoryPage, inventoryFilters.search, inventoryFilters.rarity, inventoryFilters.cardType, inventoryFilters.stockStatus, inventoryFilters.visibility];

  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: getDashboard,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.dashboard),
    ...getCachedQueryOptions(queryClient, dashboardQueryKey),
  });
  const cardsQuery = useQuery({
    queryKey: cardsQueryKey,
    queryFn: getCards,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.cards),
    ...getCachedQueryOptions(queryClient, cardsQueryKey),
  });
  const inventoryCardsQuery = useQuery({
    queryKey: inventoryCardsQueryKey,
    queryFn: () => getInventoryCards({ page: inventoryPage, pageSize: 100, ...inventoryFilters }),
    placeholderData: (previousData) => previousData ?? queryClient.getQueryData(inventoryCardsQueryKey),
    staleTime: 1000 * 60 * 3,
    refetchOnReconnect: true,
    enabled: Boolean(sectionRequirements.inventoryCards),
    ...getCachedQueryOptions(queryClient, inventoryCardsQueryKey),
  });
  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    queryFn: getOrders,
    staleTime: 1000 * 60 * 3,
    enabled: Boolean(sectionRequirements.orders),
    ...getCachedQueryOptions(queryClient, ordersQueryKey),
  });
  const usersQuery = useQuery({
    queryKey: usersQueryKey,
    queryFn: getUsers,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.users),
    ...getCachedQueryOptions(queryClient, usersQueryKey),
  });
  const whatsappSettingsQuery = useQuery({
    queryKey: whatsappSettingsQueryKey,
    queryFn: getWhatsappSettings,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.whatsapp),
    ...getCachedQueryOptions(queryClient, whatsappSettingsQueryKey),
  });
  const contactRequestsQuery = useQuery({
    queryKey: contactRequestsQueryKey,
    queryFn: getContactRequests,
    staleTime: 1000 * 60 * 3,
    enabled: Boolean(sectionRequirements.whatsapp),
    ...getCachedQueryOptions(queryClient, contactRequestsQueryKey),
  });
  const customCategoriesQuery = useQuery({
    queryKey: customCategoriesQueryKey,
    queryFn: getCustomCategories,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.custom),
    ...getCachedQueryOptions(queryClient, customCategoriesQueryKey),
  });
  const customProductsQuery = useQuery({
    queryKey: customProductsQueryKey,
    queryFn: getCustomProducts,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.custom),
    ...getCachedQueryOptions(queryClient, customProductsQueryKey),
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ cardId, updates, expectedUpdatedAt }) => updateCard(
      cardId,
      createMutationPayload(updates, {
        resourceType: "card",
        action: "update",
        resourceId: cardId,
        expectedUpdatedAt,
      })
    ),
    onMutate: async ({ cardId, updates }) => {
      setSavingCardId(cardId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardsQueryKey }),
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
      ]);

      const previousCards = queryClient.getQueryData(cardsQueryKey);
      const previousInventory = queryClient.getQueriesData({ queryKey: ["inventory-cards", session.admin.id] });

      queryClient.setQueryData(cardsQueryKey, (current) => updateCardsResponse(current, (card) => (card.id === cardId ? applyCardUpdates(card, updates) : card)));
      queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === cardId ? applyCardUpdates(card, updates) : card)));

      return { previousCards, previousInventory };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(cardsQueryKey, context?.previousCards);
      restoreQuerySnapshots(queryClient, context?.previousInventory);
      publishNotice("error", `Carta #${variables.cardId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (data, variables) => {
      const updatedCard = data?.card;
      if (!updatedCard) {
        return;
      }

      queryClient.setQueryData(cardsQueryKey, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
      queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
      persistAdminQueryCacheNow();
      publishNotice("success", `Carta #${variables.cardId} actualizada.`);
    },
    onSettled: () => {
      setSavingCardId(null);
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });

  const bulkUpdateCardsMutation = useMutation({
    mutationFn: ({ selection, updates }) => updateCardsBulk(createSelectionPayload(
      selection,
      "bulk-cards",
      buildCardSelectionResources(selection, [cards, inventoryCardsQuery.data?.cards])
    ), {
      ...updates,
      mutation_id: generateClientMutationId("bulk-cards-update"),
    }),
    onMutate: async ({ selection, updates }) => {
      setIsBulkSaving(true);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardsQueryKey }),
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
      ]);

      const selectedIds = Array.isArray(selection) ? selection : Array.isArray(selection?.ids) ? selection.ids : [];
      const idsToUpdate = new Set(selectedIds);
      const previousCards = queryClient.getQueryData(cardsQueryKey);
      const previousInventory = queryClient.getQueriesData({ queryKey: ["inventory-cards", session.admin.id] });

      if (idsToUpdate.size > 0) {
        queryClient.setQueryData(cardsQueryKey, (current) => updateCardsResponse(current, (card) => (idsToUpdate.has(card.id) ? applyCardUpdates(card, updates) : card)));
        queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (idsToUpdate.has(card.id) ? applyCardUpdates(card, updates) : card)));
      }

      return { previousCards, previousInventory };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(cardsQueryKey, context?.previousCards);
      restoreQuerySnapshots(queryClient, context?.previousInventory);
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: (data) => {
      const successCount = Number(data?.success?.length || 0);
      const failedCount = Number(data?.failed?.length || 0);
      const conflictCount = Number(data?.conflicts?.length || 0);

      if (failedCount || conflictCount) {
        publishNotice("info", `Inventario actualizado parcialmente: ${successCount} ok, ${conflictCount} en conflicto, ${failedCount} fallidas.`);
        return;
      }

      if (successCount) {
        publishNotice("success", `Se actualizaron ${successCount} cartas.`);
      }
    },
    onSettled: () => {
      setIsBulkSaving(false);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]);
    },
  });

  const deleteCardsMutation = useMutation({
    mutationFn: (selection) => deleteCards(createSelectionPayload(
      selection,
      "delete-cards",
      buildCardSelectionResources(selection, [cards, inventoryCardsQuery.data?.cards])
    )),
    onMutate: async (selection) => {
      setIsDeletingCards(true);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardsQueryKey }),
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
      ]);

      const selectedIds = Array.isArray(selection) ? selection : Array.isArray(selection?.ids) ? selection.ids : [];
      const idsToRemove = new Set(selectedIds);
      const previousCards = queryClient.getQueryData(cardsQueryKey);
      const previousInventory = queryClient.getQueriesData({ queryKey: ["inventory-cards", session.admin.id] });

      if (idsToRemove.size > 0) {
        queryClient.setQueryData(cardsQueryKey, (current) => removeCardsFromResponse(current, idsToRemove));
        queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => removeCardsFromResponse(current, idsToRemove));
      }

      return { previousCards, previousInventory };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(cardsQueryKey, context?.previousCards);
      restoreQuerySnapshots(queryClient, context?.previousInventory);
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: (data) => {
      const deletedCount = Number(data?.deletedCardIds?.length || 0);
      const hiddenCount = Number(data?.hiddenCardIds?.length || 0);
      const failedCount = Number(data?.failed?.length || 0);
      const conflictCount = Number(data?.conflicts?.length || 0);

      if (failedCount || conflictCount) {
        publishNotice("info", `Inventario procesado parcialmente: ${deletedCount} eliminadas, ${hiddenCount} ocultadas, ${conflictCount} en conflicto, ${failedCount} fallidas.`);
        return;
      }

      publishNotice("success", `Inventario actualizado: ${deletedCount} eliminadas y ${hiddenCount} ocultadas.`);
    },
    onSettled: () => {
      setIsDeletingCards(false);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, status, expectedUpdatedAt }) => updateOrderStatus(
      orderId,
      createMutationPayload(
        { status },
        {
          resourceType: "order",
          action: `status-${status}`,
          resourceId: orderId,
          expectedUpdatedAt,
        }
      )
    ),
    onMutate: async ({ orderId, status }) => {
      setUpdatingOrderId(orderId);
      await queryClient.cancelQueries({ queryKey: ordersQueryKey });

      const previousOrders = queryClient.getQueryData(ordersQueryKey);
      queryClient.setQueryData(ordersQueryKey, (current) => updateOrdersResponse(current, (order) => (order.id === orderId ? { ...order, status } : order)));

      return { previousOrders };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(ordersQueryKey, context?.previousOrders);
      publishNotice("error", `Pedido #${variables.orderId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (_data, variables) => {
      pulseSuccess(setCompletedOrderActionKey, `${variables.orderId}:${variables.status}`);
      publishNotice("success", `Pedido #${variables.orderId} actualizado a ${variables.status}.`);
    },
    onSettled: () => {
      setUpdatingOrderId(null);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
      ]);
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: ({ orderId, expectedUpdatedAt }) => deleteOrder(
      orderId,
      createMutationPayload({}, {
        resourceType: "order",
        action: "delete",
        resourceId: orderId,
        expectedUpdatedAt,
      })
    ),
    onMutate: async ({ orderId }) => {
      setDeletingOrderId(orderId);
      await queryClient.cancelQueries({ queryKey: ordersQueryKey });

      const previousOrders = queryClient.getQueryData(ordersQueryKey);
      queryClient.setQueryData(ordersQueryKey, (current) => removeOrdersFromResponse(current, (order) => order.id === orderId));

      return { previousOrders };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(ordersQueryKey, context?.previousOrders);
      publishNotice("error", `Pedido #${variables.orderId}: ${getReadableMutationError(error)}`);
    },
    onSettled: () => {
      setDeletingOrderId(null);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
      ]);
    },
  });

  const clearOrdersMutation = useMutation({
    mutationFn: () => clearOrders(createMutationPayload({}, { resourceType: "orders", action: "clear" })),
    onMutate: async () => {
      setIsClearingOrders(true);
      await queryClient.cancelQueries({ queryKey: ordersQueryKey });

      const previousOrders = queryClient.getQueryData(ordersQueryKey);
      queryClient.setQueryData(ordersQueryKey, (current) => (current ? { ...current, orders: [] } : current));

      return { previousOrders };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(ordersQueryKey, context?.previousOrders);
      publishNotice("error", getReadableMutationError(error));
    },
    onSettled: () => {
      setIsClearingOrders(false);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
      ]);
    },
  });

  const exportOrdersMutation = useMutation({
    mutationFn: exportOrdersWorkbook,
    onMutate: () => setIsExportingOrders(true),
    onSettled: () => setIsExportingOrders(false),
  });

  const updateOrderShippingMutation = useMutation({
    mutationFn: ({ orderId, payload, expectedUpdatedAt }) => updateOrderShipping(
      orderId,
      createMutationPayload(payload, {
        resourceType: "order",
        action: "shipping",
        resourceId: orderId,
        expectedUpdatedAt,
      })
    ),
    onMutate: async ({ orderId, payload }) => {
      setSavingShippingOrderId(orderId);
      await queryClient.cancelQueries({ queryKey: ordersQueryKey });

      const previousOrders = queryClient.getQueryData(ordersQueryKey);
      queryClient.setQueryData(ordersQueryKey, (current) => updateOrdersResponse(current, (order) => (order.id === orderId ? {
        ...order,
        tracking_code: payload.tracking_code,
        tracking_visible_to_user: payload.tracking_visible_to_user,
      } : order)));

      return { previousOrders };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(ordersQueryKey, context?.previousOrders);
      publishNotice("error", `Tracking de pedido #${variables.orderId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (_data, variables) => {
      pulseSuccess(setCompletedShippingOrderId, variables.orderId);
      publishNotice("success", `Tracking guardado para pedido #${variables.orderId}.`);
    },
    onSettled: () => {
      setSavingShippingOrderId(null);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]);
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ userId, role, expectedUpdatedAt, overrideConflict = false }) => updateUserRole(
      userId,
      createMutationPayload(
        {
          role,
          ...(overrideConflict ? { override_conflict: true } : {}),
        },
        {
          resourceType: "user",
          action: `role-${role}`,
          resourceId: userId,
          expectedUpdatedAt,
        }
      )
    ),
    onMutate: async ({ userId, role }) => {
      setUpdatingUserId(userId);
      await queryClient.cancelQueries({ queryKey: usersQueryKey });

      const previousUsers = queryClient.getQueryData(usersQueryKey);
      queryClient.setQueryData(usersQueryKey, (current) => updateUsersResponse(current, (user) => (user.id === userId ? { ...user, role } : user)));

      return { previousUsers };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(usersQueryKey, context?.previousUsers);

      if (!variables.overrideConflict && isConflictError(error) && error?.details?.can_override_conflict) {
        const shouldOverride = window.confirm(`El usuario #${variables.userId} cambió en otra sesión. ¿Querés forzar el rol ${userRoleLabel[variables.role] || variables.role} con el estado actual?`);
        if (shouldOverride) {
          updateUserRoleMutation.mutate({
            userId: variables.userId,
            role: variables.role,
            overrideConflict: true,
            expectedUpdatedAt: error?.details?.current_updated_at || getResourceUpdatedAt(error?.details?.current_resource),
          });
          return;
        }
      }

      publishNotice("error", `Usuario #${variables.userId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (_data, variables) => {
      publishNotice("success", `Rol actualizado para usuario #${variables.userId}.`);
    },
    onSettled: () => {
      setUpdatingUserId(null);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]);
    },
  });

  const updateWhatsappSettingsMutation = useMutation({
    mutationFn: (payload) => updateWhatsappSettings(createMutationPayload(payload, { resourceType: "whatsapp", action: "settings" })),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: whatsappSettingsQueryKey });

      const previousSettings = queryClient.getQueryData(whatsappSettingsQueryKey);
      queryClient.setQueryData(whatsappSettingsQueryKey, (current) => (current ? {
        ...current,
        settings: {
          ...(current.settings || {}),
          support_whatsapp_number: payload.support_whatsapp_number,
          support_email: payload.support_email,
        },
      } : current));

      return { previousSettings };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(whatsappSettingsQueryKey, context?.previousSettings);
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-settings", session.admin.id] });
      const token = Date.now();
      setWhatsappSavedToken(token);
      publishNotice("success", "Canales de contacto actualizados.");
      window.setTimeout(() => {
        setWhatsappSavedToken((current) => (current === token ? 0 : current));
      }, 1600);
    },
  });

  const updateContactRequestStatusMutation = useMutation({
    mutationFn: ({ contactRequestId, expectedUpdatedAt, ...payload }) => updateContactRequestStatus(
      contactRequestId,
      createMutationPayload(payload, {
        resourceType: "contact-request",
        action: payload.status || "notes",
        resourceId: contactRequestId,
        expectedUpdatedAt,
      })
    ),
    onMutate: async ({ contactRequestId, ...payload }) => {
      await queryClient.cancelQueries({ queryKey: contactRequestsQueryKey });

      const previousContactRequests = queryClient.getQueryData(contactRequestsQueryKey);
      queryClient.setQueryData(contactRequestsQueryKey, (current) => updateContactRequestsResponse(current, (contactRequest) => (
        contactRequest.id === contactRequestId
          ? {
              ...contactRequest,
              ...(payload.status ? { status: String(payload.status).toLowerCase() } : {}),
              ...(payload.admin_notes !== undefined ? { admin_notes: payload.admin_notes } : {}),
              ...(payload.response_message !== undefined ? { response_message: payload.response_message } : {}),
            }
          : contactRequest
      )));

      return { previousContactRequests };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(contactRequestsQueryKey, context?.previousContactRequests);
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: async (_data, variables) => {
      publishNotice("success", `Consulta #${variables.contactRequestId} actualizada.`);
      await queryClient.invalidateQueries({ queryKey: ["contact-requests", session.admin.id] });
    },
  });

  const syncCatalogMutation = useMutation({
    mutationFn: () => syncCatalogToScope(createMutationPayload({}, { resourceType: "catalog", action: "sync" })),
    onError: (error) => {
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: async () => {
      const token = Date.now();
      setCatalogSyncToken(token);
      publishNotice("success", "Catálogo sincronizado correctamente.");
      window.setTimeout(() => {
        setCatalogSyncToken((current) => (current === token ? 0 : current));
      }, 2000);

      setInventoryPage(1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", session.admin.id] }),
      ]);
    },
  });

  const categoryMutation = useMutation({
    mutationFn: ({ mode, categoryId, payload }) => {
      const nextPayload = createMutationPayload(payload, {
        resourceType: "custom-category",
        action: mode,
        resourceId: categoryId,
      });
      return mode === "update" ? updateCustomCategory(categoryId, nextPayload) : createCustomCategory(nextPayload);
    },
    onError: (error) => {
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: async () => {
      publishNotice("success", "Categoría custom guardada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["custom-categories", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["custom-products", session.admin.id] }),
      ]);
    },
  });

  const productMutation = useMutation({
    mutationFn: ({ mode, productId, payload }) => {
      const nextPayload = createMutationPayload(payload, {
        resourceType: "custom-product",
        action: mode,
        resourceId: productId,
      });
      return mode === "update" ? updateCustomProduct(productId, nextPayload) : createCustomProduct(nextPayload);
    },
    onError: (error) => {
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: async () => {
      publishNotice("success", "Publicación custom guardada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["custom-products", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["custom-categories", session.admin.id] }),
      ]);
    },
  });

  if (section === "dashboard" && (dashboardQuery.isLoading && !dashboardQuery.data || ordersQuery.isLoading && !ordersQuery.data || usersQuery.isLoading && !usersQuery.data || cardsQuery.isLoading && !cardsQuery.data)) {
    return <AdminLoadingShell />;
  }

  if (section === "dashboard" && ((dashboardQuery.error && !dashboardQuery.data) || (ordersQuery.error && !ordersQuery.data) || (usersQuery.error && !usersQuery.data) || (cardsQuery.error && !cardsQuery.data))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="glass rounded-3xl border border-red-500/30 p-8 text-center">
          <p className="text-lg font-semibold text-red-200">{dashboardQuery.error?.message || ordersQuery.error?.message || usersQuery.error?.message || cardsQuery.error?.message}</p>
        </div>
      </div>
    );
  }

  const dashboard = dashboardQuery.data || {
    metrics: {
      totalRevenue: 0,
      totalOrders: 0,
      totalProducts: 0,
      totalCustomers: 0,
      activeStaffCount: 0,
      avgOrderValue: 0,
      pendingPaymentCount: 0,
      lowStockCount: "--",
      outOfStockCount: "--",
    },
    analytics: {
      statuses: {},
      zones: [],
      daily: [],
      usersByDay: [],
    },
    recentOrders: [],
    topSellingCards: [],
    topCustomers: [],
    recentUsers: [],
  };
  const cards = cardsQuery.data?.cards || [];
  const orders = ordersQuery.data?.orders || [];
  const users = usersQuery.data?.users || [];
  const whatsappSettings = whatsappSettingsQuery.data?.settings || null;
  const contactRequests = contactRequestsQuery.data?.contact_requests || [];
  const contactRequestsSummary = contactRequestsQuery.data?.summary || null;
  const customCategories = customCategoriesQuery.data?.categories || [];
  const customCategoryTree = customCategoriesQuery.data?.tree || [];
  const customProducts = customProductsQuery.data?.products || [];
  const isAdmin = session.admin.role === "ADMIN";
  const currentSectionMeta = SECTION_META[section] || SECTION_META.dashboard;
  const currentSectionLabel = sections.find((entry) => entry.key === section)?.label || currentSectionMeta.title;
  const renderSection = () => {
    if (section === "dashboard") {
      return (
        <DashboardView
          dashboard={dashboard}
          orders={orders}
          users={users}
          cards={cards}
          admin={session.admin}
          canCancelOrders={isAdmin}
          updatingOrderId={updatingOrderId}
          completedOrderActionKey={completedOrderActionKey}
          onNavigateSection={handleSectionChange}
          onNavigateSectionIntent={handleSectionIntent}
          onStatusChange={(orderId, status) => updateOrderMutation.mutate({
            orderId,
            status,
            expectedUpdatedAt: getResourceUpdatedAt(orders.find((order) => order.id === orderId)),
          })}
        />
      );
    }

    if (section === "inventory") {
      if (inventoryCardsQuery.isLoading && !inventoryCardsQuery.data) {
        return <SectionLoadingPanel />;
      }

      if (inventoryCardsQuery.error) {
        return <SectionErrorPanel message={inventoryCardsQuery.error.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <InventoryView
            cardsPage={inventoryCardsQuery.data}
            page={inventoryPage}
            filters={inventoryFilters}
            onFiltersChange={(nextFilters) => {
              setInventoryPage(1);
              setInventoryFilters((current) => ({ ...current, ...nextFilters }));
            }}
            onPageChange={setInventoryPage}
            onSyncCatalog={() => syncCatalogMutation.mutate()}
            syncMutation={syncCatalogMutation}
            catalogSyncToken={catalogSyncToken}
            isInventoryRefreshing={inventoryCardsQuery.isFetching && !inventoryCardsQuery.isLoading}
            onRefresh={() => inventoryCardsQuery.refetch()}
            savingCardId={savingCardId}
            isBulkSaving={isBulkSaving}
            isDeletingCards={isDeletingCards}
            canEditInventory={isAdmin}
            onBulkUpdate={(selection, updates) => bulkUpdateCardsMutation.mutateAsync({ selection, updates })}
            onDeleteCards={(selection) => deleteCardsMutation.mutateAsync(selection)}
            onSave={(cardId, draft) => updateCardMutation.mutateAsync({
              cardId,
              expectedUpdatedAt: getResourceUpdatedAt(findCardSnapshot(cardId, inventoryCardsQuery.data?.cards, cards)),
              updates: {
                price: Number(draft.price),
                stock: Number(draft.stock),
                low_stock_threshold: Number(draft.low_stock_threshold),
                is_visible: Boolean(draft.is_visible),
                is_featured: Boolean(draft.is_featured),
              },
            })}
          />
        </Suspense>
      );
    }

    if (section === "home") {
      if (cardsQuery.isLoading && !cardsQuery.data) {
        return <SectionLoadingPanel />;
      }

      if (cardsQuery.error) {
        return <SectionErrorPanel message={cardsQuery.error.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <HomeMerchandisingView
            cards={cards}
            savingCardId={savingCardId}
            isBulkSaving={isBulkSaving}
            canEditHome={isAdmin}
            onBulkUpdate={(selection, updates) => bulkUpdateCardsMutation.mutate({ selection, updates })}
            onSave={(cardId, draft) => updateCardMutation.mutate({
              cardId,
              expectedUpdatedAt: getResourceUpdatedAt(cards.find((card) => card.id === cardId)),
              updates: {
                is_featured: Boolean(draft.is_featured),
                is_new_arrival: Boolean(draft.is_new_arrival),
              },
            })}
          />
        </Suspense>
      );
    }

    if (section === "custom") {
      if ((customCategoriesQuery.isLoading && !customCategoriesQuery.data) || (customProductsQuery.isLoading && !customProductsQuery.data)) {
        return <SectionLoadingPanel />;
      }

      if (customCategoriesQuery.error || customProductsQuery.error) {
        return <SectionErrorPanel message={(customCategoriesQuery.error || customProductsQuery.error)?.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <CustomContentView
            categories={customCategories}
            categoryTree={customCategoryTree}
            products={customProducts}
            categoryMutation={categoryMutation}
            productMutation={productMutation}
            canEditCustom={isAdmin}
          />
        </Suspense>
      );
    }

    if (section === "analytics") {
      if (dashboardQuery.isLoading && !dashboardQuery.data) {
        return <SectionLoadingPanel />;
      }

      if (dashboardQuery.error) {
        return <SectionErrorPanel message={dashboardQuery.error.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <AnalyticsView analytics={dashboard.analytics} topSellingCards={dashboard.topSellingCards} />
        </Suspense>
      );
    }

    if (section === "orders") {
      if (ordersQuery.isLoading && !ordersQuery.data) {
        return <SectionLoadingPanel />;
      }

      if (ordersQuery.error) {
        return <SectionErrorPanel message={ordersQuery.error.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <OrdersView
            orders={orders}
            updatingOrderId={updatingOrderId}
            completedOrderActionKey={completedOrderActionKey}
            savingShippingOrderId={savingShippingOrderId}
            completedShippingOrderId={completedShippingOrderId}
            deletingOrderId={deletingOrderId}
            isClearingOrders={isClearingOrders}
            isExportingOrders={isExportingOrders}
            canCancelOrders={isAdmin}
            canDeleteOrders={isAdmin}
            onExportOrders={() => exportOrdersMutation.mutate()}
            onClearOrders={() => clearOrdersMutation.mutate()}
            onDeleteOrder={(orderId) => deleteOrderMutation.mutate({
              orderId,
              expectedUpdatedAt: getResourceUpdatedAt(orders.find((order) => order.id === orderId)),
            })}
            onStatusChange={(orderId, status) => updateOrderMutation.mutate({
              orderId,
              status,
              expectedUpdatedAt: getResourceUpdatedAt(orders.find((order) => order.id === orderId)),
            })}
            onShippingSave={(orderId, payload) => updateOrderShippingMutation.mutate({
              orderId,
              payload,
              expectedUpdatedAt: getResourceUpdatedAt(orders.find((order) => order.id === orderId)),
            })}
          />
        </Suspense>
      );
    }

    if (section === "whatsapp") {
      if ((whatsappSettingsQuery.isLoading && !whatsappSettingsQuery.data) || (contactRequestsQuery.isLoading && !contactRequestsQuery.data)) {
        return <SectionLoadingPanel />;
      }

      if (whatsappSettingsQuery.error || contactRequestsQuery.error) {
        return <SectionErrorPanel message={(whatsappSettingsQuery.error || contactRequestsQuery.error)?.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <WhatsappSettingsView
            settings={whatsappSettings}
            contactRequests={contactRequests}
            contactRequestsSummary={contactRequestsSummary}
            canEditWhatsapp={isAdmin}
            settingsMutation={updateWhatsappSettingsMutation}
            updateContactRequestStatusMutation={updateContactRequestStatusMutation}
            whatsappSavedToken={whatsappSavedToken}
          />
        </Suspense>
      );
    }

    if (section === "users") {
      if (usersQuery.isLoading && !usersQuery.data) {
        return <SectionLoadingPanel />;
      }

      if (usersQuery.error) {
        return <SectionErrorPanel message={usersQuery.error.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <UsersView
            users={users}
            canEditRoles={isAdmin}
            updatingUserId={updatingUserId}
            onRoleChange={(userId, role) => updateUserRoleMutation.mutate({
              userId,
              role,
              expectedUpdatedAt: getResourceUpdatedAt(users.find((user) => user.id === userId)),
            })}
          />
        </Suspense>
      );
    }

    return null;
  };

  return (
    <div className="w-full min-h-screen px-3 py-3 sm:px-4 md:px-6 md:py-4">
      <div className="grid w-full gap-4 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden glass self-start rounded-[24px] border border-white/10 p-4 lg:sticky lg:top-4 lg:block lg:h-fit">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-300">DuelVault</p>
                <h1 className="mt-2 text-xl font-black text-white">Santuario Admin</h1>
                <p className="mt-2 text-sm text-slate-400">Operación diaria, inventario y control comercial.</p>
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            <p className="font-semibold text-white">{session.admin.email}</p>
            <p className="mt-1 inline-flex rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-amber-300">{userRoleLabel(session.admin.role)}</p>
          </div>

          <SectionNav section={section} onSectionChange={handleSectionChange} onSectionIntent={handleSectionIntent} className="space-y-2" />

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">Radar rápido</p>
            <div className="mt-3 space-y-2 text-sm">
              <p>Stock bajo: <span className="font-semibold text-amber-200">{dashboard.metrics.lowStockCount}</span></p>
              <p>Agotadas: <span className="font-semibold text-rose-200">{dashboard.metrics.outOfStockCount}</span></p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </aside>

        <main className={cn("min-w-0", section === "dashboard" ? "space-y-4 sm:space-y-4 lg:flex lg:h-[calc(100vh-1.5rem)] lg:flex-col lg:overflow-hidden" : "space-y-4 sm:space-y-6")}>
          <OperationNotice notice={operationNotice} online={isOnline} />

          <div className="sticky top-0 z-30 -mx-1 space-y-4 bg-[linear-gradient(180deg,rgba(5,8,22,0.98)_0%,rgba(5,8,22,0.95)_86%,rgba(5,8,22,0)_100%)] px-1 pb-4 pt-1 backdrop-blur-md lg:static lg:mx-0 lg:space-y-0 lg:bg-none lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none">
            <div className="lg:hidden">
              {isMobileHeaderCompact ? (
                <div className="glass rounded-[22px] border border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300">DuelVault</p>
                      <div className="mt-1 flex items-center gap-2 text-white">
                        <h1 className="truncate text-lg font-black">Santuario Admin</h1>
                        <span className="text-slate-500">|</span>
                        <span className="truncate text-sm font-semibold text-slate-300">{currentSectionLabel}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMobileCompactMenuOpen((current) => !current)}
                        aria-expanded={isMobileCompactMenuOpen}
                        aria-label="Abrir menú lateral del panel"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]"
                      >
                        <span className="max-w-[92px] truncate">Menú</span>
                        <Menu className="h-4 w-4" />
                      </button>
                      <button
                        onClick={onLogout}
                        className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Salir</span>
                      </button>
                    </div>
                  </div>

                </div>
              ) : (
                <>
                  <div className="glass rounded-[28px] border border-white/10 p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-amber-300">DuelVault</p>
                        <h1 className="mt-2 text-2xl font-black text-white">Santuario Admin</h1>
                        <p className="mt-1 text-sm text-slate-400">{session.admin.email}</p>
                      </div>
                      <button
                        onClick={onLogout}
                        className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                      >
                        <LogOut className="h-4 w-4" />
                        Salir
                      </button>
                    </div>
                    <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/30 p-3">
                      <MobileSectionNav section={section} onSectionChange={handleSectionChange} onSectionIntent={handleSectionIntent} />
                    </div>
                  </div>

                  <header className="glass rounded-[32px] border border-white/10 p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Sistema local</p>
                        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{currentSectionMeta.title}</h2>
                        <p className="mt-2 max-w-2xl text-sm text-slate-400">{currentSectionMeta.description}</p>
                      </div>
                      <div className="flex items-center gap-3 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        🟢 API + Supabase activos
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] xl:hidden">
                      <StatCard title="⚠️ Stock bajo" value={dashboard.metrics.lowStockCount} tone="warn" />
                      <StatCard title="☠️ Agotadas" value={dashboard.metrics.outOfStockCount} tone="danger" />
                    </div>
                    {!isAdmin ? (
                      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        Tu cuenta STAFF tiene acceso de consulta y actualización operativa de pedidos, pero no puede hacer ediciones críticas de inventario ni cancelaciones.
                      </div>
                    ) : null}
                  </header>
                </>
              )}
            </div>

            <header className={cn("glass rounded-[32px] border border-white/10 p-4 sm:p-6", section === "dashboard" ? "hidden lg:block" : "hidden lg:block") }>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Sistema local</p>
                  <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{currentSectionMeta.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-400">{currentSectionMeta.description}</p>
                </div>
                <div className="flex items-center gap-3 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  🟢 API + Supabase activos
                </div>
              </div>
              {!isAdmin ? (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Tu cuenta STAFF tiene acceso de consulta y actualización operativa de pedidos, pero no puede hacer ediciones críticas de inventario ni cancelaciones.
                </div>
              ) : null}
            </header>
          </div>

          {section === "dashboard" ? <div className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">{renderSection()}</div> : renderSection()}
        </main>
      </div>
    </div>
  );
}

            {isMobileHeaderCompact && isMobileCompactMenuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Cerrar menú lateral"
                  onClick={() => setIsMobileCompactMenuOpen(false)}
                  className="fixed inset-0 z-40 bg-slate-950/72 backdrop-blur-sm lg:hidden"
                />
                <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,360px)] flex-col border-l border-white/10 bg-[#090d1f]/96 shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden">
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300">Navegación</p>
                      <h2 className="mt-2 text-xl font-black text-white">Santuario Admin</h2>
                      <p className="mt-2 truncate text-sm text-slate-400">{session.admin.email}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Cerrar menú"
                      onClick={() => setIsMobileCompactMenuOpen(false)}
                      className="rounded-2xl border border-white/10 p-3 text-slate-300 transition duration-200 hover:bg-white/[0.06]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Vista activa</p>
                      <p className="mt-2 text-lg font-bold text-white">{currentSectionMeta.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{currentSectionMeta.description}</p>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                      <MobileSectionNav section={section} onSectionChange={handleSectionChange} onSectionIntent={handleSectionIntent} />
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                      <p className="font-semibold text-white">Radar rápido</p>
                      <div className="mt-3 space-y-2">
                        <p>Stock bajo: <span className="font-semibold text-amber-200">{dashboard.metrics.lowStockCount}</span></p>
                        <p>Agotadas: <span className="font-semibold text-rose-200">{dashboard.metrics.outOfStockCount}</span></p>
                      </div>
                    </div>
                  </div>
                </aside>
              </>
            ) : null}

export default function App() {
  const [session, setSession] = useState(() => getBootstrapSession() || getStoredSession());
  const [didBootstrapRefresh, setDidBootstrapRefresh] = useState(false);

  useEffect(() => {
    if (!session?.refreshToken || didBootstrapRefresh) {
      return undefined;
    }

    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      refreshAdminSession()
        .then((nextSession) => {
          if (!cancelled && nextSession) {
            setSession(nextSession);
          }
        })
        .catch(() => {
          // Keep the restored session alive on boot. If the token is truly invalid,
          // the authenticated requests will handle logout through the normal refresh flow.
        });
      if (!cancelled) {
        setDidBootstrapRefresh(true);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [didBootstrapRefresh, session?.refreshToken]);

  if (!session) {
    return <LoginScreen onLoggedIn={setSession} />;
  }

  return (
    <AdminShell
      session={session}
      onLogout={async () => {
        clearStoredSession();
        clearPersistedAdminQueryCache();
        const storefrontLoginUrl = await resolveStorefrontLoginUrl();
        window.location.assign(storefrontLoginUrl);
      }}
    />
  );
}
