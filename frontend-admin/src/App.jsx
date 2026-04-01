import { Suspense, lazy, memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  Star,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  addCardToInventory,
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
  searchAdminCards,
  getOrders,
  getWhatsappSettings,
  getUsers,
  getStoredSession,
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
import { markDataReady, reportBootMetrics } from "./lib/perf";
import { userRoleLabel } from "./views/shared";
import { useAdminRealtimeEvents } from "./hooks/useAdminRealtimeEvents";

function lazyWithPreload(factory) {
  const Component = lazy(factory);
  Component.preload = factory;
  return Component;
}

const DashboardView = lazyWithPreload(() => import("./views/DashboardView"));
const AnalyticsView = lazyWithPreload(() => import("./views/AnalyticsView"));
const CustomContentView = lazyWithPreload(() => import("./views/CustomContentView"));
const HomeMerchandisingView = lazyWithPreload(() => import("./views/HomeMerchandisingView"));
const InventoryView = lazyWithPreload(() => import("./views/InventoryView"));
const LoginScreen = lazyWithPreload(() => import("./views/LoginScreen"));
const OrdersView = lazyWithPreload(() => import("./views/OrdersView"));
const UsersView = lazyWithPreload(() => import("./views/UsersView"));
const WhatsappSettingsView = lazyWithPreload(() => import("./views/WhatsappSettingsView"));

const _LAZY_SECTION_MAP = {
  dashboard: DashboardView,
  analytics: AnalyticsView,
  custom: CustomContentView,
  home: HomeMerchandisingView,
  inventory: InventoryView,
  orders: OrdersView,
  whatsapp: WhatsappSettingsView,
  users: UsersView,
};

(function preloadInitialSection() {
  if (typeof window === "undefined") {
    return;
  }

  const fromPath = Object.entries({
    "/dashboard": "dashboard",
    "/inventory": "inventory",
    "/home": "home",
    "/custom": "custom",
    "/analytics": "analytics",
    "/orders": "orders",
    "/contacto": "whatsapp",
    "/users": "users",
  }).find(([path]) => window.location.pathname.replace(/\/+$/, "") === path)?.[1];

  const stored = fromPath || (() => {
    try {
      return window.localStorage.getItem("duelvault_admin_last_section") || "dashboard";
    } catch {
      return "dashboard";
    }
  })();

  void _LAZY_SECTION_MAP[stored]?.preload?.();
})();

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
const ADMIN_STOREFRONT_URL_KEY = "duelvault_admin_storefront_url";
const DEFAULT_INVENTORY_FILTERS = {
  search: "",
  rarity: "all",
  cardType: "all",
  stockStatus: "all",
  visibility: "all",
};
const DEFAULT_INVENTORY_MODE = "stock";
const DEFAULT_ORDERS_FILTERS = {
  search: "",
  status: "all",
};
const DEFAULT_USERS_FILTERS = {
  search: "",
  role: "all",
};
const HOME_PAGE_SIZE = 24;

const EMPTY_ARRAY = [];
const EMPTY_DASHBOARD = {
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
const EMPTY_ORDERS_SUMMARY = { totalOrders: 0, pendingCount: 0, countedCount: 0, filteredTotal: 0 };
const EMPTY_USERS_SUMMARY = { totalUsers: 0, customerCount: 0, staffCount: 0, adminCount: 0, filteredTotal: 0 };
const COUNTED_ORDER_STATUSES = new Set(["paid", "shipped", "completed"]);
const USER_ROLE_SUMMARY_KEYS = {
  user: "customerCount",
  staff: "staffCount",
  admin: "adminCount",
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
  dashboard: { dashboard: true },
  analytics: { dashboard: true },
  inventory: { dashboard: true, inventoryCards: true },
  home: { dashboard: true, homeCards: true },
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

function normalizeAbsoluteUrl(value) {
  const normalizedValue = typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
  if (!normalizedValue) {
    return "";
  }

  return /^https?:\/\//i.test(normalizedValue) ? normalizedValue : "";
}

function getStoredStorefrontUrl() {
  if (!canUseStorage()) {
    return "";
  }

  return normalizeAbsoluteUrl(window.localStorage.getItem(ADMIN_STOREFRONT_URL_KEY));
}

function setStoredStorefrontUrl(value) {
  if (!canUseStorage()) {
    return;
  }

  const normalizedValue = normalizeAbsoluteUrl(value);
  if (normalizedValue) {
    window.localStorage.setItem(ADMIN_STOREFRONT_URL_KEY, normalizedValue);
    return;
  }

  window.localStorage.removeItem(ADMIN_STOREFRONT_URL_KEY);
}

function clearStoredAdminUiState() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(LAST_SECTION_KEY);
  window.localStorage.removeItem(ADMIN_SHELL_STATE_KEY);
  window.localStorage.removeItem("duelvault_admin_dashboard_view_state_v2");
}

let _shellStateRawCache = null;
let _shellStateParsedCache = null;
let _activeAdminId = null;

function setActiveAdminId(adminId) {
  if (_activeAdminId === adminId) {
    return;
  }

  _activeAdminId = adminId;
  _shellStateRawCache = null;
  _shellStateParsedCache = null;
}

function readAdminShellState() {
  try {
    if (!canUseStorage()) {
      return {};
    }

    const rawState = window.localStorage.getItem(ADMIN_SHELL_STATE_KEY);
    if (!rawState) {
      return {};
    }

    if (rawState === _shellStateRawCache && _shellStateParsedCache !== null) {
      return _shellStateParsedCache;
    }

    const parsedState = JSON.parse(rawState);
    const result = parsedState && typeof parsedState === "object" && !Array.isArray(parsedState) ? parsedState : {};

    if (_activeAdminId && result._adminId && result._adminId !== _activeAdminId) {
      _shellStateRawCache = null;
      _shellStateParsedCache = null;
      try { window.localStorage.removeItem(ADMIN_SHELL_STATE_KEY); } catch {}
      return {};
    }

    _shellStateRawCache = rawState;
    _shellStateParsedCache = result;
    return result;
  } catch {
    _shellStateRawCache = null;
    _shellStateParsedCache = null;
    return {};
  }
}

function writeAdminShellState(updater) {
  const currentState = readAdminShellState();
  const candidateState = typeof updater === "function" ? updater(currentState) : { ...currentState, ...updater };
  const nextState = candidateState && typeof candidateState === "object" && !Array.isArray(candidateState)
    ? candidateState
    : currentState;

  if (_activeAdminId) {
    nextState._adminId = _activeAdminId;
  }

  try {
    if (!canUseStorage()) {
      return nextState;
    }

    const raw = JSON.stringify(nextState);
    window.localStorage.setItem(ADMIN_SHELL_STATE_KEY, raw);
    _shellStateRawCache = raw;
    _shellStateParsedCache = nextState;
  } catch {
    return nextState;
  }

  return nextState;
}

function getStoredInventoryPage() {
  const page = Number(readAdminShellState().inventoryPage);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getStoredInventoryMode() {
  const mode = String(readAdminShellState().inventoryMode || DEFAULT_INVENTORY_MODE).trim().toLowerCase();
  return mode === "all" ? "all" : DEFAULT_INVENTORY_MODE;
}

function getStoredInventoryFilters() {
  return {
    ...DEFAULT_INVENTORY_FILTERS,
    ...(readAdminShellState().inventoryFilters || {}),
  };
}

function getStoredOrdersPage() {
  const page = Number(readAdminShellState().ordersPage);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getStoredOrdersFilters() {
  return {
    ...DEFAULT_ORDERS_FILTERS,
    ...(readAdminShellState().ordersFilters || {}),
  };
}

function getStoredUsersPage() {
  const page = Number(readAdminShellState().usersPage);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getStoredUsersFilters() {
  return {
    ...DEFAULT_USERS_FILTERS,
    ...(readAdminShellState().usersFilters || {}),
  };
}

function getStoredScrollTop(section) {
  const top = Number(readAdminShellState().scrollPositions?.[section]);
  return Number.isFinite(top) && top > 0 ? top : 0;
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

function getCardEntityQueryKey(cardId) {
  return ["card", Number(cardId)];
}

function getOrderEntityQueryKey(orderId) {
  return ["order", Number(orderId)];
}

function getUserEntityQueryKey(userId) {
  return ["user", Number(userId)];
}

function mergeEntityQueryData(current, entityField, updates, { createIfMissing = true } = {}) {
  if (!updates || typeof updates !== "object") {
    return current;
  }

  if (typeof current === "undefined" || current === null) {
    return createIfMissing ? { [entityField]: updates } : current;
  }

  if (Array.isArray(current) || typeof current !== "object") {
    return current;
  }

  if (Object.prototype.hasOwnProperty.call(current, entityField)) {
    const currentEntity = current[entityField];
    return {
      ...current,
      [entityField]: currentEntity && typeof currentEntity === "object" && !Array.isArray(currentEntity)
        ? { ...currentEntity, ...updates }
        : updates,
    };
  }

  return {
    ...current,
    ...updates,
  };
}

function mergeEntityCache(queryClient, queryKey, entityField, updates, options) {
  queryClient.setQueryData(queryKey, (current) => mergeEntityQueryData(current, entityField, updates, options));
}

function restoreExactQuerySnapshot(queryClient, queryKey, snapshot) {
  if (typeof snapshot === "undefined") {
    queryClient.removeQueries({ queryKey, exact: true });
    return;
  }

  queryClient.setQueryData(queryKey, snapshot);
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

  const removedCount = response.orders.length - nextOrders.length;
  const pagination = response.pagination
    ? {
      ...response.pagination,
      total: Math.max(0, (response.pagination.total || 0) - removedCount),
    }
    : response.pagination;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / Math.max(pagination.pageSize || 1, 1))) : 1;

  return {
    ...response,
    orders: nextOrders,
    ...(pagination ? {
      pagination: {
        ...pagination,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage: pagination.page > 1,
      },
    } : {}),
    ...(response.summary ? {
      summary: {
        ...response.summary,
        totalOrders: Math.max(0, (response.summary.totalOrders || 0) - removedCount),
        filteredTotal: Math.max(0, (response.summary.filteredTotal || 0) - removedCount),
      },
    } : {}),
  };
}

function mergeOrderIntoResponse(response, queryKey, orderId, updates) {
  const nextResponse = updateOrdersResponse(response, (order) => (order.id === orderId ? { ...order, ...updates } : order));
  const statusFilter = String(queryKey?.[4] || "all").toLowerCase();

  if (statusFilter === "all") {
    return nextResponse;
  }

  return removeOrdersFromResponse(nextResponse, (order) => order.id === orderId && String(order.status || "").toLowerCase() !== statusFilter);
}

function applyOrderStatusToResponse(response, queryKey, orderId, nextStatus, previousStatus) {
  let nextResponse = mergeOrderIntoResponse(response, queryKey, orderId, { status: nextStatus });
  if (!nextResponse?.summary) {
    return nextResponse;
  }

  const normalizedNextStatus = String(nextStatus || "").toLowerCase();
  const normalizedPreviousStatus = String(previousStatus || "").toLowerCase();
  if (!normalizedNextStatus || normalizedNextStatus === normalizedPreviousStatus) {
    return nextResponse;
  }

  nextResponse = {
    ...nextResponse,
    summary: {
      ...nextResponse.summary,
      ...(typeof nextResponse.summary.pendingCount === "number"
        ? {
            pendingCount: Math.max(
              0,
              nextResponse.summary.pendingCount
                + (normalizedNextStatus === "pending_payment" ? 1 : 0)
                - (normalizedPreviousStatus === "pending_payment" ? 1 : 0)
            ),
          }
        : {}),
      ...(typeof nextResponse.summary.countedCount === "number"
        ? {
            countedCount: Math.max(
              0,
              nextResponse.summary.countedCount
                + (COUNTED_ORDER_STATUSES.has(normalizedNextStatus) ? 1 : 0)
                - (COUNTED_ORDER_STATUSES.has(normalizedPreviousStatus) ? 1 : 0)
            ),
          }
        : {}),
    },
  };

  return nextResponse;
}

function removeContactRequestsFromResponse(response, predicate) {
  if (!response || !Array.isArray(response.contact_requests)) {
    return response;
  }

  const nextRequests = response.contact_requests.filter((contactRequest) => !predicate(contactRequest));
  if (nextRequests.length === response.contact_requests.length) {
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

function removeUsersFromResponse(response, predicate) {
  if (!response || !Array.isArray(response.users)) {
    return response;
  }

  const nextUsers = response.users.filter((user) => !predicate(user));
  if (nextUsers.length === response.users.length) {
    return response;
  }

  const removedCount = response.users.length - nextUsers.length;
  const pagination = response.pagination
    ? {
        ...response.pagination,
        total: Math.max(0, (response.pagination.total || 0) - removedCount),
      }
    : response.pagination;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / Math.max(pagination.pageSize || 1, 1))) : 1;

  return {
    ...response,
    users: nextUsers,
    ...(pagination
      ? {
          pagination: {
            ...pagination,
            totalPages,
            hasNextPage: pagination.page < totalPages,
            hasPreviousPage: pagination.page > 1,
          },
        }
      : {}),
    ...(response.summary
      ? {
          summary: {
            ...response.summary,
            filteredTotal: Math.max(0, (response.summary.filteredTotal || 0) - removedCount),
          },
        }
      : {}),
  };
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

function mergeUserIntoResponse(response, queryKey, userId, updates) {
  const nextResponse = updateUsersResponse(response, (user) => (user.id === userId ? { ...user, ...updates } : user));
  const roleFilter = String(queryKey?.[4] || "all").toLowerCase();

  if (roleFilter === "all") {
    return nextResponse;
  }

  return removeUsersFromResponse(nextResponse, (user) => user.id === userId && String(user.role || "").toLowerCase() !== roleFilter);
}

function applyUserRoleToResponse(response, queryKey, userId, nextRole, previousRole) {
  let nextResponse = mergeUserIntoResponse(response, queryKey, userId, { role: nextRole });
  if (!nextResponse?.summary) {
    return nextResponse;
  }

  const normalizedNextRole = String(nextRole || "").toLowerCase();
  const normalizedPreviousRole = String(previousRole || "").toLowerCase();
  if (!normalizedNextRole || normalizedNextRole === normalizedPreviousRole) {
    return nextResponse;
  }

  const previousSummaryKey = USER_ROLE_SUMMARY_KEYS[normalizedPreviousRole];
  const nextSummaryKey = USER_ROLE_SUMMARY_KEYS[normalizedNextRole];
  nextResponse = {
    ...nextResponse,
    summary: {
      ...nextResponse.summary,
      ...(previousSummaryKey && typeof nextResponse.summary[previousSummaryKey] === "number"
        ? {
            [previousSummaryKey]: Math.max(0, nextResponse.summary[previousSummaryKey] - 1),
          }
        : {}),
      ...(nextSummaryKey && typeof nextResponse.summary[nextSummaryKey] === "number"
        ? {
            [nextSummaryKey]: nextResponse.summary[nextSummaryKey] + 1,
          }
        : {}),
    },
  };

  return nextResponse;
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



function SkeletonBlock({ className = "h-20" }) {
  return <div className={cn("animate-pulse rounded-3xl border border-white/5 bg-white/[0.04]", className)} />;
}

const SectionNav = memo(function SectionNav({ section, onSectionChange, onSectionIntent, className = "" }) {
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
});

const MobileSectionNav = memo(function MobileSectionNav({ section, onSectionChange, onSectionIntent }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Navegación</p>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-slate-300">{sections.find((entry) => entry.key === section)?.label || "Panel"}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {sections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSectionChange(key)}
            onTouchStart={() => onSectionIntent?.(key)}
            className={cn(
              "flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition duration-200",
              section === key
                ? "border-amber-400/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(245,158,11,0.05))] text-amber-100 shadow-[0_12px_30px_rgba(245,158,11,0.12)]"
                : "border-white/5 bg-white/[0.02] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]"
            )}
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", section === key ? "border-amber-400/20 bg-amber-300/10 text-amber-200" : "border-white/10 bg-slate-950/55 text-slate-400")}>
              <Icon className="h-4 w-4 shrink-0" />
            </span>
            <span className="truncate leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

function getBootstrapSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const bootstrap = params.get("bootstrap");
  const returnTo = normalizeAbsoluteUrl(params.get("return_to"));
  if (returnTo) {
    setStoredStorefrontUrl(returnTo);
    params.delete("return_to");
  }
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
  const configuredStorefrontUrl = normalizeAbsoluteUrl(import.meta.env.VITE_STOREFRONT_URL || "") || getStoredStorefrontUrl();

  if (configuredStorefrontUrl) {
    return `${configuredStorefrontUrl}/auth?mode=login`;
  }

  const fallbackNextStorePort = 3000;
  const fallbackLegacyStorePort = 5173;

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "https://proyecto-fullstack-production-8fe1.up.railway.app";
    const response = await fetch(`${apiBase}/api/health`);
    const payload = await response.json().catch(() => ({}));
    const storePort = payload?.runtime?.next_store_port || payload?.runtime?.store_port || fallbackNextStorePort;
    return `${window.location.protocol}//${window.location.hostname}:${storePort}/auth?mode=login`;
  } catch {
    return `${window.location.protocol}//${window.location.hostname}:${fallbackNextStorePort || fallbackLegacyStorePort}/auth?mode=login`;
  }
}



function SectionLoadingPanel() {
  return (
    <div className="glass min-h-[60vh] rounded-[32px] border border-white/10 p-6">
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

const OperationNotice = memo(function OperationNotice({ notice, online }) {
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
});

function AdminShell({ session, onLogout }) {
  setActiveAdminId(session.admin.id);

  const [section, setSection] = useState(() => getStoredSection());
  const [inventoryMode, setInventoryMode] = useState(() => getStoredInventoryMode());
  const [inventoryPage, setInventoryPage] = useState(() => getStoredInventoryPage());
  const [inventoryFilters, setInventoryFilters] = useState(() => getStoredInventoryFilters());
  const [homePage, setHomePage] = useState(1);
  const [homeSearch, setHomeSearch] = useState("");
  const [ordersPage, setOrdersPage] = useState(() => getStoredOrdersPage());
  const [ordersFilters, setOrdersFilters] = useState(() => getStoredOrdersFilters());
  const [usersPage, setUsersPage] = useState(() => getStoredUsersPage());
  const [usersFilters, setUsersFilters] = useState(() => getStoredUsersFilters());
  const queryClient = useQueryClient();
  const [savingCardId, setSavingCardId] = useState(null);
  const [addingInventoryCardId, setAddingInventoryCardId] = useState(null);
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
  const deferredHomeSearch = useDeferredValue(homeSearch);
  const deferredOrdersSearch = useDeferredValue(ordersFilters.search);
  const deferredUsersSearch = useDeferredValue(usersFilters.search);

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
    syncSectionPath(section, { replace: !getSectionFromPath(window.location.pathname) });
    window.localStorage.setItem(LAST_SECTION_KEY, section);
    recordAdminEvent("section-view", { section });
  }, [section]);

  useEffect(() => {
    writeAdminShellState((current) => ({
      ...current,
      inventoryMode,
      inventoryPage,
      inventoryFilters,
      ordersPage,
      ordersFilters,
      usersPage,
      usersFilters,
    }));
  }, [inventoryFilters, inventoryMode, inventoryPage, ordersFilters, ordersPage, usersFilters, usersPage]);

  useEffect(() => {
    let timeoutId = null;

    const persistScroll = () => {
      timeoutId = null;
      writeAdminShellState((current) => ({
        ...current,
        scrollPositions: {
          ...(current.scrollPositions || {}),
          [section]: window.scrollY,
        },
      }));
    };

    const handleScroll = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(persistScroll, 400);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
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
    setIsMobileHeaderCompact(false);
  }, []);

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
  const preloadedSectionsRef = useRef(new Set());

  const handleSectionIntent = (nextSection) => {
    if (nextSection === section || preloadedSectionsRef.current.has(nextSection)) {
      return;
    }

    preloadedSectionsRef.current.add(nextSection);

    if (nextSection === "dashboard") {
      void DashboardView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["dashboard", session.admin.id],
        queryFn: getDashboard,
        staleTime: 1000 * 60 * 5,
      });
      return;
    }

    if (nextSection === "inventory") {
      void InventoryView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["inventory-cards", session.admin.id, 1, DEFAULT_INVENTORY_FILTERS.search, DEFAULT_INVENTORY_FILTERS.rarity, DEFAULT_INVENTORY_FILTERS.cardType, DEFAULT_INVENTORY_FILTERS.stockStatus, DEFAULT_INVENTORY_FILTERS.visibility],
        queryFn: () => getInventoryCards({ page: 1, pageSize: 100, ...DEFAULT_INVENTORY_FILTERS }),
        staleTime: 1000 * 60 * 5,
      });
      return;
    }

    if (nextSection === "home") {
      void HomeMerchandisingView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["home-cards", session.admin.id, homePage, HOME_PAGE_SIZE, deferredHomeSearch],
        queryFn: () => getCards({
          page: homePage,
          pageSize: HOME_PAGE_SIZE,
          mode: "stock",
          visibility: "visible",
          search: deferredHomeSearch,
        }),
        staleTime: 1000 * 60 * 5,
      });
      return;
    }

    if (nextSection === "custom") {
      void CustomContentView.preload?.();
      void Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: ["custom-categories", session.admin.id],
          queryFn: getCustomCategories,
          staleTime: 1000 * 60 * 5,
        }),
        queryClient.prefetchQuery({
          queryKey: ["custom-products", session.admin.id],
          queryFn: getCustomProducts,
          staleTime: 1000 * 60 * 5,
        }),
      ]);
      return;
    }

    if (nextSection === "analytics") {
      void AnalyticsView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["dashboard", session.admin.id],
        queryFn: getDashboard,
        staleTime: 1000 * 60 * 5,
      });
      return;
    }

    if (nextSection === "orders") {
      void OrdersView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["orders", session.admin.id, ordersPage, deferredOrdersSearch, ordersFilters.status],
        queryFn: () => getOrders({
          page: ordersPage,
          pageSize: 10,
          search: deferredOrdersSearch,
          status: ordersFilters.status,
        }),
        staleTime: 1000 * 60 * 3,
      });
      return;
    }

    if (nextSection === "whatsapp") {
      void WhatsappSettingsView.preload?.();
      void Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: ["whatsapp-settings", session.admin.id],
          queryFn: getWhatsappSettings,
          staleTime: 1000 * 60 * 5,
        }),
        queryClient.prefetchQuery({
          queryKey: ["contact-requests", session.admin.id],
          queryFn: getContactRequests,
          staleTime: 1000 * 60 * 3,
        }),
      ]);
      return;
    }

    if (nextSection === "users") {
      void UsersView.preload?.();
      void queryClient.prefetchQuery({
        queryKey: ["users", session.admin.id, usersPage, deferredUsersSearch, usersFilters.role],
        queryFn: () => getUsers({
          page: usersPage,
          pageSize: 8,
          search: deferredUsersSearch,
          role: usersFilters.role,
        }),
        staleTime: 1000 * 60 * 5,
      });
    }
  };

  const handleSectionChange = (nextSection, options) => {
    const flow = startAdminFlow("navigate-admin-section", {
      from: section,
      to: nextSection,
    });
    setIsMobileCompactMenuOpen(false);
    preloadedSectionsRef.current.delete(nextSection);
    handleSectionIntent(nextSection);
    syncSectionPath(nextSection);
    if (nextSection === "orders" && options?.status) {
      setOrdersFilters((current) => ({ ...current, status: options.status }));
      setOrdersPage(1);
    }
    startTransition(() => setSection(nextSection));
    flow.finish({ status: "ok" });
  };

  const latestHandlersRef = useRef({});
  latestHandlersRef.current.sectionChange = handleSectionChange;
  latestHandlersRef.current.sectionIntent = handleSectionIntent;
  const stableSectionChange = useCallback((key, options) => latestHandlersRef.current.sectionChange(key, options), []);
  const stableSectionIntent = useCallback((key) => latestHandlersRef.current.sectionIntent(key), []);

  const dashboardQueryKey = ["dashboard", session.admin.id];
  const cardsQueryKey = ["cards", session.admin.id];
  const homeCardsQueryPrefix = ["home-cards", session.admin.id];
  const homeCardsQueryKey = ["home-cards", session.admin.id, homePage, HOME_PAGE_SIZE, deferredHomeSearch];
  const ordersQueryKey = ["orders", session.admin.id, ordersPage, deferredOrdersSearch, ordersFilters.status];
  const usersQueryKey = ["users", session.admin.id, usersPage, deferredUsersSearch, usersFilters.role];
  const whatsappSettingsQueryKey = ["whatsapp-settings", session.admin.id];
  const contactRequestsQueryKey = ["contact-requests", session.admin.id];
  const customCategoriesQueryKey = ["custom-categories", session.admin.id];
  const customProductsQueryKey = ["custom-products", session.admin.id];
  const inventoryCardsQueryKey = ["inventory-cards", session.admin.id, inventoryPage, inventoryFilters.search, inventoryFilters.rarity, inventoryFilters.cardType, inventoryFilters.stockStatus, inventoryFilters.visibility];
  const adminCatalogSearchQueryKey = ["admin-card-search", session.admin.id, inventoryPage, inventoryFilters.search, inventoryFilters.rarity, inventoryFilters.cardType, inventoryFilters.stockStatus, inventoryFilters.visibility];

  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: getDashboard,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.dashboard),
  });
  const cardsQuery = useQuery({
    queryKey: cardsQueryKey,
    queryFn: getCards,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.cards),
  });
  const homeCardsQuery = useQuery({
    queryKey: homeCardsQueryKey,
    queryFn: () => getCards({
      page: homePage,
      pageSize: HOME_PAGE_SIZE,
      mode: "stock",
      visibility: "visible",
      search: deferredHomeSearch,
    }),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 30,
    refetchOnReconnect: true,
    enabled: Boolean(sectionRequirements.homeCards),
  });
  const inventoryCardsQuery = useQuery({
    queryKey: inventoryCardsQueryKey,
    queryFn: () => getInventoryCards({ page: inventoryPage, pageSize: 100, ...inventoryFilters }),
    placeholderData: (previousData) => previousData ?? queryClient.getQueryData(inventoryCardsQueryKey),
    staleTime: 1000 * 60 * 5,
    refetchOnReconnect: true,
    enabled: Boolean(sectionRequirements.inventoryCards) && inventoryMode === "stock",
  });
  const adminCatalogSearchQuery = useQuery({
    queryKey: adminCatalogSearchQueryKey,
    queryFn: () => searchAdminCards({ page: inventoryPage, pageSize: 100, ...inventoryFilters }),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 30,
    refetchOnReconnect: true,
    enabled: Boolean(sectionRequirements.inventoryCards) && inventoryMode === "all" && Boolean(inventoryFilters.search.trim()),
  });
  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    queryFn: () => getOrders({
      page: ordersPage,
      pageSize: 10,
      search: deferredOrdersSearch,
      status: ordersFilters.status,
    }),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 3,
    enabled: Boolean(sectionRequirements.orders),
  });
  const usersQuery = useQuery({
    queryKey: usersQueryKey,
    queryFn: () => getUsers({
      page: usersPage,
      pageSize: 8,
      search: deferredUsersSearch,
      role: usersFilters.role,
    }),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.users),
  });
  const whatsappSettingsQuery = useQuery({
    queryKey: whatsappSettingsQueryKey,
    queryFn: getWhatsappSettings,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.whatsapp),
  });
  const contactRequestsQuery = useQuery({
    queryKey: contactRequestsQueryKey,
    queryFn: getContactRequests,
    staleTime: 1000 * 60 * 3,
    enabled: Boolean(sectionRequirements.whatsapp),
  });
  const customCategoriesQuery = useQuery({
    queryKey: customCategoriesQueryKey,
    queryFn: getCustomCategories,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.custom),
  });
  const customProductsQuery = useQuery({
    queryKey: customProductsQueryKey,
    queryFn: getCustomProducts,
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(sectionRequirements.custom),
  });

  const addInventoryCardMutation = useMutation({
    mutationFn: ({ cardId, quantity, expectedUpdatedAt }) => addCardToInventory(
      createMutationPayload(
        { cardId, quantity },
        {
          resourceType: "inventory",
          action: "add",
          resourceId: cardId,
          expectedUpdatedAt,
        }
      )
    ),
    onMutate: async ({ cardId }) => {
      setAddingInventoryCardId(cardId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: ["admin-card-search", session.admin.id] }),
      ]);
    },
    onError: (error, variables) => {
      publishNotice("error", `Carta #${variables.cardId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (data, variables) => {
      const updatedCard = data?.card;
      if (updatedCard) {
        queryClient.setQueriesData({ queryKey: ["cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
        queryClient.setQueriesData({ queryKey: homeCardsQueryPrefix }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
        queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
        queryClient.setQueriesData({ queryKey: ["admin-card-search", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
        mergeEntityCache(queryClient, getCardEntityQueryKey(variables.cardId), "card", updatedCard);
      }

      persistAdminQueryCacheNow();
      publishNotice("success", `Se agregaron ${data?.addedQuantity || variables.quantity} unidades a la carta #${variables.cardId}.`);
    },
    onSettled: (_data, _error, variables) => {
      setAddingInventoryCardId(null);
      const tasks = [
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ];
      if (variables?.cardId) {
        tasks.push(queryClient.invalidateQueries({ queryKey: getCardEntityQueryKey(variables.cardId), exact: true, refetchType: "active" }));
      }
      void Promise.allSettled(tasks);
    },
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
      const cardEntityQueryKey = getCardEntityQueryKey(cardId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: homeCardsQueryPrefix }),
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: ["admin-card-search", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: cardEntityQueryKey, exact: true }),
      ]);

      const previousCards = queryClient.getQueriesData({ queryKey: ["cards", session.admin.id] });
      const previousHomeCards = queryClient.getQueriesData({ queryKey: homeCardsQueryPrefix });
      const previousInventory = queryClient.getQueriesData({ queryKey: ["inventory-cards", session.admin.id] });
      const previousAdminSearch = queryClient.getQueriesData({ queryKey: ["admin-card-search", session.admin.id] });
      const previousCardDetail = queryClient.getQueryData(cardEntityQueryKey);

      queryClient.setQueriesData({ queryKey: ["cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === cardId ? applyCardUpdates(card, updates) : card)));
      queryClient.setQueriesData({ queryKey: homeCardsQueryPrefix }, (current) => updateCardsResponse(current, (card) => (card.id === cardId ? applyCardUpdates(card, updates) : card)));
      queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === cardId ? applyCardUpdates(card, updates) : card)));
      queryClient.setQueriesData({ queryKey: ["admin-card-search", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === cardId ? applyCardUpdates(card, updates) : card)));
      mergeEntityCache(queryClient, cardEntityQueryKey, "card", updates, { createIfMissing: false });

      return { previousCards, previousHomeCards, previousInventory, previousAdminSearch, previousCardDetail, cardEntityQueryKey };
    },
    onError: (error, variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousCards);
      restoreQuerySnapshots(queryClient, context?.previousHomeCards);
      restoreQuerySnapshots(queryClient, context?.previousInventory);
      restoreQuerySnapshots(queryClient, context?.previousAdminSearch);
      restoreExactQuerySnapshot(queryClient, context?.cardEntityQueryKey || getCardEntityQueryKey(variables.cardId), context?.previousCardDetail);
      publishNotice("error", `Carta #${variables.cardId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (data, variables) => {
      const updatedCard = data?.card;
      if (!updatedCard) {
        return;
      }

      queryClient.setQueriesData({ queryKey: ["cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
      queryClient.setQueriesData({ queryKey: homeCardsQueryPrefix }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
      queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
      queryClient.setQueriesData({ queryKey: ["admin-card-search", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (card.id === variables.cardId ? applyCardUpdates(card, updatedCard) : card)));
      mergeEntityCache(queryClient, getCardEntityQueryKey(variables.cardId), "card", updatedCard);
      persistAdminQueryCacheNow();
      publishNotice("success", `Carta #${variables.cardId} actualizada.`);
    },
    onSettled: (_data, _error, variables) => {
      setSavingCardId(null);
      const tasks = [
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ];
      if (variables?.cardId) {
        tasks.push(queryClient.invalidateQueries({ queryKey: getCardEntityQueryKey(variables.cardId), exact: true, refetchType: "active" }));
      }
      void Promise.allSettled(tasks);
    },
  });

  const bulkUpdateCardsMutation = useMutation({
    mutationFn: ({ selection, updates }) => updateCardsBulk(createSelectionPayload(
      selection,
      "bulk-cards",
      buildCardSelectionResources(selection, [homeCardsQuery.data?.cards, cards, inventoryCardsQuery.data?.cards, adminCatalogSearchQuery.data?.cards])
    ), {
      ...updates,
      mutation_id: generateClientMutationId("bulk-cards-update"),
    }),
    onMutate: async ({ selection, updates }) => {
      setIsBulkSaving(true);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: homeCardsQueryPrefix }),
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: ["admin-card-search", session.admin.id] }),
      ]);

      const selectedIds = Array.isArray(selection) ? selection : Array.isArray(selection?.ids) ? selection.ids : [];
      const idsToUpdate = new Set(selectedIds);
      const previousCards = queryClient.getQueriesData({ queryKey: ["cards", session.admin.id] });
      const previousHomeCards = queryClient.getQueriesData({ queryKey: homeCardsQueryPrefix });
      const previousInventory = queryClient.getQueriesData({ queryKey: ["inventory-cards", session.admin.id] });
      const previousAdminSearch = queryClient.getQueriesData({ queryKey: ["admin-card-search", session.admin.id] });

      if (idsToUpdate.size > 0) {
        queryClient.setQueriesData({ queryKey: ["cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (idsToUpdate.has(card.id) ? applyCardUpdates(card, updates) : card)));
        queryClient.setQueriesData({ queryKey: homeCardsQueryPrefix }, (current) => updateCardsResponse(current, (card) => (idsToUpdate.has(card.id) ? applyCardUpdates(card, updates) : card)));
        queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (idsToUpdate.has(card.id) ? applyCardUpdates(card, updates) : card)));
        queryClient.setQueriesData({ queryKey: ["admin-card-search", session.admin.id] }, (current) => updateCardsResponse(current, (card) => (idsToUpdate.has(card.id) ? applyCardUpdates(card, updates) : card)));
      }

      return { previousCards, previousHomeCards, previousInventory, previousAdminSearch };
    },
    onError: (error, _variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousCards);
      restoreQuerySnapshots(queryClient, context?.previousHomeCards);
      restoreQuerySnapshots(queryClient, context?.previousInventory);
      restoreQuerySnapshots(queryClient, context?.previousAdminSearch);
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: (data) => {
      const successCount = Number(data?.success?.length || 0);
      const failedCount = Number(data?.failed?.length || 0);
      const conflictCount = Number(data?.conflicts?.length || 0);

      // Reconcile cache with server-returned card data
      const updatedCards = data?.updatedCards;
      if (Array.isArray(updatedCards) && updatedCards.length > 0) {
        const serverCardsById = new Map(updatedCards.map((c) => [c.id, c]));
        const reconcile = (card) => {
          const serverCard = serverCardsById.get(card.id);
          return serverCard ? applyCardUpdates(card, serverCard) : card;
        };
        queryClient.setQueriesData({ queryKey: ["cards", session.admin.id] }, (current) => updateCardsResponse(current, reconcile));
        queryClient.setQueriesData({ queryKey: homeCardsQueryPrefix }, (current) => updateCardsResponse(current, reconcile));
        queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => updateCardsResponse(current, reconcile));
        queryClient.setQueriesData({ queryKey: ["admin-card-search", session.admin.id] }, (current) => updateCardsResponse(current, reconcile));
        persistAdminQueryCacheNow();
      }

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
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]);
    },
  });

  const deleteCardsMutation = useMutation({
    mutationFn: (selection) => deleteCards(createSelectionPayload(
      selection,
      "delete-cards",
      buildCardSelectionResources(selection, [homeCardsQuery.data?.cards, cards, inventoryCardsQuery.data?.cards, adminCatalogSearchQuery.data?.cards])
    )),
    onMutate: async (selection) => {
      setIsDeletingCards(true);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: homeCardsQueryPrefix }),
        queryClient.cancelQueries({ queryKey: ["inventory-cards", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: ["admin-card-search", session.admin.id] }),
      ]);

      const selectedIds = Array.isArray(selection) ? selection : Array.isArray(selection?.ids) ? selection.ids : [];
      const idsToRemove = new Set(selectedIds);
      const previousCards = queryClient.getQueriesData({ queryKey: ["cards", session.admin.id] });
      const previousHomeCards = queryClient.getQueriesData({ queryKey: homeCardsQueryPrefix });
      const previousInventory = queryClient.getQueriesData({ queryKey: ["inventory-cards", session.admin.id] });
      const previousAdminSearch = queryClient.getQueriesData({ queryKey: ["admin-card-search", session.admin.id] });

      if (idsToRemove.size > 0) {
        queryClient.setQueriesData({ queryKey: ["cards", session.admin.id] }, (current) => removeCardsFromResponse(current, idsToRemove));
        queryClient.setQueriesData({ queryKey: homeCardsQueryPrefix }, (current) => removeCardsFromResponse(current, idsToRemove));
        queryClient.setQueriesData({ queryKey: ["inventory-cards", session.admin.id] }, (current) => removeCardsFromResponse(current, idsToRemove));
        queryClient.setQueriesData({ queryKey: ["admin-card-search", session.admin.id] }, (current) => removeCardsFromResponse(current, idsToRemove));
      }

      return { previousCards, previousHomeCards, previousInventory, previousAdminSearch };
    },
    onError: (error, _variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousCards);
      restoreQuerySnapshots(queryClient, context?.previousHomeCards);
      restoreQuerySnapshots(queryClient, context?.previousInventory);
      restoreQuerySnapshots(queryClient, context?.previousAdminSearch);
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
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix }),
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
      const orderEntityQueryKey = getOrderEntityQueryKey(orderId);
      const previousOrder = ordersQuery.data?.orders?.find((order) => order.id === orderId) || null;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: orderEntityQueryKey, exact: true }),
      ]);

      const previousOrders = queryClient.getQueriesData({ queryKey: ["orders", session.admin.id] });
      const previousOrderDetail = queryClient.getQueryData(orderEntityQueryKey);
      for (const [queryKey] of previousOrders) {
        queryClient.setQueryData(queryKey, (current) => applyOrderStatusToResponse(current, queryKey, orderId, status, previousOrder?.status));
      }
      mergeEntityCache(queryClient, orderEntityQueryKey, "order", { status }, { createIfMissing: false });

      return { previousOrders, previousOrderDetail, orderEntityQueryKey };
    },
    onError: (error, variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousOrders);
      restoreExactQuerySnapshot(queryClient, context?.orderEntityQueryKey || getOrderEntityQueryKey(variables.orderId), context?.previousOrderDetail);
      publishNotice("error", `Pedido #${variables.orderId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (data, variables) => {
      const updatedOrder = data?.order;
      if (updatedOrder) {
        for (const [queryKey] of queryClient.getQueriesData({ queryKey: ["orders", session.admin.id] })) {
          queryClient.setQueryData(queryKey, (current) => mergeOrderIntoResponse(current, queryKey, variables.orderId, updatedOrder));
        }
        mergeEntityCache(queryClient, getOrderEntityQueryKey(variables.orderId), "order", updatedOrder);
      }

      pulseSuccess(setCompletedOrderActionKey, `${variables.orderId}:${variables.status}`);
      publishNotice("success", `Pedido #${variables.orderId} actualizado a ${variables.status}.`);
    },
    onSettled: (_data, _error, variables) => {
      setUpdatingOrderId(null);
      const tasks = [
        queryClient.invalidateQueries({ queryKey: ["orders", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKey, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ];
      if (variables?.orderId) {
        tasks.push(queryClient.invalidateQueries({ queryKey: getOrderEntityQueryKey(variables.orderId), exact: true, refetchType: "active" }));
      }
      void Promise.allSettled(tasks);
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
      const orderEntityQueryKey = getOrderEntityQueryKey(orderId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: orderEntityQueryKey, exact: true }),
      ]);

      const previousOrders = queryClient.getQueriesData({ queryKey: ["orders", session.admin.id] });
      const previousOrderDetail = queryClient.getQueryData(orderEntityQueryKey);
      for (const [queryKey] of previousOrders) {
        queryClient.setQueryData(queryKey, (current) => removeOrdersFromResponse(current, (order) => order.id === orderId));
      }
      queryClient.removeQueries({ queryKey: orderEntityQueryKey, exact: true });

      return { previousOrders, previousOrderDetail, orderEntityQueryKey };
    },
    onError: (error, variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousOrders);
      restoreExactQuerySnapshot(queryClient, context?.orderEntityQueryKey || getOrderEntityQueryKey(variables.orderId), context?.previousOrderDetail);
      publishNotice("error", `Pedido #${variables.orderId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.removeQueries({ queryKey: getOrderEntityQueryKey(variables.orderId), exact: true });
    },
    onSettled: (_data, _error, variables) => {
      setDeletingOrderId(null);
      const tasks = [
        queryClient.invalidateQueries({ queryKey: ["orders", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKey, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["inventory-cards", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ];
      if (variables?.orderId) {
        tasks.push(queryClient.invalidateQueries({ queryKey: getOrderEntityQueryKey(variables.orderId), exact: true, refetchType: "active" }));
      }
      void Promise.allSettled(tasks);
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
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix }),
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
      const orderEntityQueryKey = getOrderEntityQueryKey(orderId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: orderEntityQueryKey, exact: true }),
      ]);

      const previousOrders = queryClient.getQueriesData({ queryKey: ["orders", session.admin.id] });
      const previousOrderDetail = queryClient.getQueryData(orderEntityQueryKey);
      for (const [queryKey] of previousOrders) {
        queryClient.setQueryData(queryKey, (current) => mergeOrderIntoResponse(current, queryKey, orderId, {
          carrier: payload.carrier,
          tracking_code: payload.tracking_code,
          tracking_visible_to_user: payload.tracking_visible_to_user,
        }));
      }
      mergeEntityCache(queryClient, orderEntityQueryKey, "order", {
        carrier: payload.carrier,
        tracking_code: payload.tracking_code,
        tracking_visible_to_user: payload.tracking_visible_to_user,
      }, { createIfMissing: false });

      return { previousOrders, previousOrderDetail, orderEntityQueryKey };
    },
    onError: (error, variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousOrders);
      restoreExactQuerySnapshot(queryClient, context?.orderEntityQueryKey || getOrderEntityQueryKey(variables.orderId), context?.previousOrderDetail);
      publishNotice("error", `Tracking de pedido #${variables.orderId}: ${getReadableMutationError(error)}`);
    },
    onSuccess: (data, variables) => {
      const updatedOrder = data?.order;
      if (updatedOrder) {
        for (const [queryKey] of queryClient.getQueriesData({ queryKey: ["orders", session.admin.id] })) {
          queryClient.setQueryData(queryKey, (current) => mergeOrderIntoResponse(current, queryKey, variables.orderId, updatedOrder));
        }
        mergeEntityCache(queryClient, getOrderEntityQueryKey(variables.orderId), "order", updatedOrder);
      }

      pulseSuccess(setCompletedShippingOrderId, variables.orderId);
      publishNotice("success", `Tracking guardado para pedido #${variables.orderId}.`);
    },
    onSettled: (_data, _error, variables) => {
      setSavingShippingOrderId(null);
      const tasks = [];
      if (variables?.orderId) {
        tasks.push(queryClient.invalidateQueries({ queryKey: getOrderEntityQueryKey(variables.orderId), exact: true, refetchType: "active" }));
      }
      void Promise.allSettled(tasks);
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
      const userEntityQueryKey = getUserEntityQueryKey(userId);
      const previousUser = usersQuery.data?.users?.find((user) => user.id === userId) || null;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["users", session.admin.id] }),
        queryClient.cancelQueries({ queryKey: userEntityQueryKey, exact: true }),
      ]);

      const previousUsers = queryClient.getQueriesData({ queryKey: ["users", session.admin.id] });
      const previousUserDetail = queryClient.getQueryData(userEntityQueryKey);
      for (const [queryKey] of previousUsers) {
        queryClient.setQueryData(queryKey, (current) => applyUserRoleToResponse(current, queryKey, userId, role, previousUser?.role));
      }
      mergeEntityCache(queryClient, userEntityQueryKey, "user", { role }, { createIfMissing: false });

      return { previousUsers, previousUserDetail, userEntityQueryKey };
    },
    onError: (error, variables, context) => {
      restoreQuerySnapshots(queryClient, context?.previousUsers);
      restoreExactQuerySnapshot(queryClient, context?.userEntityQueryKey || getUserEntityQueryKey(variables.userId), context?.previousUserDetail);

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
    onSuccess: (data, variables) => {
      const updatedUser = data?.user;
      if (updatedUser) {
        for (const [queryKey] of queryClient.getQueriesData({ queryKey: ["users", session.admin.id] })) {
          queryClient.setQueryData(queryKey, (current) => mergeUserIntoResponse(current, queryKey, variables.userId, updatedUser));
        }
        mergeEntityCache(queryClient, getUserEntityQueryKey(variables.userId), "user", updatedUser);
      }

      publishNotice("success", `Rol actualizado para usuario #${variables.userId}.`);
    },
    onSettled: (_data, _error, variables) => {
      setUpdatingUserId(null);
      const tasks = [
        queryClient.invalidateQueries({ queryKey: ["users", session.admin.id], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ];
      if (variables?.userId) {
        tasks.push(queryClient.invalidateQueries({ queryKey: getUserEntityQueryKey(variables.userId), exact: true, refetchType: "active" }));
      }
      void Promise.allSettled(tasks);
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
      if (String(payload.status || "").toLowerCase() === "archived") {
        queryClient.setQueryData(contactRequestsQueryKey, (current) => removeContactRequestsFromResponse(current, (contactRequest) => contactRequest.id === contactRequestId));
      } else {
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
      }

      return { previousContactRequests };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(contactRequestsQueryKey, context?.previousContactRequests);
      publishNotice("error", getReadableMutationError(error));
    },
    onSuccess: async (_data, variables) => {
      const wasArchived = String(variables.status || "").toLowerCase() === "archived";
      publishNotice("success", wasArchived ? `Consulta #${variables.contactRequestId} archivada y removida.` : `Consulta #${variables.contactRequestId} actualizada.`);
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
        queryClient.invalidateQueries({ queryKey: ["admin-card-search", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: homeCardsQueryPrefix }),
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

  const hasDashboardData = Boolean(dashboardQuery.data);
  useEffect(() => {
    if (!hasDashboardData) {
      return;
    }

    markDataReady();
    requestAnimationFrame(() => reportBootMetrics());
  }, [hasDashboardData]);

  const dashboard = dashboardQuery.data || EMPTY_DASHBOARD;
  const dashboardRecentOrders = dashboard.recentOrders || EMPTY_ARRAY;
  const cards = cardsQuery.data?.cards || EMPTY_ARRAY;
  const homePageData = homeCardsQuery.data || {
    cards: [],
    total: 0,
    page: homePage,
    pageSize: HOME_PAGE_SIZE,
    totalPages: 1,
  };
  const homeCards = homePageData.cards || EMPTY_ARRAY;
  const homeIsLoading = homeCardsQuery.isLoading && !homeCardsQuery.data;
  const homeError = homeCardsQuery.error;
  const homeIsRefreshing = homeCardsQuery.isFetching && !homeCardsQuery.isLoading;
  const inventorySearchEnabled = inventoryMode === "all" && Boolean(inventoryFilters.search.trim());
  const inventoryPageData = inventoryMode === "all"
    ? (adminCatalogSearchQuery.data || {
        cards: [],
        total: 0,
        page: inventoryPage,
        pageSize: 100,
        totalPages: inventorySearchEnabled ? 1 : 0,
        filters: { rarities: [], cardTypes: [] },
      })
    : inventoryCardsQuery.data;
  const inventoryIsLoading = inventoryMode === "all"
    ? inventorySearchEnabled && adminCatalogSearchQuery.isLoading && !adminCatalogSearchQuery.data
    : inventoryCardsQuery.isLoading && !inventoryCardsQuery.data;
  const inventoryError = inventoryMode === "all" ? adminCatalogSearchQuery.error : inventoryCardsQuery.error;
  const inventoryIsRefreshing = inventoryMode === "all"
    ? adminCatalogSearchQuery.isFetching && !adminCatalogSearchQuery.isLoading
    : inventoryCardsQuery.isFetching && !inventoryCardsQuery.isLoading;
  const orders = ordersQuery.data?.orders || EMPTY_ARRAY;
  const ordersSummary = ordersQuery.data?.summary || EMPTY_ORDERS_SUMMARY;
  const ordersPagination = useMemo(() => ordersQuery.data?.pagination || { page: ordersPage, totalPages: 1 }, [ordersQuery.data?.pagination, ordersPage]);
  const users = usersQuery.data?.users || EMPTY_ARRAY;
  const usersSummary = usersQuery.data?.summary || EMPTY_USERS_SUMMARY;
  const usersPagination = useMemo(() => usersQuery.data?.pagination || { page: usersPage, totalPages: 1 }, [usersQuery.data?.pagination, usersPage]);
  const whatsappSettings = whatsappSettingsQuery.data?.settings || null;
  const contactRequests = contactRequestsQuery.data?.contact_requests || EMPTY_ARRAY;
  const contactRequestsSummary = contactRequestsQuery.data?.summary || null;
  const customCategories = customCategoriesQuery.data?.categories || EMPTY_ARRAY;
  const customCategoryTree = customCategoriesQuery.data?.tree || EMPTY_ARRAY;
  const customProducts = customProductsQuery.data?.products || EMPTY_ARRAY;
  const isAdmin = session.admin.role === "ADMIN";
  const currentSectionMeta = SECTION_META[section] || SECTION_META.dashboard;
  const currentSectionLabel = sections.find((entry) => entry.key === section)?.label || currentSectionMeta.title;
  const renderSection = () => {
    if (section === "dashboard") {
      if (dashboardQuery.isLoading && !dashboardQuery.data) {
        return <SectionLoadingPanel />;
      }

      if (dashboardQuery.error && !dashboardQuery.data) {
        return <SectionErrorPanel message={dashboardQuery.error?.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <DashboardView
            dashboard={dashboard}
            orders={orders}
            users={users}
            cards={cards}
            admin={session.admin}
            canCancelOrders={isAdmin}
            updatingOrderId={updatingOrderId}
            completedOrderActionKey={completedOrderActionKey}
            onNavigateSection={stableSectionChange}
            onNavigateSectionIntent={stableSectionIntent}
            onStatusChange={(orderId, status) => updateOrderMutation.mutate({
              orderId,
              status,
              expectedUpdatedAt: getResourceUpdatedAt(orders.find((order) => order.id === orderId) || dashboardRecentOrders.find((order) => order.id === orderId)),
            })}
          />
        </Suspense>
      );
    }

    if (section === "inventory") {
      if (inventoryIsLoading) {
        return <SectionLoadingPanel />;
      }

      if (inventoryError) {
        return <SectionErrorPanel message={inventoryError.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <InventoryView
            mode={inventoryMode}
            cardsPage={inventoryPageData}
            page={inventoryPage}
            filters={inventoryFilters}
            onModeChange={(nextMode) => {
              setInventoryMode(nextMode);
              setInventoryPage(1);
              setInventoryFilters((current) => (
                nextMode === "stock" && current.stockStatus === "out_of_stock"
                  ? { ...current, stockStatus: "all" }
                  : current
              ));
            }}
            onFiltersChange={(nextFilters) => {
              setInventoryPage(1);
              setInventoryFilters((current) => ({ ...current, ...nextFilters }));
            }}
            onPageChange={setInventoryPage}
            onSyncCatalog={() => syncCatalogMutation.mutate()}
            syncMutation={syncCatalogMutation}
            catalogSyncToken={catalogSyncToken}
            isInventoryRefreshing={inventoryIsRefreshing}
            isLoadingResults={inventoryIsLoading}
            onRefresh={() => (inventoryMode === "all" ? adminCatalogSearchQuery.refetch() : inventoryCardsQuery.refetch())}
            savingCardId={savingCardId}
            addingInventoryCardId={addingInventoryCardId}
            isBulkSaving={isBulkSaving}
            isDeletingCards={isDeletingCards}
            canEditInventory={isAdmin}
            onBulkUpdate={(selection, updates) => bulkUpdateCardsMutation.mutateAsync({ selection, updates })}
            onDeleteCards={(selection) => deleteCardsMutation.mutateAsync(selection)}
            onAddToInventory={(cardId, quantity, expectedUpdatedAt) => addInventoryCardMutation.mutateAsync({ cardId, quantity, expectedUpdatedAt })}
            onSave={(cardId, draft) => updateCardMutation.mutateAsync({
              cardId,
              expectedUpdatedAt: getResourceUpdatedAt(findCardSnapshot(cardId, inventoryPageData?.cards, inventoryCardsQuery.data?.cards, adminCatalogSearchQuery.data?.cards, cards)),
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
      if (homeIsLoading) {
        return <SectionLoadingPanel />;
      }

      if (homeError && !homeCardsQuery.data) {
        return <SectionErrorPanel message={homeError.message} />;
      }

      return (
        <Suspense fallback={<SectionLoadingPanel />}>
          <HomeMerchandisingView
            cardsPage={homePageData}
            search={homeSearch}
            isRefreshing={homeIsRefreshing}
            onSearchChange={(nextSearch) => {
              setHomeSearch(nextSearch);
              setHomePage(1);
            }}
            onPageChange={setHomePage}
            onRefresh={() => homeCardsQuery.refetch()}
            savingCardId={savingCardId}
            isBulkSaving={isBulkSaving}
            canEditHome={isAdmin}
            onBulkUpdate={(selection, updates) => bulkUpdateCardsMutation.mutate({ selection, updates })}
            onSave={(cardId, draft) => updateCardMutation.mutate({
              cardId,
              expectedUpdatedAt: getResourceUpdatedAt(findCardSnapshot(cardId, homeCards, inventoryPageData?.cards, inventoryCardsQuery.data?.cards, adminCatalogSearchQuery.data?.cards, cards)),
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
            summary={ordersSummary}
            pagination={ordersPagination}
            filters={ordersFilters}
            onFiltersChange={(nextFilters) => {
              setOrdersPage(1);
              setOrdersFilters((current) => ({ ...current, ...nextFilters }));
            }}
            onPageChange={setOrdersPage}
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
            summary={usersSummary}
            pagination={usersPagination}
            filters={usersFilters}
            canEditRoles={isAdmin}
            updatingUserId={updatingUserId}
            onFiltersChange={(nextFilters) => {
              setUsersPage(1);
              setUsersFilters((current) => ({ ...current, ...nextFilters }));
            }}
            onPageChange={setUsersPage}
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

          <SectionNav section={section} onSectionChange={stableSectionChange} onSectionIntent={stableSectionIntent} className="space-y-2" />

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

          <div className="-mx-1 space-y-4 px-1 pb-4 pt-1 lg:static lg:mx-0 lg:space-y-0 lg:bg-none lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none">
            <div className="lg:hidden">
              <div className={cn(isMobileHeaderCompact ? "sticky top-0 z-30 -mx-1 bg-[linear-gradient(180deg,rgba(5,8,22,0.98)_0%,rgba(5,8,22,0.95)_86%,rgba(5,8,22,0)_100%)] px-1 pb-3 pt-1 backdrop-blur-md" : "") }>
                <div className="glass rounded-[22px] border border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 pr-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300">DuelVault</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-lg font-black text-white">Santuario Admin</h1>
                        <span className="inline-flex max-w-full truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">{currentSectionLabel}</span>
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
                        <span className="hidden min-[420px]:inline">Menú</span>
                        <Menu className="h-4 w-4" />
                      </button>

                      <button
                        onClick={onLogout}
                        aria-label="Cerrar sesión"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden min-[420px]:inline">Salir</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {isMobileCompactMenuOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar menú lateral"
                    onClick={() => setIsMobileCompactMenuOpen(false)}
                    className="fixed inset-0 z-40 bg-slate-950/72 backdrop-blur-sm lg:hidden"
                  />
                  <aside
                    className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,372px)] flex-col border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,14,31,0.98),rgba(8,12,26,0.95))] shadow-[-24px_0_90px_rgba(0,0,0,0.42)] backdrop-blur-xl lg:hidden"
                  >
                <div className="border-b border-white/10 px-5 pb-4 pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300">Navegación</p>
                      <h2 className="mt-2 text-[1.35rem] font-black text-white">Santuario Admin</h2>
                      <p className="mt-1 truncate text-sm text-slate-400">{session.admin.email}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Cerrar menú"
                      onClick={() => setIsMobileCompactMenuOpen(false)}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-300 transition duration-200 hover:bg-white/[0.08]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Vista activa</p>
                    <p className="mt-2 text-lg font-bold text-white">{currentSectionMeta.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{currentSectionMeta.description}</p>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <MobileSectionNav section={section} onSectionChange={stableSectionChange} onSectionIntent={stableSectionIntent} />
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">Radar rápido</p>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">En línea</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/80">Stock bajo</p>
                        <p className="mt-2 text-2xl font-black text-white">{dashboard.metrics.lowStockCount}</p>
                      </div>
                      <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-rose-200/80">Agotadas</p>
                        <p className="mt-2 text-2xl font-black text-white">{dashboard.metrics.outOfStockCount}</p>
                      </div>
                    </div>
                  </div>
                </div>
                  </aside>
                </>
              ) : null}
            </div>

            <header className={cn("glass rounded-[32px] border border-white/10 p-4 sm:p-6 hidden lg:block", section === "dashboard" ? "lg:hidden" : "") }>
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

export default function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(() => getBootstrapSession() || getStoredSession());

  /* ── Realtime SSE for admin panel ── */
  useAdminRealtimeEvents(session, setSession);

  const handleLogout = async () => {
    const storefrontLoginUrlPromise = resolveStorefrontLoginUrl();

    setSession(null);
    queryClient.clear();
    clearStoredSession();

    try {
      window.sessionStorage.clear();
    } catch {}

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    clearPersistedAdminQueryCache();
    clearStoredAdminUiState();

    const storefrontLoginUrl = await storefrontLoginUrlPromise;
    window.location.assign(storefrontLoginUrl);
  };

  if (!session) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <LoginScreen onLoggedIn={setSession} />
      </Suspense>
    );
  }

  return (
    <AdminShell
      session={session}
      onLogout={handleLogout}
    />
  );
}
