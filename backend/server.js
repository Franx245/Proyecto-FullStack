import "./src/lib/load-env.js";
import bcrypt from "bcryptjs";
import compression from "compression";
import cors from "cors";
import ExcelJS from "exceljs";
import express from "express";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import prismaPkg from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import { prisma, withDatabaseConnection } from "./src/lib/prisma.js";
import { syncCatalogFromScope } from "./src/lib/catalogSync.js";
import {
  cacheGetOrFetch,
  invalidatePublicCatalogCache,
  DASHBOARD_CACHE_KEY,
  DASHBOARD_CACHE_TTL_SECONDS,
  PUBLIC_CARD_DETAIL_CACHE_PREFIX,
  PUBLIC_CARD_DETAIL_CACHE_TTL_SECONDS,
  PUBLIC_CARD_FILTERS_CACHE_KEY,
  PUBLIC_CARD_FILTERS_CACHE_TTL_SECONDS,
  PUBLIC_CARD_LIST_CACHE_PREFIX,
  PUBLIC_CARD_LIST_CACHE_TTL_SECONDS,
} from "./src/lib/cache.js";
import { getUsdToArsRate } from "./src/lib/dollar.js";
import { createMercadoPagoDirectPayment } from "./src/lib/mercadopagoPayments.js";
import { createRateLimitMiddleware, getRequestIp, validateBody } from "./src/lib/requestGuards.js";
/* ── Realtime ── */
import { publishEvent } from "./src/lib/events.js";
import { publicSSEHandler, adminSSEHandler, getSSEClientCount } from "./src/lib/sse.js";
/* ── Redis TCP + BullMQ ── */
import { isRedisTcpConfigured, pingRedisTcp, shutdownRedisTcp } from "./src/lib/redis-tcp.js";
import { enqueueJob, shutdownQueue } from "./src/lib/jobs/queue.js";
import { stopEventBus } from "./src/lib/events.js";
/* ── Cron job handlers ── */
import { handleRecomputePrices } from "./src/lib/jobs/recompute-prices.js";
import { handleComputeCardRankings } from "./src/lib/jobs/compute-card-rankings.js";
import { handleWarmPublicCache } from "./src/lib/jobs/warm-public-cache.js";
import { getRedisBackendName, probeRedisConnection } from "./src/lib/redis.js";
import { invalidateOrderRelatedCache } from "./src/lib/cache-invalidation.js";
import { recordApiMetric, recordCatalogSearchMetric } from "./src/lib/metrics.js";
import {
  adminLoginBodySchema,
  contactRequestBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshTokenBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from "./src/lib/requestSchemas.js";
import {
  createPasswordResetToken,
  getRefreshTokenExpiryDate,
  hashToken,
  requireAdminAuth,
  requireAdminEventStreamAuth,
  requireAdminRole,
  requireAuth,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./src/lib/auth.js";

const { ContactRequestStatus, OrderStatus, ShippingZone, UserRole } = prismaPkg;
const __filename = fileURLToPath(import.meta.url);
const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

const app = express();
const PORT = Number(process.env.PORT || 3001);
const REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 15000);
const CHECKOUT_REQUEST_TIMEOUT_MS = Math.max(
  REQUEST_TIMEOUT_MS,
  Number(process.env.CHECKOUT_REQUEST_TIMEOUT_MS || 45000)
);
const MERCADOPAGO_WEBHOOK_TIMEOUT_MS = Math.max(
  REQUEST_TIMEOUT_MS,
  Number(process.env.MP_WEBHOOK_TIMEOUT_MS || 25000)
);
const localHosts = new Set(["localhost", "127.0.0.1"]);
const configuredOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ]
    .map((value) => String(value || "").trim().replace(/\/$/, ""))
    .filter(Boolean)
);
const allowedPorts = new Set([
  String(process.env.STORE_PORT || 5173),
  String(process.env.ADMIN_PORT || 5174),
  String(process.env.NEXT_STORE_PORT || 3000),
  "5173",
  "5174",
  "3000",
]);
const allowVercelPreviewOrigins = process.env.ALLOW_VERCEL_PREVIEWS === "true";
const MERCADOPAGO_ACCESS_TOKEN = String(process.env.MP_ACCESS_TOKEN || "").trim();
const MERCADOPAGO_WEBHOOK_SECRET = String(process.env.MP_WEBHOOK_SECRET || "").trim();
const BACKEND_PUBLIC_URL = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
const FRONTEND_PUBLIC_URL = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
const allowedVercelProjectNames = new Set(
  [...configuredOrigins, BACKEND_PUBLIC_URL]
    .map((value) => {
      try {
        const hostname = new URL(value).hostname.toLowerCase();
        if (!hostname.endsWith(".vercel.app")) {
          return null;
        }

        return hostname.slice(0, -".vercel.app".length);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);
const CRON_SECRET = String(process.env.CRON_SECRET || "").trim();
const CHECKOUT_EXPIRATION_MINUTES = Math.max(5, Number(process.env.CHECKOUT_EXPIRATION_MINUTES || 30));
const ORDER_SCHEMA_CACHE_TTL_MS = 1000 * 60;
const MERCADOPAGO_ACCOUNT_CACHE_TTL_MS = 1000 * 60 * 10;
const MERCADOPAGO_WEBHOOK_PATHS = ["/api/checkout/webhook", "/api/webhook/mercadopago"];
const MERCADOPAGO_TEST_ACCESS_TOKEN_PREFIX = "TEST-";
const mercadoPagoClient = MERCADOPAGO_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: MERCADOPAGO_ACCESS_TOKEN })
  : null;
const mercadoPagoPreferenceClient = mercadoPagoClient ? new Preference(mercadoPagoClient) : null;
const mercadoPagoPaymentClient = mercadoPagoClient ? new Payment(mercadoPagoClient) : null;
const orderSchemaState = {
  checkedAt: 0,
  inflight: null,
  details: null,
};
const mercadoPagoAccountState = {
  checkedAt: 0,
  inflight: null,
  details: null,
};

function resolveRequestTimeoutMs(req) {
  const requestPath = String(req.path || req.originalUrl || "");

  if (requestPath === "/api/checkout" || requestPath === "/api/checkout/create-preference") {
    return CHECKOUT_REQUEST_TIMEOUT_MS;
  }

  if (MERCADOPAGO_WEBHOOK_PATHS.includes(requestPath)) {
    return MERCADOPAGO_WEBHOOK_TIMEOUT_MS;
  }

  return REQUEST_TIMEOUT_MS;
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = String(origin).replace(/\/$/, "");
  if (configuredOrigins.has(normalizedOrigin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();

    if (localHosts.has(hostname) && process.env.NODE_ENV !== "production") {
      return true;
    }

    if (allowVercelPreviewOrigins && hostname.endsWith(".vercel.app")) {
      return true;
    }

    if (hostname.endsWith(".vercel.app")) {
      const projectName = hostname.slice(0, -".vercel.app".length);
      for (const allowedProjectName of allowedVercelProjectNames) {
        if (projectName === allowedProjectName || projectName.startsWith(`${allowedProjectName}-`)) {
          return true;
        }
      }
    }

    if (localHosts.has(hostname) && allowedPorts.has(parsed.port)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

const SHIPPING_OPTIONS = {
  [ShippingZone.CABA]: { cost: 5.99, label: "Envío CABA", eta: "24 hs" },
  [ShippingZone.GBA]: { cost: 8.99, label: "Envío GBA", eta: "24-48 hs" },
  [ShippingZone.INTERIOR]: { cost: 12.99, label: "Envío Interior", eta: "2-4 días" },
  [ShippingZone.PICKUP]: { cost: 0, label: "Retiro por showroom", eta: "Coordinar" },
};

const ORDER_TRANSITIONS = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.FAILED, OrderStatus.EXPIRED, OrderStatus.CANCELLED],
  [OrderStatus.FAILED]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.EXPIRED]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};
const BILLABLE_ORDER_STATUSES = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED];
const DEFAULT_ADMIN_USERS_PAGE_SIZE = 8;
const DEFAULT_ADMIN_ORDERS_PAGE_SIZE = 10;
const MAX_ADMIN_PAGE_SIZE = 50;

app.use(cors({
  origin(origin, callback) {
    const allowedOrigin = isAllowedOrigin(origin);
    callback(allowedOrigin ? null : new Error("Origin not allowed by CORS"), allowedOrigin);
  },
  credentials: true,
}));
app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const requestId = String(req.headers["x-request-id"] || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const controller = new AbortController();
  const timeoutMs = resolveRequestTimeoutMs(req);

  req.requestContext = {
    requestId,
    signal: controller.signal,
    isCancelled: false,
    isTimedOut: false,
    startedAt: Date.now(),
    timeoutMs,
  };

  const abortRequest = (reason) => {
    req.requestContext.isCancelled = true;
    if (reason === "timeout") {
      req.requestContext.isTimedOut = true;
    }

    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  res.setHeader("X-Request-Id", requestId);
  req.on("aborted", () => abortRequest("client_aborted"));
  req.on("close", () => {
    if (req.aborted) {
      abortRequest("client_aborted");
    }
  });

  res.setTimeout(timeoutMs, () => {
    abortRequest("timeout");
    if (!res.headersSent) {
      res.status(408).json({
        error: "Request timed out",
        code: "REQUEST_TIMEOUT",
        requestId,
        timeout_ms: timeoutMs,
      });
    }
  });

  res.on("finish", () => {
    const durationMs = Date.now() - (req.requestContext?.startedAt || Date.now());
    void recordApiMetric({
      method: req.method,
      route: req.route?.path || req.path,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
});

app.use([
  "/api/checkout",
  ...MERCADOPAGO_WEBHOOK_PATHS,
  "/api/orders",
  "/api/auth/orders",
  "/api/admin/dashboard",
  "/api/admin/orders",
  "/api/admin/export/orders",
  "/api/internal/orders/expire-pending",
  "/api/internal/recompute-prices",
  "/api/internal/compute-rankings",
  "/api/internal/warm-cache",
], async (req, res, next) => {
  try {
    await ensureOrderSchemaReady();
    next();
  } catch (error) {
    const isDatabaseUnavailable = isDatabaseUnavailableError(error);

    res.status(error?.statusCode || 503).json({
      error: isDatabaseUnavailable ? "Database is unavailable" : error?.message || "Database schema is out of date",
      code: isDatabaseUnavailable ? "DATABASE_UNAVAILABLE" : error?.code || "DATABASE_SCHEMA_OUTDATED",
      requestId: req.requestContext?.requestId || null,
      ...(!isDatabaseUnavailable && error?.details ? error.details : {}),
    });
  }
});

const contactRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:contact",
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: "Too many contact requests. Try again later.",
  code: "CONTACT_RATE_LIMIT_EXCEEDED",
});

const authWriteRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:auth",
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  message: "Too many authentication requests. Try again later.",
  code: "AUTH_RATE_LIMIT_EXCEEDED",
});

const sessionRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:session",
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
  message: "Too many session requests. Try again later.",
  code: "SESSION_RATE_LIMIT_EXCEEDED",
});

const passwordResetRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:password-reset",
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: "Too many password reset requests. Try again later.",
  code: "PASSWORD_RESET_RATE_LIMIT_EXCEEDED",
});

const adminAuthRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:admin-auth",
  windowMs: 10 * 60 * 1000,
  maxRequests: 8,
  message: "Too many admin authentication requests. Try again later.",
  code: "ADMIN_AUTH_RATE_LIMIT_EXCEEDED",
});

/* ── Global rate limiter (all /api/* routes) ── */
const GLOBAL_RATE_LIMIT_SKIP = new Set([
  "/api/health",
  "/api/checkout/webhook",
  "/api/webhook/mercadopago",
]);

const globalRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:global",
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: "Too many requests. Please try again later.",
  code: "GLOBAL_RATE_LIMIT_EXCEEDED",
  buildKey: (req) => getRequestIp(req),
});

const checkoutRateLimit = createRateLimitMiddleware({
  keyPrefix: "rl:checkout",
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: "Too many checkout requests. Please try again later.",
  code: "CHECKOUT_RATE_LIMIT_EXCEEDED",
});

app.use("/api", (req, res, next) => {
  if (GLOBAL_RATE_LIMIT_SKIP.has(req.path) || GLOBAL_RATE_LIMIT_SKIP.has(`/api${req.path}`)) {
    next();
    return;
  }
  globalRateLimit(req, res, next);
});

function toStatus(card) {
  if (card.stock <= 0) {
    return "out_of_stock";
  }

  if (isLowStockCard(card)) {
    return "low_stock";
  }

  return "in_stock";
}

function getAdminCardImageUrl(imageUrl) {
  const normalizedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";

  if (!normalizedImageUrl) {
    return null;
  }

  if (normalizedImageUrl.includes("/images/cards_small/")) {
    return normalizedImageUrl;
  }

  if (normalizedImageUrl.includes("/images/cards/")) {
    return normalizedImageUrl.replace("/images/cards/", "/images/cards_small/");
  }

  return normalizedImageUrl;
}

function toPublicCard(card, options = {}) {
  const stockStatus = toStatus(card);
  const imageUrl = options.adminThumbnail ? getAdminCardImageUrl(card.image) : card.image || null;

  return {
    id: card.id,
    version_id: String(card.id),
    ygopro_id: card.ygoproId,
    name: card.name,
    image: imageUrl,
    image_url: imageUrl,
    description: card.description || "",
    card_type: card.cardType || "Unknown",
    race: card.race || null,
    attribute: card.attribute || null,
    atk: card.atk ?? null,
    def: card.def ?? null,
    level: card.level ?? null,
    set_name: card.setName || "YGOPRODeck",
    set_code: card.setCode || `YGO-${card.ygoproId}`,
    rarity: card.rarity || "Unknown",
    price: card.price,
    stock: card.stock,
    low_stock_threshold: card.lowStockThreshold,
    is_visible: card.isVisible,
    is_featured: card.isFeatured,
    is_new_arrival: card.isNewArrival,
    sales_count: card.salesCount,
    updated_at: card.updatedAt,
    condition: stockStatus === "out_of_stock" ? "Out of stock" : "Near Mint",
    status: stockStatus,
    is_low_stock: stockStatus === "low_stock",
    is_out_of_stock: stockStatus === "out_of_stock",
  };
}

function attachMetadata(cards, options = {}) {
  return cards.map((card) => toPublicCard(card, options));
}

const PUBLIC_CARD_LIST_SELECT = {
  id: true,
  ygoproId: true,
  name: true,
  image: true,
  cardType: true,
  attribute: true,
  rarity: true,
  setName: true,
  setCode: true,
  price: true,
  stock: true,
  lowStockThreshold: true,
  isVisible: true,
  isFeatured: true,
  isNewArrival: true,
  salesCount: true,
  updatedAt: true,
};

const ADMIN_USER_RESPONSE_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
};

const DASHBOARD_ORDER_SUMMARY_SELECT = {
  userId: true,
  status: true,
  total: true,
  shippingZone: true,
  createdAt: true,
  items: {
    select: {
      quantity: true,
    },
  },
};

const CATALOG_SCOPE_MODE = {
  ALL: "ALL",
  FIRST_N: "FIRST_N",
  SELECTED: "SELECTED",
};

const _DEFAULT_CATALOG_SCOPE_LIMIT = 500;
const _MAX_CATALOG_SCOPE_LIMIT = 5000;
const CATALOG_SCOPE_MODE_SETTING_KEY = "catalog_scope_mode";
const CATALOG_SCOPE_LIMIT_SETTING_KEY = "catalog_scope_limit";
const CATALOG_SCOPE_SELECTED_IDS_SETTING_KEY = "catalog_scope_selected_ids";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return slugify(String(value || "").replace(/-/g, " ")).replace(/-/g, "_");
}

function getAuthenticatedActorId(req) {
  const candidate = Number(req.user?.id ?? req.user?.sub);
  return Number.isFinite(candidate) ? candidate : null;
}

function normalizeOrderStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(OrderStatus).includes(normalized) ? normalized : null;
}

function normalizeShippingZone(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(ShippingZone).includes(normalized) ? normalized : null;
}

function parseExpectedUpdatedAt(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "INVALID_DATE" : parsedDate;
}

function getMutationMetadata(req) {
  return {
    mutationId: String(req.headers["x-idempotency-key"] || req.body?.mutation_id || "").trim() || null,
    requestId: req.requestContext?.requestId || String(req.headers["x-request-id"] || "").trim() || null,
    resourceId: req.body?.resource_id ?? null,
  };
}

function assertExpectedUpdatedAt(entity, expectedUpdatedAt) {
  if (!expectedUpdatedAt) {
    return;
  }

  if (!entity?.updatedAt || entity.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("CONCURRENT_MODIFICATION");
  }
}

function getShippingInfo(zone) {
  return SHIPPING_OPTIONS[zone] || SHIPPING_OPTIONS[ShippingZone.PICKUP];
}

function isBillableStatus(status) {
  return [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(status);
}

function isOrderPayableStatus(status) {
  return [OrderStatus.PENDING_PAYMENT, OrderStatus.FAILED].includes(status);
}

function isMercadoPagoProcessingStatus(status) {
  return ["pending", "in_process", "authorized", "in_mediation"].includes(String(status || "").trim().toLowerCase());
}

function hasMercadoPagoPaymentAttempt(order) {
  return Boolean(String(order?.payment_id || "").trim());
}

function canCancelOrder(role) {
  return role === UserRole.ADMIN;
}

function getAllowedOrderTransitions(currentStatus, role) {
  return (ORDER_TRANSITIONS[currentStatus] || []).filter((candidateStatus) => {
    if (candidateStatus === OrderStatus.CANCELLED) {
      return canCancelOrder(role);
    }

    return true;
  });
}

function _canTransitionOrder(currentStatus, nextStatus, role) {
  if (!nextStatus || currentStatus === nextStatus) {
    return false;
  }

  return getAllowedOrderTransitions(currentStatus, role).includes(nextStatus);
}

function formatCurrency(value) {
  return Number((value || 0).toFixed(2));
}

function buildCheckoutExpirationDate(baseTime = Date.now()) {
  return new Date(baseTime + CHECKOUT_EXPIRATION_MINUTES * 60 * 1000);
}

async function inspectOrderSchemaCompatibility() {
  const [columnRows, enumRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Order'
    `,
    prisma.$queryRaw`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'OrderStatus'
    `,
  ]);

  const existingColumns = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row.column_name || "").trim()));
  const existingStatuses = new Set((Array.isArray(enumRows) ? enumRows : []).map((row) => String(row.enumlabel || "").trim()));
  const requiredColumns = [
    "payment_id",
    "payment_status_detail",
    "preference_id",
    "currency",
    "exchange_rate",
    "total_ars",
    "expires_at",
  ];
  const requiredStatuses = ["FAILED", "EXPIRED"];

  return {
    checkedAt: Date.now(),
    missingColumns: requiredColumns.filter((column) => !existingColumns.has(column)),
    missingStatuses: requiredStatuses.filter((status) => !existingStatuses.has(status)),
  };
}

async function ensureOrderSchemaReady() {
  if (orderSchemaState.details && Date.now() - orderSchemaState.checkedAt < ORDER_SCHEMA_CACHE_TTL_MS) {
    if (orderSchemaState.details.missingColumns.length || orderSchemaState.details.missingStatuses.length) {
      throw createAppError("Database schema is out of date for order payments. Run npm run db before serving orders or Mercado Pago checkout.", {
        statusCode: 503,
        code: "DATABASE_SCHEMA_OUTDATED",
        details: {
          required_command: "npm run db",
          missing_columns: orderSchemaState.details.missingColumns,
          missing_statuses: orderSchemaState.details.missingStatuses,
        },
      });
    }

    return orderSchemaState.details;
  }

  if (!orderSchemaState.inflight) {
    orderSchemaState.inflight = inspectOrderSchemaCompatibility()
      .then((details) => {
        orderSchemaState.details = details;
        orderSchemaState.checkedAt = Date.now();
        return details;
      })
      .finally(() => {
        orderSchemaState.inflight = null;
      });
  }

  const details = await orderSchemaState.inflight;
  if (details.missingColumns.length || details.missingStatuses.length) {
    throw createAppError("Database schema is out of date for order payments. Run npm run db before serving orders or Mercado Pago checkout.", {
      statusCode: 503,
      code: "DATABASE_SCHEMA_OUTDATED",
      details: {
        required_command: "npm run db",
        missing_columns: details.missingColumns,
        missing_statuses: details.missingStatuses,
      },
    });
  }

  return details;
}

function assertMercadoPagoApiConfigured() {
  if (!mercadoPagoClient || !mercadoPagoPreferenceClient || !mercadoPagoPaymentClient) {
    throw createAppError("Mercado Pago is not configured", {
      statusCode: 503,
      code: "CHECKOUT_NOT_CONFIGURED",
    });
  }
}

function assertMercadoPagoCheckoutConfigured() {
  assertMercadoPagoApiConfigured();

  if (!BACKEND_PUBLIC_URL || !FRONTEND_PUBLIC_URL) {
    throw createAppError("BACKEND_URL and FRONTEND_URL are required for Mercado Pago checkout", {
      statusCode: 503,
      code: "CHECKOUT_URLS_NOT_CONFIGURED",
    });
  }
}

function assertMercadoPagoWebhookConfigured() {
  assertMercadoPagoApiConfigured();

  if (!MERCADOPAGO_WEBHOOK_SECRET) {
    throw createAppError("MP_WEBHOOK_SECRET is required to validate Mercado Pago webhook signatures", {
      statusCode: 503,
      code: "WEBHOOK_SECRET_NOT_CONFIGURED",
    });
  }
}

function assertMercadoPagoDirectPaymentsConfigured() {
  assertMercadoPagoWebhookConfigured();
}

function buildCheckoutBackUrl(statusPath, orderId) {
  return `${FRONTEND_PUBLIC_URL}/checkout/${statusPath}?orderId=${encodeURIComponent(String(orderId))}`;
}

async function inspectMercadoPagoAccount() {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw createAppError(`Mercado Pago account inspection failed with ${response.status}`, {
      statusCode: 502,
      code: "MERCADOPAGO_ACCOUNT_INSPECTION_FAILED",
    });
  }

  const payload = await response.json();
  return {
    checkedAt: Date.now(),
    isTestUser: Boolean(payload?.test_data?.test_user) || (Array.isArray(payload?.tags) && payload.tags.includes("test_user")),
    nickname: String(payload?.nickname || "").trim() || null,
    email: String(payload?.email || "").trim().toLowerCase() || null,
  };
}

async function getMercadoPagoAccountDetails() {
  if (mercadoPagoAccountState.details && Date.now() - mercadoPagoAccountState.checkedAt < MERCADOPAGO_ACCOUNT_CACHE_TTL_MS) {
    return mercadoPagoAccountState.details;
  }

  if (!mercadoPagoAccountState.inflight) {
    mercadoPagoAccountState.inflight = inspectMercadoPagoAccount()
      .then((details) => {
        mercadoPagoAccountState.details = details;
        mercadoPagoAccountState.checkedAt = Date.now();
        return details;
      })
      .finally(() => {
        mercadoPagoAccountState.inflight = null;
      });
  }

  return mercadoPagoAccountState.inflight;
}

function shouldUseMercadoPagoSandbox(accountDetails) {
  return Boolean(accountDetails?.isTestUser);
}

function shouldUseMercadoPagoSandboxWebhook(accountDetails) {
  return shouldUseMercadoPagoSandbox(accountDetails)
    || MERCADOPAGO_ACCESS_TOKEN.startsWith(MERCADOPAGO_TEST_ACCESS_TOKEN_PREFIX);
}

function isMercadoPagoWebhookBaseUrlAllowed(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();

    if (!hostname || ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function buildMercadoPagoNotificationUrl({ useSandboxWebhook = false } = {}) {
  if (!isMercadoPagoWebhookBaseUrlAllowed(BACKEND_PUBLIC_URL)) {
    return null;
  }

  const webhookPath = useSandboxWebhook ? MERCADOPAGO_WEBHOOK_PATHS[1] : MERCADOPAGO_WEBHOOK_PATHS[0];
  return `${BACKEND_PUBLIC_URL}${webhookPath}?source_news=webhooks`;
}

function splitMercadoPagoFullName(fullName) {
  const normalized = String(fullName || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function resolveMercadoPagoPayer(order) {
  const email = String(order?.customerEmail || order?.user?.email || "").trim().toLowerCase();
  const fullName = order?.customerName || order?.address?.recipientName || order?.user?.fullName || "";
  const { firstName, lastName } = splitMercadoPagoFullName(fullName);

  const payer = {
    ...(email ? { email } : {}),
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
  };

  return Object.keys(payer).length > 0 ? payer : undefined;
}

function buildMercadoPagoPreferenceItems(order, cardsById, exchangeRate) {
  const items = order.items.map((item) => {
    const card = cardsById.get(item.cardId);
    return {
      id: String(item.cardId),
      title: String(card?.name || `Carta #${item.cardId}`).slice(0, 120),
      description: String(card?.description || card?.setName || card?.cardType || "Carta coleccionable").slice(0, 240),
      category_id: "others",
      quantity: item.quantity,
      currency_id: "ARS",
      unit_price: formatCurrency(item.price * exchangeRate),
    };
  });

  if (order.shippingCost > 0) {
    items.push({
      id: `shipping-${order.id}`,
      title: String(order.shippingLabel || "Envio").slice(0, 120),
      description: String(order.shippingAddress || order.shippingZone || "Costo de envio").slice(0, 240),
      category_id: "services",
      quantity: 1,
      currency_id: "ARS",
      unit_price: formatCurrency(order.shippingCost * exchangeRate),
    });
  }

  return items;
}

function alignMercadoPagoItemsTotal(items, totalArs) {
  if (!Array.isArray(items) || items.length === 0) {
    return [
      {
        id: "order-total",
        title: "DuelVault Order",
        description: "Checkout total",
        category_id: "others",
        quantity: 1,
        currency_id: "ARS",
        unit_price: formatCurrency(totalArs),
      },
    ];
  }

  const currentTotal = formatCurrency(items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0));
  const delta = formatCurrency(totalArs - currentTotal);

  if (delta === 0) {
    return items;
  }

  const lastItem = items[items.length - 1];
  const adjustedUnitPrice = formatCurrency(lastItem.unit_price + (delta / Math.max(lastItem.quantity || 1, 1)));

  items[items.length - 1] = {
    ...lastItem,
    unit_price: adjustedUnitPrice > 0 ? adjustedUnitPrice : lastItem.unit_price,
  };

  return items;
}

function resolveMercadoPagoCheckoutUrl(preference, { useSandbox }) {
  if (useSandbox) {
    return preference?.sandbox_init_point || preference?.init_point || null;
  }

  return preference?.init_point || preference?.sandbox_init_point || null;
}

function createAppError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

function isDatabaseUnavailableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.name === "PrismaClientInitializationError"
    || ["P1001", "P1002", "P2024"].includes(error?.code)
    || message.includes("timed out fetching a new connection from the connection pool")
    || message.includes("too many clients")
    || message.includes("can't reach database server");
}

function sendErrorResponse(error, req, res, fallbackMessage = "Internal server error") {
  if (res.headersSent) {
    return;
  }

  const requestId = req.requestContext?.requestId || null;

  if (error?.statusCode) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code || "REQUEST_ERROR",
      ...(requestId ? { requestId } : {}),
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (error?.name === "PrismaClientInitializationError") {
    console.error("[request-error] prisma init failed", {
      requestId,
      route: getRouteKey(req),
      message: error.message,
    });

    res.status(503).json({
      error: "Database is unavailable",
      code: "DATABASE_UNAVAILABLE",
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  console.error("[request-error]", {
    requestId,
    route: getRouteKey(req),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  });

  res.status(500).json({
    error: fallbackMessage,
    ...(requestId ? { requestId } : {}),
  });
}

function extractIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

function safeJsonStringify(value) {
  try {
    return value ? JSON.stringify(value) : null;
  } catch {
    return null;
  }
}

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function unwrapMercadoPagoBody(payload) {
  return payload?.body || payload?.response || payload || null;
}

function normalizeMercadoPagoPaymentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMercadoPagoPaymentStatusDetail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function parseMercadoPagoSignature(headerValue) {
  const parts = String(headerValue || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.reduce((result, part) => {
    const [key, value] = part.split("=", 2);
    if (key === "ts") {
      result.ts = String(value || "").trim();
    }
    if (key === "v1") {
      result.v1 = String(value || "").trim();
    }
    return result;
  }, { ts: "", v1: "" });
}

function buildMercadoPagoWebhookManifest(paymentId, requestId, ts) {
  const normalizedPaymentId = String(paymentId || "").trim().toLowerCase();
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedTs = String(ts || "").trim();
  const parts = [];

  if (normalizedPaymentId) {
    parts.push(`id:${normalizedPaymentId}`);
  }
  if (normalizedRequestId) {
    parts.push(`request-id:${normalizedRequestId}`);
  }
  if (normalizedTs) {
    parts.push(`ts:${normalizedTs}`);
  }

  return `${parts.join(";")};`;
}

function validateMercadoPagoWebhookSignature(req, paymentId) {
  const signature = parseMercadoPagoSignature(req.headers["x-signature"]);
  const requestId = String(req.headers["x-request-id"] || "").trim();

  if (!signature.ts || !signature.v1 || !requestId || !paymentId) {
    throw createAppError("Mercado Pago webhook signature headers are incomplete", {
      statusCode: 401,
      code: "INVALID_WEBHOOK_SIGNATURE",
    });
  }

  const manifest = buildMercadoPagoWebhookManifest(paymentId, requestId, signature.ts);
  const expectedSignature = createHmac("sha256", MERCADOPAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");
  const receivedSignature = signature.v1.toLowerCase();
  const isValid = expectedSignature.length === receivedSignature.length
    && timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature));

  if (!isValid) {
    throw createAppError("Mercado Pago webhook signature mismatch", {
      statusCode: 401,
      code: "INVALID_WEBHOOK_SIGNATURE",
    });
  }

  return {
    providerRequestId: requestId,
    manifest,
    ts: signature.ts,
  };
}

function extractMercadoPagoPaymentId(payload, query) {
  const candidates = [
    payload?.data?.id,
    payload?.id,
    query?.id,
    query?.["data.id"],
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function resolveMercadoPagoOrderId(payment) {
  const candidates = [payment?.metadata?.order_id, payment?.external_reference];

  for (const candidate of candidates) {
    const normalized = Number(candidate);
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  return null;
}

function resolveWebhookOrderStatus(currentStatus, paymentStatus) {
  if (!paymentStatus) {
    return null;
  }

  if ([OrderStatus.EXPIRED, OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(currentStatus)) {
    return null;
  }

  if (paymentStatus === "approved") {
    return OrderStatus.PAID;
  }

  if (["pending", "in_process", "in_mediation", "authorized"].includes(paymentStatus)) {
    return OrderStatus.PENDING_PAYMENT;
  }

  if (paymentStatus === "expired") {
    return OrderStatus.EXPIRED;
  }

  if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentStatus)) {
    return OrderStatus.FAILED;
  }

  return null;
}

function normalizeHashInput(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeHashInput);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeHashInput(value[key]);
        return result;
      }, {});
  }

  return value ?? null;
}

function buildRequestHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeHashInput(value)))
    .digest("hex");
}

function getRouteKey(req, fallback = null) {
  const routePath = req.route?.path || fallback || req.path || req.originalUrl || "unknown";
  return `${req.method} ${routePath}`;
}

function assertRequestActive(req) {
  if (req.requestContext?.isTimedOut) {
    throw createAppError("Request timed out", { statusCode: 408, code: "REQUEST_TIMEOUT" });
  }

  if (req.requestContext?.isCancelled || req.requestContext?.signal?.aborted) {
    throw createAppError("Request cancelled", { statusCode: 499, code: "REQUEST_CANCELLED" });
  }
}

async function beginIdempotentMutation(req, { routeKey, payload } = {}) {
  const actorId = getAuthenticatedActorId(req);
  const key = String(req.headers["x-idempotency-key"] || req.body?.mutation_id || "").trim();
  const resolvedRouteKey = routeKey || getRouteKey(req);

  if (!Number.isFinite(actorId) || !key) {
    return {
      routeKey: resolvedRouteKey,
      key: null,
      replay: null,
      recordId: null,
      finalized: true,
    };
  }

  const requestHash = buildRequestHash({
    params: req.params,
    body: payload ?? req.body ?? null,
  });

  const uniqueWhere = {
    actorId_routeKey_key: {
      actorId,
      routeKey: resolvedRouteKey,
      key,
    },
  };

  let existingRecord = await prisma.adminIdempotencyKey.findUnique({ where: uniqueWhere });

  if (!existingRecord) {
    try {
      existingRecord = await prisma.adminIdempotencyKey.create({
        data: {
          actorId,
          routeKey: resolvedRouteKey,
          key,
          requestHash,
        },
      });

      return {
        routeKey: resolvedRouteKey,
        key,
        replay: null,
        recordId: existingRecord.id,
        requestHash,
        finalized: false,
      };
    } catch (error) {
      if (error?.code !== "P2002") {
        throw error;
      }

      existingRecord = await prisma.adminIdempotencyKey.findUnique({ where: uniqueWhere });
    }
  }

  if (existingRecord?.requestHash && existingRecord.requestHash !== requestHash) {
    throw createAppError("Idempotency key already used with a different payload", {
      statusCode: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
      details: {
        requestId: req.requestContext?.requestId || null,
        routeKey: resolvedRouteKey,
      },
    });
  }

  if (existingRecord?.statusCode && existingRecord.responseBody) {
    return {
      routeKey: resolvedRouteKey,
      key,
      replay: {
        statusCode: existingRecord.statusCode,
        body: safeJsonParse(existingRecord.responseBody) || {},
      },
      recordId: existingRecord.id,
      requestHash,
      finalized: true,
    };
  }

  throw createAppError("Another mutation with the same idempotency key is still in progress", {
    statusCode: 409,
    code: "MUTATION_IN_PROGRESS",
    details: {
      requestId: req.requestContext?.requestId || null,
      routeKey: resolvedRouteKey,
    },
  });
}

async function finalizeIdempotentMutation(context, statusCode, responseBody) {
  if (!context?.recordId || context.finalized) {
    return;
  }

  await prisma.adminIdempotencyKey.update({
    where: { id: context.recordId },
    data: {
      statusCode,
      responseBody: safeJsonStringify(responseBody),
    },
  });
  context.finalized = true;
}

async function releaseIdempotentMutation(context) {
  if (!context?.recordId || context.finalized) {
    return;
  }

  await prisma.adminIdempotencyKey.delete({ where: { id: context.recordId } }).catch(() => null);
  context.finalized = true;
}

function sanitizeCardForAudit(card) {
  if (!card) {
    return null;
  }

  return {
    id: card.id,
    ygoproId: card.ygoproId,
    name: card.name,
    price: card.price,
    stock: card.stock,
    lowStockThreshold: card.lowStockThreshold,
    isVisible: Boolean(card.isVisible),
    isFeatured: Boolean(card.isFeatured),
    isNewArrival: Boolean(card.isNewArrival),
    salesCount: card.salesCount,
    updatedAt: card.updatedAt,
  };
}

function sanitizeUserForAudit(user) {
  return user ? toUserResponse(user) : null;
}

function sanitizeContactRequestForAudit(contactRequest) {
  return contactRequest ? toContactRequestResponse(contactRequest) : null;
}

function sanitizeOrderForAudit(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    userId: order.userId ?? null,
    addressId: order.addressId ?? null,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    total: order.total,
    status: order.status,
    shippingZone: order.shippingZone,
    shippingLabel: order.shippingLabel,
    trackingCode: order.trackingCode || null,
    trackingVisibleToUser: Boolean(order.trackingVisibleToUser),
    customerName: order.customerName || null,
    customerEmail: order.customerEmail || null,
    customerPhone: order.customerPhone || null,
    shippingAddress: order.shippingAddress || null,
    shippingCity: order.shippingCity || null,
    shippingProvince: order.shippingProvince || null,
    shippingPostalCode: order.shippingPostalCode || null,
    notes: order.notes || null,
    currency: order.currency || null,
    exchange_rate: order.exchange_rate ?? null,
    total_ars: order.total_ars ?? null,
    payment_id: order.payment_id || null,
    payment_status: order.payment_status || null,
    payment_status_detail: order.payment_status_detail || null,
    preference_id: order.preference_id || null,
    expires_at: order.expires_at || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
        id: item.id,
        cardId: item.cardId,
        quantity: item.quantity,
        price: item.price,
      }))
      : [],
  };
}

async function createAdminAuditLog(tx, { actorId, entityType, entityId, action, req, routeKey, before, after, metadata } = {}) {
  await tx.adminAuditLog.create({
    data: {
      actorId: actorId ?? null,
      entityType,
      entityId: String(entityId ?? "unknown"),
      action,
      requestId: req.requestContext?.requestId || null,
      routeKey: routeKey || getRouteKey(req),
      before: safeJsonStringify(before),
      after: safeJsonStringify(after),
      metadata: safeJsonStringify(metadata),
    },
  });
}

function getExpectedUpdatedAtMap(payload) {
  const map = new Map();
  const resources = Array.isArray(payload?.resources) ? payload.resources : [];

  for (const resource of resources) {
    const id = Number(resource?.id);
    const expectedUpdatedAt = parseExpectedUpdatedAt(resource?.expected_updated_at ?? resource?.updated_at ?? null);
    if (Number.isFinite(id) && expectedUpdatedAt instanceof Date) {
      map.set(id, expectedUpdatedAt);
    }
  }

  return map;
}

function toContactRequestResponse(contactRequest) {
  return {
    id: contactRequest.id,
    name: contactRequest.name,
    email: contactRequest.email,
    subject: contactRequest.subject,
    message: contactRequest.message,
    admin_notes: contactRequest.adminNotes || "",
    response_message: contactRequest.responseMessage || "",
    status: String(contactRequest.status || ContactRequestStatus.NEW).toLowerCase(),
    source: contactRequest.source || "storefront",
    ip_address: contactRequest.ipAddress || null,
    user_agent: contactRequest.userAgent || null,
    responded_at: contactRequest.respondedAt || null,
    responded_by: contactRequest.respondedBy ? toUserResponse(contactRequest.respondedBy) : null,
    created_at: contactRequest.createdAt,
    updated_at: contactRequest.updatedAt,
  };
}

function toUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.fullName,
    phone: user.phone || null,
    avatar_url: user.avatarUrl || null,
    role: user.role,
    is_active: Boolean(user.isActive),
    last_login_at: user.lastLoginAt,
    last_login_ip: user.lastLoginIp || null,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

function toPublicUserResponse(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.fullName,
    avatar_url: user.avatarUrl || null,
  };
}

function toAddressResponse(address) {
  return {
    id: address.id,
    label: address.label,
    recipient_name: address.recipientName,
    phone: address.phone || null,
    line1: address.line1,
    line2: address.line2 || null,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode || null,
    zone: address.zone.toLowerCase(),
    notes: address.notes || null,
    is_default: Boolean(address.isDefault),
    created_at: address.createdAt,
    updated_at: address.updatedAt,
  };
}

function toActivityResponse(activity) {
  return {
    id: activity.id,
    action: activity.action,
    ip_address: activity.ipAddress || null,
    user_agent: activity.userAgent || null,
    details: activity.details || null,
    created_at: activity.createdAt,
  };
}

function buildAddressSummary(order) {
  if (order.shippingZone === ShippingZone.PICKUP) {
    return "Retiro por showroom";
  }

  return [order.shippingAddress, order.shippingCity, order.shippingProvince, order.shippingPostalCode]
    .filter(Boolean)
    .join(", ");
}

function toOrderResponse(order, cardsById, options = {}) {
  const includeAdminFields = Boolean(options.includeAdminFields);
  const trackingVisibleToUser = Boolean(order.trackingVisibleToUser && order.trackingCode && order.shippingZone !== ShippingZone.PICKUP);
  const items = order.items.map((item) => {
    const card = cardsById.get(item.cardId);
    return {
      id: item.id,
      card_id: item.cardId,
      quantity: item.quantity,
      price: item.price,
      subtotal: formatCurrency(item.price * item.quantity),
      card: card || null,
    };
  });

  return {
    id: order.id,
    subtotal: order.subtotal,
    shipping_cost: order.shippingCost,
    total: order.total,
    currency: order.currency || "ARS",
    exchange_rate: order.exchange_rate ?? null,
    total_ars: order.total_ars ?? null,
    status: order.status.toLowerCase(),
    counts_for_dashboard: isBillableStatus(order.status),
    processing_payment: order.status === OrderStatus.PENDING_PAYMENT
      && hasMercadoPagoPaymentAttempt(order)
      && isMercadoPagoProcessingStatus(order.payment_status),
    payment_id: includeAdminFields ? order.payment_id || null : null,
    payment_status: order.payment_status || null,
    payment_status_detail: order.payment_status_detail || null,
    preference_id: includeAdminFields ? order.preference_id || null : null,
    payment_approved_at: order.payment_approved_at || null,
    expires_at: order.expires_at || null,
    shipping_zone: order.shippingZone.toLowerCase(),
    shipping_label: order.shippingLabel,
    is_shipping_order: order.shippingZone !== ShippingZone.PICKUP,
    tracking_code: includeAdminFields ? order.trackingCode || null : trackingVisibleToUser ? order.trackingCode : null,
    tracking_visible_to_user: includeAdminFields ? Boolean(order.trackingVisibleToUser) : trackingVisibleToUser,
    customer_name: order.customerName || null,
    customer_email: order.customerEmail || null,
    customer_phone: order.customerPhone || null,
    shipping_address: buildAddressSummary(order),
    shipping_city: order.shippingCity || null,
    shipping_province: order.shippingProvince || null,
    shipping_postal_code: order.shippingPostalCode || null,
    notes: order.notes || null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    user: order.user ? (includeAdminFields ? toUserResponse(order.user) : toPublicUserResponse(order.user)) : null,
    address: order.address ? toAddressResponse(order.address) : null,
    items,
  };
}

function buildCustomCategoryTree(categories) {
  const byId = new Map();
  const roots = [];

  for (const category of categories) {
    byId.set(category.id, {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      image: category.image || null,
      is_visible: category.isVisible,
      sort_order: category.sortOrder,
      parent_id: category.parentId ?? null,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
      children: [],
    });
  }

  for (const category of categories) {
    const node = byId.get(category.id);
    const parentNode = category.parentId ? byId.get(category.parentId) : null;

    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }

      return left.name.localeCompare(right.name, "es");
    });

    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

function toCustomProductResponse(product) {
  const images = [...(product.images ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .map((image) => ({
      id: image.id,
      url: image.url,
      sort_order: image.sortOrder,
    }));

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description || "",
    price: product.price,
    is_visible: product.isVisible,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    image: images[0]?.url || null,
    images,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
          parent_id: product.category.parentId ?? null,
        }
      : null,
  };
}

function parseCustomCategoryPayload(payload) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const slug = slugify(typeof payload.slug === "string" && payload.slug.trim() ? payload.slug : name);

  if (!name) {
    return { error: "Category name is required" };
  }

  if (!slug) {
    return { error: "Category slug is required" };
  }

  const sortOrder = payload.sort_order !== undefined ? Number(payload.sort_order) : 0;

  if (!Number.isFinite(sortOrder)) {
    return { error: "Invalid category sort order" };
  }

  const parentId = payload.parent_id === null || payload.parent_id === undefined || payload.parent_id === ""
    ? null
    : Number(payload.parent_id);

  if (parentId !== null && !Number.isFinite(parentId)) {
    return { error: "Invalid parent category" };
  }

  return {
    data: {
      name,
      slug,
      description: typeof payload.description === "string" ? payload.description.trim() : "",
      image: typeof payload.image === "string" && payload.image.trim() ? payload.image.trim() : null,
      isVisible: payload.is_visible !== undefined ? Boolean(payload.is_visible) : true,
      sortOrder: Math.floor(sortOrder),
      parentId,
    },
  };
}

function parseCustomProductPayload(payload) {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const slug = slugify(typeof payload.slug === "string" && payload.slug.trim() ? payload.slug : title);
  const categoryId = Number(payload.category_id);
  const price = Number(payload.price);

  if (!title) {
    return { error: "Product title is required" };
  }

  if (!slug) {
    return { error: "Product slug is required" };
  }

  if (!Number.isFinite(categoryId)) {
    return { error: "Product category is required" };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { error: "Invalid product price" };
  }

  const rawImages = Array.isArray(payload.images)
    ? payload.images
    : typeof payload.images === "string"
      ? payload.images.split(/\r?\n|,/)
      : [];

  const images = rawImages
    .map((image) => String(image).trim())
    .filter(Boolean)
    .map((url, index) => ({ url, sortOrder: index }));

  return {
    data: {
      title,
      slug,
      description: typeof payload.description === "string" ? payload.description.trim() : "",
      price: Number(price.toFixed(2)),
      isVisible: payload.is_visible !== undefined ? Boolean(payload.is_visible) : true,
      categoryId,
      images,
    },
  };
}

async function assertValidCategoryParent(tx, categoryId, parentId) {
  if (parentId === null) {
    return true;
  }

  const parent = await tx.customCategory.findUnique({ where: { id: parentId } });

  if (!parent) {
    throw new Error("CUSTOM_CATEGORY_PARENT_NOT_FOUND");
  }

  if (categoryId !== null) {
    let cursor = parent;

    while (cursor) {
      if (cursor.id === categoryId) {
        throw new Error("CUSTOM_CATEGORY_CYCLE");
      }

      if (!cursor.parentId) {
        break;
      }

      cursor = await tx.customCategory.findUnique({ where: { id: cursor.parentId } });
    }
  }

  return true;
}

async function getCustomCategoryByPath(slugPath, { visibleOnly = true } = {}) {
  const segments = String(slugPath || "")
    .split("/")
    .map((segment) => slugify(segment))
    .filter(Boolean);

  if (!segments.length) {
    return null;
  }

  let parentId = null;
  let category = null;

  for (const slug of segments) {
    category = await prisma.customCategory.findFirst({
      where: {
        slug,
        parentId,
        ...(visibleOnly ? { isVisible: true } : {}),
      },
    });

    if (!category) {
      return null;
    }

    parentId = category.id;
  }

  return category;
}

function buildSearchWhere(query) {
  const trimmedQuery = typeof query === "string" ? query.trim() : "";

  if (!trimmedQuery) {
    return {};
  }

  return {
    OR: [
      { name: { contains: trimmedQuery, mode: "insensitive" } },
      { cardType: { contains: trimmedQuery, mode: "insensitive" } },
      { rarity: { contains: trimmedQuery, mode: "insensitive" } },
      { name: { startsWith: trimmedQuery, mode: "insensitive" } },
      { cardType: { startsWith: trimmedQuery, mode: "insensitive" } },
      { rarity: { startsWith: trimmedQuery, mode: "insensitive" } },
    ],
  };
}

function parseListParam(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildCategoryWhere(category) {
  if (!category) {
    return null;
  }

  const normalized = category.toLowerCase();

  if (normalized.includes("monster") || normalized.includes("monstruo")) {
    return { cardType: { contains: "Monster", mode: "insensitive" } };
  }

  if (normalized.includes("spell") || normalized.includes("magia")) {
    return { cardType: { contains: "Spell", mode: "insensitive" } };
  }

  if (normalized.includes("trap") || normalized.includes("trampa")) {
    return { cardType: { contains: "Trap", mode: "insensitive" } };
  }

  return null;
}

function buildConditionWhere(conditions) {
  if (!conditions.length) {
    return null;
  }

  const normalized = conditions.map((condition) => condition.toLowerCase());
  const wantsOutOfStock = normalized.includes("out of stock");
  const wantsAvailable = normalized.some((condition) => condition !== "out of stock");

  if (wantsOutOfStock && wantsAvailable) {
    return null;
  }

  if (wantsOutOfStock) {
    return { stock: { lte: 0 } };
  }

  if (wantsAvailable) {
    return { stock: { gt: 0 } };
  }

  return null;
}

function buildCardFilters(query, options = {}) {
  const minPrice = query.minPrice ? Number(query.minPrice) : undefined;
  const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const featuredOnly = query.featured === "true";
  const latestOnly = query.latest === "true";
  const rarities = parseListParam(query.rarities ?? query.rarity);
  const sets = parseListParam(query.sets ?? query.set);
  const conditions = parseListParam(query.conditions ?? query.condition);
  const cardTypes = parseListParam(query.cardTypes ?? query.cardType);
  const categoryWhere = buildCategoryWhere(typeof query.category === "string" ? query.category : "");
  const conditionWhere = buildConditionWhere(conditions);

  const and = [
    q ? buildSearchWhere(q) : null,
    categoryWhere,
    conditionWhere,
    cardTypes.length
      ? {
          OR: cardTypes.map((cardType) => ({
            cardType: { contains: cardType, mode: "insensitive" },
          })),
        }
      : null,
    rarities.length ? { rarity: { in: rarities } } : null,
    sets.length ? { setName: { in: sets } } : null,
    Number.isFinite(minPrice) || Number.isFinite(maxPrice)
      ? {
          price: {
            ...(Number.isFinite(minPrice) ? { gte: minPrice } : {}),
            ...(Number.isFinite(maxPrice) ? { lte: maxPrice } : {}),
          },
        }
      : null,
  ].filter(Boolean);

  return {
    where: {
      ...buildPublicCatalogBaseWhere(options),
      ...(featuredOnly ? { isFeatured: true } : {}),
      ...(latestOnly ? { isNewArrival: true } : {}),
      ...(and.length ? { AND: and } : {}),
    },
    orderBy: latestOnly
      ? [
          { isNewArrival: "desc" },
          { updatedAt: "desc" },
          { name: "asc" },
        ]
      : [
          { isFeatured: "desc" },
          { salesCount: "desc" },
          { name: "asc" },
        ],
  };
}

function invalidatePublicCatalogCaches() {
  void invalidatePublicCatalogCache();
}

function setAdminInventoryCacheHeaders(res) {
  res.set("Cache-Control", "private, max-age=300, stale-while-revalidate=60");
}

function setAdminCatalogWeakCacheHeaders(res) {
  res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=15");
}

function buildCatalogVersion(total, updatedAt) {
  const updatedAtMs = updatedAt instanceof Date ? updatedAt.getTime() : 0;
  return `v${total}-${updatedAtMs}`;
}

function setPublicCatalogCacheHeaders(res) {
  const browserMaxAge = process.env.NODE_ENV === "production" ? 0 : PUBLIC_CARD_LIST_CACHE_TTL_SECONDS;
  res.set("Cache-Control", `public, max-age=${browserMaxAge}, must-revalidate`);
  res.set("CDN-Cache-Control", `public, s-maxage=${PUBLIC_CARD_LIST_CACHE_TTL_SECONDS}, stale-while-revalidate=300`);
  res.set("Vercel-CDN-Cache-Control", `public, s-maxage=${PUBLIC_CARD_LIST_CACHE_TTL_SECONDS}, stale-while-revalidate=300`);
}

function setPublicFiltersCacheHeaders(res) {
  const browserMaxAge = process.env.NODE_ENV === "production" ? 0 : PUBLIC_CARD_FILTERS_CACHE_TTL_SECONDS;
  res.set("Cache-Control", `public, max-age=${browserMaxAge}, must-revalidate`);
  res.set("CDN-Cache-Control", `public, s-maxage=${PUBLIC_CARD_FILTERS_CACHE_TTL_SECONDS}, stale-while-revalidate=86400`);
  res.set("Vercel-CDN-Cache-Control", `public, s-maxage=${PUBLIC_CARD_FILTERS_CACHE_TTL_SECONDS}, stale-while-revalidate=86400`);
}

function setPublicCardDetailCacheHeaders(res) {
  const browserMaxAge = process.env.NODE_ENV === "production" ? 0 : PUBLIC_CARD_DETAIL_CACHE_TTL_SECONDS;
  res.set("Cache-Control", `public, max-age=${browserMaxAge}, must-revalidate`);
  res.set("CDN-Cache-Control", `public, s-maxage=${PUBLIC_CARD_DETAIL_CACHE_TTL_SECONDS}, stale-while-revalidate=1800`);
  res.set("Vercel-CDN-Cache-Control", `public, s-maxage=${PUBLIC_CARD_DETAIL_CACHE_TTL_SECONDS}, stale-while-revalidate=1800`);
}

function buildPublicCardListCacheKey(query, searchOverride) {
  const segments = ["scope=stock"];

  Object.entries(query)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .forEach(([key, value]) => {
      if (searchOverride !== undefined && key === "q") {
        return;
      }

      if (Array.isArray(value)) {
        value
          .map((entry) => String(entry))
          .sort((left, right) => left.localeCompare(right))
          .forEach((entry) => {
            if (entry) {
              segments.push(`${encodeURIComponent(key)}=${encodeURIComponent(entry)}`);
            }
          });
        return;
      }

      if (value !== undefined && value !== null && value !== "") {
        segments.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    });

  if (searchOverride !== undefined) {
    segments.push(`q=${encodeURIComponent(String(searchOverride))}`);
  }

  return `${PUBLIC_CARD_LIST_CACHE_PREFIX}:${segments.join(":") || "default"}`;
}

function buildPublicCatalogBaseWhere(options = {}) {
  return {
    isVisible: true,
    ...(options.stockOnly === false ? {} : { stock: { gt: 0 } }),
  };
}

async function getPublicCardFilters(options = {}) {
  const expectedScope = options.stockOnly === false ? "visible" : "stock";

  return cacheGetOrFetch(PUBLIC_CARD_FILTERS_CACHE_KEY, PUBLIC_CARD_FILTERS_CACHE_TTL_SECONDS, async () => {
    const baseWhere = buildPublicCatalogBaseWhere(options);

    const [rarityRows, setRows] = await Promise.all([
      prisma.card.findMany({
        where: baseWhere,
        select: { rarity: true },
        distinct: ["rarity"],
        orderBy: { rarity: "asc" },
      }),
      prisma.card.findMany({
        where: baseWhere,
        select: { setName: true },
        distinct: ["setName"],
        orderBy: { setName: "asc" },
      }),
    ]);

    return {
      scope: expectedScope,
      value: {
        rarities: rarityRows.map((card) => card.rarity).filter(Boolean),
        sets: setRows.map((card) => card.setName).filter(Boolean),
      },
    };
  }).then((result) => result?.value ?? { rarities: [], sets: [] });
}

async function listPublicCards(req, res, searchOverride, options = {}) {
  setPublicCatalogCacheHeaders(res);

  const cacheKey = buildPublicCardListCacheKey(req.query, searchOverride);
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));
  const filters = buildCardFilters({
    ...req.query,
    ...(searchOverride !== undefined ? { q: searchOverride } : {}),
  }, options);

  const includeFilterMetadata = req.query.featured !== "true" && req.query.latest !== "true";

  const responsePayload = await cacheGetOrFetch(cacheKey, PUBLIC_CARD_LIST_CACHE_TTL_SECONDS, async () => {
    const [total, cards, filterOptions, versionAggregate] = await Promise.all([
      prisma.card.count({ where: filters.where }),
      prisma.card.findMany({
        where: filters.where,
        orderBy: filters.orderBy,
        select: PUBLIC_CARD_LIST_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      includeFilterMetadata ? getPublicCardFilters(options) : Promise.resolve({ rarities: [], sets: [] }),
      prisma.card.aggregate({
        where: filters.where,
        _max: { updatedAt: true },
      }),
    ]);

    return {
      cards: attachMetadata(cards),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      filters: filterOptions,
      version: buildCatalogVersion(total, versionAggregate._max.updatedAt),
    };
  });

  res.json(responsePayload);
}

function parseAdminCardUpdatePayload(payload) {
  const data = {};

  if (payload.price !== undefined) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) {
      return { error: "Invalid price" };
    }
    data.price = Number(price.toFixed(2));
  }

  if (payload.stock !== undefined) {
    const stock = Number(payload.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      return { error: "Invalid stock" };
    }
    data.stock = Math.floor(stock);
  }

  if (payload.low_stock_threshold !== undefined) {
    const threshold = Number(payload.low_stock_threshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      return { error: "Invalid low stock threshold" };
    }
    data.lowStockThreshold = Math.floor(threshold);
  }

  if (payload.is_visible !== undefined) {
    data.isVisible = Boolean(payload.is_visible);
  }

  if (payload.is_featured !== undefined) {
    data.isFeatured = Boolean(payload.is_featured);
  }

  if (payload.is_new_arrival !== undefined) {
    data.isNewArrival = Boolean(payload.is_new_arrival);
  }

  if (Object.keys(data).length === 0) {
    return { error: "No valid fields to update" };
  }

  return { data };
}

function serializeCardPriceHistory(entry) {
  return {
    id: entry.id,
    previous_price: entry.previousPrice,
    next_price: entry.nextPrice,
    source: entry.source,
    created_at: entry.createdAt,
  };
}

function serializeCardStockHistory(entry) {
  return {
    id: entry.id,
    previous_stock: entry.previousStock,
    next_stock: entry.nextStock,
    source: entry.source,
    created_at: entry.createdAt,
  };
}

async function recordCardHistoryEntries(tx, cards, updates, source = "admin") {
  const priceHistoryRows = [];
  const stockHistoryRows = [];

  for (const card of cards) {
    if (updates.price !== undefined && Number(card.price) !== Number(updates.price)) {
      priceHistoryRows.push({
        cardId: card.id,
        previousPrice: Number(card.price),
        nextPrice: Number(updates.price),
        source,
      });
    }

    if (updates.stock !== undefined && Number(card.stock) !== Number(updates.stock)) {
      stockHistoryRows.push({
        cardId: card.id,
        previousStock: Number(card.stock),
        nextStock: Number(updates.stock),
        source,
      });
    }
  }

  if (priceHistoryRows.length) {
    await tx.cardPriceHistory.createMany({ data: priceHistoryRows });
  }

  if (stockHistoryRows.length) {
    await tx.cardStockHistory.createMany({ data: stockHistoryRows });
  }
}

function parseAdminOrderShippingPayload(payload) {
  const data = {};

  if (payload.tracking_code !== undefined) {
    const trackingCode = typeof payload.tracking_code === "string" ? payload.tracking_code.trim() : "";
    data.trackingCode = trackingCode || null;
  }

  if (payload.tracking_visible_to_user !== undefined) {
    data.trackingVisibleToUser = Boolean(payload.tracking_visible_to_user);
  }

  if (Object.keys(data).length === 0) {
    return { error: "No valid shipping fields to update" };
  }

  if (!data.trackingCode) {
    data.trackingVisibleToUser = false;
  }

  return { data };
}

async function getOrderCardsMap(orders, options = {}) {
  const cardIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.cardId)))];
  if (cardIds.length === 0) {
    return new Map();
  }

  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
  });

  const enrichedCards = attachMetadata(cards, options);
  return new Map(enrichedCards.map((card) => [card.id, card]));
}

async function rollbackOrderEffects(tx, order) {
  for (const item of order.items) {
    if (isBillableStatus(order.status)) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { salesCount: { decrement: item.quantity } },
      });
    }

    if (order.status !== OrderStatus.CANCELLED) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }
}

async function lockOrderForUpdate(tx, orderId) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

async function reserveStockForOrder(tx, order) {
  const cardIds = [...new Set(order.items.map((item) => item.cardId))];
  const cards = await tx.card.findMany({ where: { id: { in: cardIds } } });
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  for (const item of order.items) {
    const card = cardsById.get(item.cardId);
    if (!card || !card.isVisible) {
      throw createAppError("Hay cartas del pedido que ya no están disponibles", {
        statusCode: 409,
        code: "CARD_UNAVAILABLE",
        unavailableCardIds: [item.cardId],
      });
    }

    // Atomic stock reservation: decrement only if stock >= quantity (prevents overselling)
    const updated = await tx.card.updateMany({
      where: { id: item.cardId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });

    if (updated.count === 0) {
      throw createAppError(`Insufficient stock for ${card.name}`, {
        statusCode: 409,
        code: "INSUFFICIENT_STOCK",
        unavailableCardIds: [item.cardId],
      });
    }
  }
}

async function updateOrderStatusWithEffects(tx, order, nextStatus, extraData = {}) {
  const wasBillable = isBillableStatus(order.status);
  const willBeBillable = isBillableStatus(nextStatus);
  const releasesReservation = [OrderStatus.CANCELLED, OrderStatus.EXPIRED].includes(nextStatus)
    && ![OrderStatus.CANCELLED, OrderStatus.EXPIRED].includes(order.status);

  for (const item of order.items) {
    if (!wasBillable && willBeBillable) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { salesCount: { increment: item.quantity } },
      });
    }

    if (wasBillable && !willBeBillable) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { salesCount: { decrement: item.quantity } },
      });
    }

    if (releasesReservation) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  return tx.order.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      ...extraData,
    },
    include: { items: true, user: true, address: true },
  });
}

function buildOrderStatusPostCommitEffect(order, nextStatus) {
  return {
    orderId: order.id,
    previousStatus: order.status,
    nextStatus,
    releasesReservation: [OrderStatus.CANCELLED, OrderStatus.EXPIRED].includes(nextStatus)
      && ![OrderStatus.CANCELLED, OrderStatus.EXPIRED].includes(order.status),
    items: order.items.map((item) => ({
      cardId: item.cardId,
      quantity: item.quantity,
    })),
  };
}

async function applyOrderStatusPostCommitEffect(effect) {
  if (!effect) {
    return;
  }

  if (effect.items.length) {
    await invalidateOrderRelatedCache(effect.items);
  }

  publishEvent("order-update", {
    orderId: effect.orderId,
    previousStatus: effect.previousStatus,
    newStatus: effect.nextStatus,
  });

  if (effect.releasesReservation) {
    // scheduleStockUpdate removed — stock is atomic in DB, cache invalidation above
  }
}

async function expirePendingOrders({ orderIds = null, source = "system", requestId = null, batchSize = 5 } = {}) {
  const now = new Date();

  const candidateOrders = await withDatabaseConnection(() => prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.FAILED] },
      expires_at: { not: null, lte: now },
      ...(Array.isArray(orderIds) && orderIds.length ? { id: { in: orderIds } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    ...(!Array.isArray(orderIds) || orderIds.length === 0 ? { take: batchSize } : {}),
  }), { maxWaitMs: 5000 });

  const expired = [];

  for (const candidateOrder of candidateOrders) {
    const expiredOutcome = await withDatabaseConnection(() => prisma.$transaction(async (tx) => {
      await lockOrderForUpdate(tx, candidateOrder.id);

      const lockedOrder = await tx.order.findUnique({
        where: { id: candidateOrder.id },
        include: { items: true, user: true, address: true },
      });

      if (!lockedOrder || ![OrderStatus.PENDING_PAYMENT, OrderStatus.FAILED].includes(lockedOrder.status) || !lockedOrder.expires_at || lockedOrder.expires_at > now) {
        return null;
      }

      await updateOrderStatusWithEffects(tx, lockedOrder, OrderStatus.EXPIRED, {
        payment_status: lockedOrder.payment_status || "expired",
        payment_status_detail: lockedOrder.payment_status_detail || "expired_order",
      });

      return {
        orderId: lockedOrder.id,
        postCommitEffect: buildOrderStatusPostCommitEffect(lockedOrder, OrderStatus.EXPIRED),
      };
    }), { maxWaitMs: 5000 });

    if (expiredOutcome?.orderId) {
      expired.push(expiredOutcome.orderId);
      await applyOrderStatusPostCommitEffect(expiredOutcome.postCommitEffect);
    }
  }

  if (expired.length > 0) {
    console.info("Expired pending orders released", {
      requestId,
      source,
      orderIds: expired,
      count: expired.length,
    });
  }

  return {
    count: expired.length,
    orderIds: expired,
  };
}

function isPrismaTransactionStartTimeout(error) {
  return error?.code === "P2028";
}

async function expirePendingOrdersBestEffort(options = {}) {
  try {
    return await expirePendingOrders(options);
  } catch (error) {
    if (!isPrismaTransactionStartTimeout(error)) {
      throw error;
    }

    console.warn("Skipping pending-order expiration after transaction timeout", {
      requestId: options.requestId || null,
      source: options.source || "system",
      orderIds: Array.isArray(options.orderIds) ? options.orderIds : null,
      code: error.code,
      message: error.message,
    });

    return {
      count: 0,
      orderIds: [],
      skipped: true,
    };
  }
}

async function recordActivity(userId, action, req, details) {
  await prisma.userActivity.create({
    data: {
      userId: userId ?? null,
      action,
      ipAddress: extractIp(req),
      userAgent: req.headers["user-agent"] || null,
      details: safeJsonStringify(details),
    },
  });
}

async function prepareOrderForPreference(req, { orderId, userId }) {
  await expirePendingOrders({
    orderIds: [orderId],
    source: "checkout_prepare_preference",
    requestId: req.requestContext?.requestId || null,
  });

  const existingOrder = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(Number.isFinite(userId) ? { userId } : {}),
    },
    include: { items: true, user: true, address: true },
  });

  if (!existingOrder) {
    throw createAppError("Order not found", {
      statusCode: 404,
      code: "ORDER_NOT_FOUND",
    });
  }

  if (isBillableStatus(existingOrder.status)) {
    throw createAppError("Order is already paid", {
      statusCode: 409,
      code: "ORDER_ALREADY_PAID",
    });
  }

  if ([OrderStatus.CANCELLED, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(existingOrder.status)) {
    throw createAppError("Order cannot restart Checkout Pro from the current state", {
      statusCode: 409,
      code: "ORDER_NOT_RETRYABLE",
    });
  }

  const exchangeRate = await getUsdToArsRate();
  const totalArs = formatCurrency(existingOrder.total * exchangeRate);
  const expiresAt = buildCheckoutExpirationDate();

  const preparedOrderResult = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, orderId);
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        ...(Number.isFinite(userId) ? { userId } : {}),
      },
      include: { items: true, user: true, address: true },
    });

    if (!order) {
      throw createAppError("Order not found", {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    if (isBillableStatus(order.status)) {
      throw createAppError("Order is already paid", {
        statusCode: 409,
        code: "ORDER_ALREADY_PAID",
      });
    }

    if ([OrderStatus.CANCELLED, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(order.status)) {
      throw createAppError("Order cannot restart Checkout Pro from the current state", {
        statusCode: 409,
        code: "ORDER_NOT_RETRYABLE",
      });
    }

    const shouldReserveStock = [OrderStatus.FAILED, OrderStatus.EXPIRED].includes(order.status);
    if (shouldReserveStock) {
      await reserveStockForOrder(tx, order);
    }

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PENDING_PAYMENT,
        currency: "ARS",
        exchange_rate: exchangeRate,
        total_ars: totalArs,
        expires_at: expiresAt,
        payment_id: null,
        payment_status: null,
        payment_status_detail: null,
        preference_id: null,
        payment_approved_at: null,
      },
      include: { items: true, user: true, address: true },
    });
  });

  return {
    order: preparedOrderResult,
    exchangeRate,
    totalArs,
    expiresAt,
  };
}

async function prepareOrderForDirectPayment(req, { orderId, userId }) {
  await expirePendingOrders({
    orderIds: [orderId],
    source: "payments_create",
    requestId: req.requestContext?.requestId || null,
  });

  const existingOrder = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(Number.isFinite(userId) ? { userId } : {}),
    },
    include: { items: true, user: true, address: true },
  });

  if (!existingOrder) {
    throw createAppError("Order not found", {
      statusCode: 404,
      code: "ORDER_NOT_FOUND",
    });
  }

  if (isBillableStatus(existingOrder.status)) {
    throw createAppError("Order is already paid", {
      statusCode: 409,
      code: "ORDER_ALREADY_PAID",
    });
  }

  if ([OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(existingOrder.status)) {
    throw createAppError("Order cannot be paid from the current state", {
      statusCode: 409,
      code: "ORDER_NOT_PAYABLE",
    });
  }

  if (!isOrderPayableStatus(existingOrder.status)) {
    throw createAppError("Order cannot be paid from the current state", {
      statusCode: 409,
      code: "ORDER_NOT_PAYABLE",
    });
  }

  const exchangeRate = existingOrder.exchange_rate || await getUsdToArsRate();
  const totalArs = formatCurrency(existingOrder.total_ars ?? (existingOrder.total * exchangeRate));
  const expiresAt = existingOrder.expires_at || buildCheckoutExpirationDate(existingOrder.createdAt?.getTime?.() || Date.now());

  const preparedOrderResult = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, orderId);
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        ...(Number.isFinite(userId) ? { userId } : {}),
      },
      include: { items: true, user: true, address: true },
    });

    if (!order) {
      throw createAppError("Order not found", {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    if (isBillableStatus(order.status)) {
      throw createAppError("Order is already paid", {
        statusCode: 409,
        code: "ORDER_ALREADY_PAID",
      });
    }

    if ([OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(order.status)) {
      throw createAppError("Order cannot be paid from the current state", {
        statusCode: 409,
        code: "ORDER_NOT_PAYABLE",
      });
    }

    if (order.expires_at && order.expires_at <= new Date()) {
      const expiredOrder = await updateOrderStatusWithEffects(tx, order, OrderStatus.EXPIRED, {
        payment_status: order.payment_status || "expired",
        payment_status_detail: order.payment_status_detail || "expired_order",
      });

      return {
        expiredOrder,
        postCommitEffect: buildOrderStatusPostCommitEffect(order, OrderStatus.EXPIRED),
      };
    }

    if (!isOrderPayableStatus(order.status)) {
      throw createAppError("Order cannot be paid from the current state", {
        statusCode: 409,
        code: "ORDER_NOT_PAYABLE",
      });
    }

    if (order.payment_id && isMercadoPagoProcessingStatus(order.payment_status)) {
      throw createAppError("Order already has a payment in progress", {
        statusCode: 409,
        code: "PAYMENT_ALREADY_PROCESSING",
      });
    }

    return {
      order,
      postCommitEffect: null,
    };
  });

  if (preparedOrderResult?.expiredOrder) {
    await applyOrderStatusPostCommitEffect(preparedOrderResult.postCommitEffect);

    throw createAppError("Order has expired", {
      statusCode: 409,
      code: "ORDER_EXPIRED",
      details: {
        order: preparedOrderResult.expiredOrder.id,
      },
    });
  }

  return {
    order: preparedOrderResult.order,
    exchangeRate,
    totalArs,
    expiresAt,
  };
}

async function persistDirectPaymentAttempt(req, { orderId, userId, paymentId, paymentStatus, paymentStatusDetail, exchangeRate, totalArs, expiresAt }) {
  const result = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, orderId);
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        ...(Number.isFinite(userId) ? { userId } : {}),
      },
      include: { items: true, user: true, address: true },
    });

    if (!order) {
      throw createAppError("Order not found", {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    const updatedOrder = await updateOrderStatusWithEffects(tx, order, OrderStatus.PENDING_PAYMENT, {
      currency: "ARS",
      exchange_rate: exchangeRate,
      total_ars: totalArs,
      expires_at: expiresAt,
      payment_id: paymentId,
      payment_status: paymentStatus || order.payment_status || null,
      payment_status_detail: paymentStatusDetail || order.payment_status_detail || null,
      payment_approved_at: null,
      preference_id: null,
    });
    return {
      order: updatedOrder,
      postCommitEffect: buildOrderStatusPostCommitEffect(order, OrderStatus.PENDING_PAYMENT),
    };
  });

  await applyOrderStatusPostCommitEffect(result.postCommitEffect);
  return result.order;
}

async function persistDirectPaymentProviderFailure(req, { orderId, userId, paymentStatusDetail, exchangeRate, totalArs, expiresAt }) {
  const result = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, orderId);
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        ...(Number.isFinite(userId) ? { userId } : {}),
      },
      include: { items: true, user: true, address: true },
    });

    if (!order) {
      throw createAppError("Order not found", {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    const updatedOrder = await updateOrderStatusWithEffects(tx, order, OrderStatus.FAILED, {
      currency: "ARS",
      exchange_rate: exchangeRate,
      total_ars: totalArs,
      expires_at: expiresAt,
      payment_id: null,
      payment_status: "rejected",
      payment_status_detail: paymentStatusDetail || order.payment_status_detail || "payment_create_rejected",
      payment_approved_at: null,
      preference_id: null,
    });
    return {
      order: updatedOrder,
      postCommitEffect: buildOrderStatusPostCommitEffect(order, OrderStatus.FAILED),
    };
  });

  await applyOrderStatusPostCommitEffect(result.postCommitEffect);
  return result.order;
}

async function createCheckoutPreferenceForOrder(req, { orderId, userId }) {
  assertMercadoPagoCheckoutConfigured();

  const prepared = await prepareOrderForPreference(req, { orderId, userId });
  const preferenceCardsById = await getOrderCardsMap([prepared.order]);
  const mercadoPagoAccount = await getMercadoPagoAccountDetails();
  const useSandboxCheckout = shouldUseMercadoPagoSandbox(mercadoPagoAccount);
  const notificationUrl = buildMercadoPagoNotificationUrl({
    useSandboxWebhook: shouldUseMercadoPagoSandboxWebhook(mercadoPagoAccount),
  });
  const preferenceItems = alignMercadoPagoItemsTotal(
    buildMercadoPagoPreferenceItems(prepared.order, preferenceCardsById, prepared.exchangeRate),
    prepared.totalArs
  );
  const preferencePayload = {
    items: preferenceItems,
    external_reference: String(prepared.order.id),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    back_urls: {
      success: buildCheckoutBackUrl("success", prepared.order.id),
      failure: buildCheckoutBackUrl("failure", prepared.order.id),
      pending: buildCheckoutBackUrl("pending", prepared.order.id),
    },
    auto_return: "approved",
    statement_descriptor: "DUELVAULT",
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: prepared.expiresAt.toISOString(),
    payer: resolveMercadoPagoPayer(prepared.order),
    metadata: {
      order_id: prepared.order.id,
      request_id: req.requestContext?.requestId || null,
      checkout_mode: useSandboxCheckout ? "sandbox" : "production",
    },
  };

  const preferenceResponse = await mercadoPagoPreferenceClient.create({ body: preferencePayload });
  const preference = unwrapMercadoPagoBody(preferenceResponse);
  const initPoint = resolveMercadoPagoCheckoutUrl(preference, { useSandbox: useSandboxCheckout });

  if (!initPoint) {
    throw createAppError("Mercado Pago preference did not return init_point", {
      statusCode: 502,
      code: "CHECKOUT_PREFERENCE_INVALID",
    });
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, prepared.order.id);
    return tx.order.update({
      where: { id: prepared.order.id },
      data: {
        preference_id: preference?.id ? String(preference.id) : null,
      },
      include: { items: true, user: true, address: true },
    });
  });

  const cardsById = await getOrderCardsMap([updatedOrder]);
  return {
    order: updatedOrder,
    cardsById,
    initPoint,
    checkoutMode: useSandboxCheckout ? "sandbox" : "production",
    exchangeRate: prepared.exchangeRate,
    totalArs: prepared.totalArs,
    expiresAt: prepared.expiresAt,
  };
}

function assertCronAuthorized(req) {
  if (!CRON_SECRET) {
    throw createAppError("CRON_SECRET is required to run the order expiration handler", {
      statusCode: 503,
      code: "CRON_SECRET_NOT_CONFIGURED",
    });
  }

  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    throw createAppError("Unauthorized cron invocation", {
      statusCode: 401,
      code: "CRON_UNAUTHORIZED",
    });
  }
}

function sendConcurrencyConflict(res, { error, currentResource, context = null, canOverrideConflict = false, requestId = null }) {
  res.status(409).json({
    error,
    code: "CONFLICT",
    requestId,
    current_updated_at: currentResource?.updated_at || currentResource?.updatedAt || null,
    current_resource: currentResource || null,
    context,
    can_override_conflict: canOverrideConflict,
  });
}

async function createSession(user, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, `${Date.now()}-${user.id}`);
  const ip = req ? extractIp(req) : null;

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      ...toUserResponse(user),
      last_login_at: new Date(),
      last_login_ip: ip,
    },
  };
}

function toAdminSessionPayload(session) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    admin: session.user,
  };
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function findUserByIdentifier(identifier) {
  const normalizedEmail = normalizeEmail(identifier);
  const normalizedUsername = normalizeUsername(identifier);

  return prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { username: normalizedUsername },
      ],
    },
  });
}

function parseAddressPayload(payload, { requireRecipient = true, requireLines = true } = {}) {
  const label = typeof payload.label === "string" && payload.label.trim() ? payload.label.trim() : "Principal";
  const recipientName = typeof payload.recipient_name === "string" ? payload.recipient_name.trim() : "";
  const line1 = typeof payload.line1 === "string" ? payload.line1.trim() : "";
  const city = typeof payload.city === "string" ? payload.city.trim() : "";
  const state = typeof payload.state === "string" && payload.state.trim() ? payload.state.trim() : "Buenos Aires";
  const zone = normalizeShippingZone(payload.zone || payload.shipping_zone) || null;

  if (requireRecipient && !recipientName) {
    return { error: "Recipient name is required" };
  }

  if (requireLines && !line1) {
    return { error: "Address line is required" };
  }

  if (requireLines && !city) {
    return { error: "City is required" };
  }

  if (!zone) {
    return { error: "Shipping zone is required" };
  }

  return {
    data: {
      label,
      recipientName,
      phone: typeof payload.phone === "string" && payload.phone.trim() ? payload.phone.trim() : null,
      line1,
      line2: typeof payload.line2 === "string" && payload.line2.trim() ? payload.line2.trim() : null,
      city,
      state,
      postalCode: typeof payload.postal_code === "string" && payload.postal_code.trim() ? payload.postal_code.trim() : null,
      zone,
      notes: typeof payload.notes === "string" && payload.notes.trim() ? payload.notes.trim() : null,
      isDefault: Boolean(payload.is_default),
    },
  };
}

async function ensureAddressOwnership(userId, addressId) {
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      userId,
    },
  });

  if (!address) {
    throw new Error("ADDRESS_NOT_FOUND");
  }

  return address;
}

async function buildCheckoutAddress(tx, userId, payload, fallbackPhone) {
  const shippingZone = normalizeShippingZone(payload.shippingZone || payload.shipping_zone) || ShippingZone.PICKUP;

  if (shippingZone === ShippingZone.PICKUP) {
    return {
      shippingZone,
      shipping: getShippingInfo(shippingZone),
      addressId: null,
      snapshot: {
        customerPhone: fallbackPhone,
        shippingAddress: null,
        shippingCity: null,
        shippingProvince: null,
        shippingPostalCode: null,
      },
    };
  }

  if (payload.addressId !== undefined && payload.addressId !== null && payload.addressId !== "") {
    const address = await ensureAddressOwnership(userId, Number(payload.addressId));
    const shipping = getShippingInfo(address.zone);
    return {
      shippingZone: address.zone,
      shipping,
      addressId: address.id,
      snapshot: {
        customerPhone: fallbackPhone || address.phone || null,
        shippingAddress: [address.line1, address.line2].filter(Boolean).join(", "),
        shippingCity: address.city,
        shippingProvince: address.state,
        shippingPostalCode: address.postalCode || null,
      },
    };
  }

  const parsedAddress = parseAddressPayload(payload.address || payload, { requireRecipient: true, requireLines: true });
  if (parsedAddress.error) {
    throw new Error(parsedAddress.error);
  }

  const addressData = parsedAddress.data;
  const shipping = getShippingInfo(addressData.zone);
  let addressId = null;

  if (payload.save_address) {
    if (addressData.isDefault) {
      await tx.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const createdAddress = await tx.address.create({
      data: {
        userId,
        ...addressData,
      },
    });
    addressId = createdAddress.id;
  }

  return {
    shippingZone: addressData.zone,
    shipping,
    addressId,
    snapshot: {
      customerPhone: fallbackPhone || addressData.phone || null,
      shippingAddress: [addressData.line1, addressData.line2].filter(Boolean).join(", "),
      shippingCity: addressData.city,
      shippingProvince: addressData.state,
      shippingPostalCode: addressData.postalCode || null,
    },
  };
}

function parseRegisterPayload(payload) {
  const email = normalizeEmail(payload.email);
  const username = normalizeUsername(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword = typeof payload.confirm_password === "string" ? payload.confirm_password : "";
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";

  if (!email || !email.includes("@")) {
    return { error: "Valid email is required" };
  }

  if (!username || username.length < 3) {
    return { error: "Username must be at least 3 characters" };
  }

  if (!fullName) {
    return { error: "Full name is required" };
  }

  if (!phone) {
    return { error: "WhatsApp number is required" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  if (confirmPassword !== "" && confirmPassword !== password) {
    return { error: "Passwords do not match" };
  }

  return {
    data: {
      email,
      username,
      password,
      fullName,
      phone,
      avatarUrl: typeof payload.avatar_url === "string" && payload.avatar_url.trim() ? payload.avatar_url.trim() : null,
    },
  };
}

function parseProfilePayload(payload) {
  const updates = {};

  if (payload.email !== undefined) {
    const email = normalizeEmail(payload.email);
    if (!email || !email.includes("@")) {
      return { error: "Valid email is required" };
    }
    updates.email = email;
  }

  if (payload.username !== undefined) {
    const username = normalizeUsername(payload.username);
    if (!username || username.length < 3) {
      return { error: "Username must be at least 3 characters" };
    }
    updates.username = username;
  }

  if (payload.full_name !== undefined) {
    const fullName = String(payload.full_name || "").trim();
    if (!fullName) {
      return { error: "Full name is required" };
    }
    updates.fullName = fullName;
  }

  if (payload.phone !== undefined) {
    updates.phone = typeof payload.phone === "string" && payload.phone.trim() ? payload.phone.trim() : null;
  }

  if (payload.avatar_url !== undefined) {
    updates.avatarUrl = typeof payload.avatar_url === "string" && payload.avatar_url.trim() ? payload.avatar_url.trim() : null;
  }

  if (!Object.keys(updates).length) {
    return { error: "No valid fields to update" };
  }

  return { data: updates };
}

function normalizeWhatsappNumber(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[^\d]/g, "").trim();
}

const PUBLIC_STOREFRONT_CONFIG_CACHE_MS = 30 * 1000;
const publicStorefrontConfigState = {
  snapshot: null,
  checkedAt: 0,
  inflight: null,
};

function invalidatePublicStorefrontConfigCache() {
  publicStorefrontConfigState.snapshot = null;
  publicStorefrontConfigState.checkedAt = 0;
  publicStorefrontConfigState.inflight = null;
}

async function getAppSetting(key, fallbackValue = "") {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting?.value ?? fallbackValue;
}

async function _setAppSetting(key, value) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function _getAppSettingFromClient(db, key, fallbackValue = "") {
  const setting = await db.appSetting.findUnique({ where: { key } });
  return setting?.value ?? fallbackValue;
}

async function _setAppSettingForClient(db, key, value) {
  return db.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

function parsePositiveInteger(value, fallbackValue, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function buildPagination(page, pageSize, total) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

function parseAdminRoleFilter(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "ALL") {
    return null;
  }

  return Object.values(UserRole).includes(normalized) ? normalized : "INVALID_ROLE_FILTER";
}

function parseAdminOrderStatusFilter(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "ALL") {
    return null;
  }

  return Object.values(OrderStatus).includes(normalized) ? normalized : "INVALID_STATUS_FILTER";
}

function buildAdminUsersWhere({ search, role }) {
  const trimmedSearch = String(search || "").trim();
  const filters = [];

  if (role) {
    filters.push({ role });
  }

  if (trimmedSearch) {
    filters.push({
      OR: [
        { fullName: { contains: trimmedSearch, mode: "insensitive" } },
        { username: { contains: trimmedSearch, mode: "insensitive" } },
        { email: { contains: trimmedSearch, mode: "insensitive" } },
        { phone: { contains: trimmedSearch, mode: "insensitive" } },
      ],
    });
  }

  return filters.length ? { AND: filters } : {};
}

function buildAdminOrdersWhere({ search, status }) {
  const trimmedSearch = String(search || "").trim();
  const filters = [];

  if (status) {
    filters.push({ status });
  }

  if (trimmedSearch) {
    const numericOrderId = Number(trimmedSearch);
    const searchFilters = [
      { customerName: { contains: trimmedSearch, mode: "insensitive" } },
      { customerEmail: { contains: trimmedSearch, mode: "insensitive" } },
      { customerPhone: { contains: trimmedSearch, mode: "insensitive" } },
      { shippingAddress: { contains: trimmedSearch, mode: "insensitive" } },
      { user: { is: { fullName: { contains: trimmedSearch, mode: "insensitive" } } } },
      { user: { is: { email: { contains: trimmedSearch, mode: "insensitive" } } } },
      { items: { some: { card: { name: { contains: trimmedSearch, mode: "insensitive" } } } } },
    ];

    if (Number.isFinite(numericOrderId)) {
      searchFilters.push({ id: numericOrderId });
    }

    filters.push({ OR: searchFilters });
  }

  return filters.length ? { AND: filters } : {};
}

async function authenticateSessionUser({ identifier, password, allowedRoles = null }) {
  const user = await findUserByIdentifier(identifier);
  const hasAllowedRole = !Array.isArray(allowedRoles) || allowedRoles.includes(user?.role);

  if (!user || !user.isActive || !hasAllowedRole) {
    throw createAppError("Credenciales inválidas", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw createAppError("Credenciales inválidas", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  return user;
}

async function resolveRefreshSessionUser({ refreshToken, allowedRoles = null }) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.type !== "refresh") {
      throw createAppError("Refresh token expired", {
        statusCode: 401,
        code: "REFRESH_TOKEN_EXPIRED",
      });
    }
  } catch (error) {
    if (error?.statusCode) {
      throw error;
    }

    throw createAppError("Refresh token expired", {
      statusCode: 401,
      code: "REFRESH_TOKEN_EXPIRED",
    });
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  const hasAllowedRole = !Array.isArray(allowedRoles) || allowedRoles.includes(storedToken?.user?.role);

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date() || !storedToken.user?.isActive || !hasAllowedRole) {
    throw createAppError("Refresh token expired", {
      statusCode: 401,
      code: "REFRESH_TOKEN_EXPIRED",
    });
  }

  return storedToken.user;
}

function _parseCatalogScopeMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(CATALOG_SCOPE_MODE).includes(normalized) ? normalized : CATALOG_SCOPE_MODE.ALL;
}

function _normalizeSelectedCardIds(value) {
  let rawValue = [];

  if (Array.isArray(value)) {
    rawValue = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      rawValue = JSON.parse(value);
    } catch {
      rawValue = [];
    }
  }

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return [...new Set(rawValue.map((entry) => Number(entry)).filter(Number.isInteger).filter((entry) => entry > 0))];
}

function _normalizeCatalogScopeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return _DEFAULT_CATALOG_SCOPE_LIMIT;
  }

  return Math.min(parsed, _MAX_CATALOG_SCOPE_LIMIT);
}

async function getCatalogScopeSettings(db = prisma) {
  const [modeValue, limitValue, selectedIdsValue] = await Promise.all([
    _getAppSettingFromClient(db, CATALOG_SCOPE_MODE_SETTING_KEY, CATALOG_SCOPE_MODE.ALL),
    _getAppSettingFromClient(db, CATALOG_SCOPE_LIMIT_SETTING_KEY, String(_DEFAULT_CATALOG_SCOPE_LIMIT)),
    _getAppSettingFromClient(db, CATALOG_SCOPE_SELECTED_IDS_SETTING_KEY, "[]"),
  ]);

  const mode = _parseCatalogScopeMode(modeValue);
  const limit = _normalizeCatalogScopeLimit(limitValue);
  const selectedCardIds = _normalizeSelectedCardIds(selectedIdsValue);

  return {
    mode,
    limit: mode === CATALOG_SCOPE_MODE.FIRST_N ? limit : null,
    selectedCardIds: mode === CATALOG_SCOPE_MODE.SELECTED ? selectedCardIds : [],
  };
}

async function resolveCatalogScopeWhere(scopeSettings) {
  if (!scopeSettings || scopeSettings.mode === CATALOG_SCOPE_MODE.ALL) {
    return undefined;
  }

  if (scopeSettings.mode === CATALOG_SCOPE_MODE.SELECTED) {
    return scopeSettings.selectedCardIds.length
      ? { id: { in: scopeSettings.selectedCardIds } }
      : { id: { in: [-1] } };
  }

  if (scopeSettings.mode === CATALOG_SCOPE_MODE.FIRST_N) {
    const scopedCards = await prisma.card.findMany({
      select: { id: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: scopeSettings.limit || _DEFAULT_CATALOG_SCOPE_LIMIT,
    });
    const scopedIds = scopedCards.map((card) => card.id);
    return scopedIds.length ? { id: { in: scopedIds } } : { id: { in: [-1] } };
  }

  return undefined;
}

async function setCatalogScopeSettings(scopeSettings, db = prisma) {
  const normalizedSettings = {
    mode: _parseCatalogScopeMode(scopeSettings?.mode),
    limit: _normalizeCatalogScopeLimit(scopeSettings?.limit),
    selectedCardIds: _normalizeSelectedCardIds(scopeSettings?.selectedCardIds),
  };

  await Promise.all([
    _setAppSettingForClient(db, CATALOG_SCOPE_MODE_SETTING_KEY, normalizedSettings.mode),
    _setAppSettingForClient(db, CATALOG_SCOPE_LIMIT_SETTING_KEY, String(normalizedSettings.limit)),
    _setAppSettingForClient(db, CATALOG_SCOPE_SELECTED_IDS_SETTING_KEY, JSON.stringify(normalizedSettings.selectedCardIds)),
  ]);

  return getCatalogScopeSettings(db);
}

async function updateCatalogScopeSelectedIds({ addIds = [], removeIds = [] } = {}, db = prisma) {
  const scopeSettings = await getCatalogScopeSettings(db);
  const nextSelectedIds = new Set(scopeSettings.selectedCardIds);

  for (const id of _normalizeSelectedCardIds(addIds)) {
    nextSelectedIds.add(id);
  }

  for (const id of _normalizeSelectedCardIds(removeIds)) {
    nextSelectedIds.delete(id);
  }

  return setCatalogScopeSettings({
    mode: CATALOG_SCOPE_MODE.SELECTED,
    limit: scopeSettings.limit,
    selectedCardIds: [...nextSelectedIds],
  }, db);
}

function isLowStockCard(card) {
  const stock = Number(card?.stock || 0);
  const threshold = Number(card?.lowStockThreshold ?? card?.low_stock_threshold ?? 0);
  return stock > 0 && threshold > 0 && stock <= threshold;
}

function buildAdminCardSearchWhere(search) {
  const needle = String(search || "").trim();
  if (!needle) {
    return undefined;
  }

  const numericNeedle = Number(needle);
  const tokenClauses = needle
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { rarity: { contains: token, mode: "insensitive" } },
        { cardType: { contains: token, mode: "insensitive" } },
        { setName: { contains: token, mode: "insensitive" } },
        { setCode: { contains: token, mode: "insensitive" } },
      ],
    }));

  const directClauses = [
    { name: { contains: needle, mode: "insensitive" } },
    { name: { startsWith: needle, mode: "insensitive" } },
    { rarity: { contains: needle, mode: "insensitive" } },
    { cardType: { contains: needle, mode: "insensitive" } },
    { setName: { contains: needle, mode: "insensitive" } },
    { setCode: { contains: needle, mode: "insensitive" } },
  ];

  if (Number.isInteger(numericNeedle) && numericNeedle > 0) {
    directClauses.push({ id: numericNeedle });
    directClauses.push({ ygoproId: numericNeedle });
  }

  if (tokenClauses.length > 1) {
    directClauses.push({ AND: tokenClauses });
  }

  return {
    OR: directClauses,
  };
}

function combineWhereClauses(...clauses) {
  const filteredClauses = clauses.filter(Boolean);
  if (filteredClauses.length === 0) {
    return undefined;
  }

  if (filteredClauses.length === 1) {
    return filteredClauses[0];
  }

  return { AND: filteredClauses };
}

function normalizeAdminInventoryMode(value, fallbackValue = "all") {
  const normalized = String(value || fallbackValue).trim().toLowerCase();
  return normalized === "stock" ? "stock" : "all";
}

function readAdminInventoryFilters(source = {}, options = {}) {
  return {
    mode: normalizeAdminInventoryMode(source.mode, options.defaultMode || "all"),
    search: String(source.search || source.q || "").trim(),
    rarity: String(source.rarity || "").trim(),
    cardType: String(source.cardType || source.card_type || "").trim(),
    stockStatus: String(source.stockStatus || source.stock_status || "").trim(),
    visibility: String(source.visibility || "").trim(),
  };
}

async function buildAdminInventoryWhere(source = {}, options = {}) {
  const filters = readAdminInventoryFilters(source, options);
  const scopeSettings = await getCatalogScopeSettings();
  const scopeStrategy = options.scopeStrategy || "stock";
  const shouldApplyScope = scopeStrategy === "always"
    || (scopeStrategy === "stock" && filters.mode === "stock");
  const scopeWhere = shouldApplyScope ? await resolveCatalogScopeWhere(scopeSettings) : undefined;
  const baseWhere = combineWhereClauses(
    scopeWhere,
    filters.mode === "stock" && options.requirePositiveStockWhenModeStock ? { stock: { gt: 0 } } : undefined
  );
  const searchWhere = buildAdminCardSearchWhere(filters.search);
  const filterClauses = [baseWhere, searchWhere];

  if (filters.rarity && filters.rarity !== "all") {
    filterClauses.push({ rarity: filters.rarity });
  }

  if (filters.cardType && filters.cardType !== "all") {
    filterClauses.push({ cardType: filters.cardType });
  }

  if (filters.visibility === "visible") {
    filterClauses.push({ isVisible: true });
  } else if (filters.visibility === "hidden") {
    filterClauses.push({ isVisible: false });
  }

  if (filters.stockStatus === "out_of_stock") {
    filterClauses.push({ stock: { lte: 0 } });
  } else if (filters.stockStatus === "available") {
    filterClauses.push({ stock: { gt: 0 } });
  }

  const where = combineWhereClauses(...filterClauses);

  let lowStockIds = null;
  if (filters.stockStatus === "low_stock") {
    const lowStockRows = await prisma.card.findMany({
      where: combineWhereClauses(baseWhere, {
        stock: { gt: 0 },
        lowStockThreshold: { gt: 0 },
      }),
      select: { id: true, stock: true, lowStockThreshold: true },
    });
    lowStockIds = lowStockRows.filter(isLowStockCard).map((row) => Number(row.id)).filter(Number.isFinite);
  }

  return {
    filters,
    scopeSettings,
    scopeWhere,
    baseWhere,
    finalWhere: lowStockIds
      ? combineWhereClauses(where, lowStockIds.length ? { id: { in: lowStockIds } } : { id: { in: [-1] } })
      : where,
  };
}

async function resolveAdminCardSelection(selection = {}) {
  const explicitIds = Array.isArray(selection.ids) ? selection.ids.map(Number).filter(Number.isFinite) : [];
  if (explicitIds.length) {
    return explicitIds;
  }

  if (!selection.select_all_matching) {
    return [];
  }

  const { finalWhere } = await buildAdminInventoryWhere(selection.filters || {});
  const matchingCards = await prisma.card.findMany({
    where: finalWhere,
    select: { id: true },
  });

  return matchingCards.map((card) => card.id);
}

function serializeCatalogScopeSettings(scopeSettings, appliedCardCount) {
  return {
    mode: scopeSettings.mode,
    limit: scopeSettings.mode === CATALOG_SCOPE_MODE.FIRST_N ? scopeSettings.limit : null,
    selected_card_ids: scopeSettings.selectedCardIds,
    selected_count: scopeSettings.selectedCardIds.length,
    applied_card_count: appliedCardCount,
  };
}

async function _parseCatalogScopePayload(payload) {
  const nextMode = _parseCatalogScopeMode(payload?.mode);
  const nextLimit = _normalizeCatalogScopeLimit(payload?.limit ?? payload?.first_n ?? payload?.firstN);
  const nextSelectedIds = _normalizeSelectedCardIds(
    payload?.selectedCardIds
    ?? payload?.selected_card_ids
    ?? payload?.cardIds
    ?? payload?.card_ids
  );

  return {
    data: {
      mode: nextMode,
      limit: nextLimit,
      selectedCardIds: nextSelectedIds,
    },
  };
}

async function getPublicStorefrontConfig() {
  if (
    publicStorefrontConfigState.snapshot
    && Date.now() - publicStorefrontConfigState.checkedAt < PUBLIC_STOREFRONT_CONFIG_CACHE_MS
  ) {
    return publicStorefrontConfigState.snapshot;
  }

  if (publicStorefrontConfigState.inflight) {
    return publicStorefrontConfigState.inflight;
  }

  try {
    publicStorefrontConfigState.inflight = Promise.all([
      getAppSetting("support_whatsapp_number", ""),
      getAppSetting("support_email", ""),
    ]).then(([supportWhatsappNumber, supportEmail]) => {
      const snapshot = {
        support_whatsapp_number: supportWhatsappNumber,
        support_email: supportEmail,
      };

      publicStorefrontConfigState.snapshot = snapshot;
      publicStorefrontConfigState.checkedAt = Date.now();
      return snapshot;
    }).finally(() => {
      publicStorefrontConfigState.inflight = null;
    });

    return publicStorefrontConfigState.inflight;
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      throw error;
    }

    console.warn("[storefront-config] database unavailable, using env fallback");
    const fallbackSnapshot = {
      support_whatsapp_number: String(process.env.SUPPORT_WHATSAPP_NUMBER || "").trim(),
      support_email: String(process.env.SUPPORT_EMAIL || "").trim().toLowerCase(),
    };

    publicStorefrontConfigState.snapshot = fallbackSnapshot;
    publicStorefrontConfigState.checkedAt = Date.now();
    return fallbackSnapshot;
  }
}

function parseWhatsappSettingsPayload(payload) {
  const supportWhatsappNumber = normalizeWhatsappNumber(payload?.support_whatsapp_number);
  const supportEmail = typeof payload?.support_email === "string" ? payload.support_email.trim().toLowerCase() : "";

  if (!supportWhatsappNumber) {
    return { error: "WhatsApp number is required" };
  }

  if (supportWhatsappNumber.length < 8) {
    return { error: "WhatsApp number is invalid" };
  }

  if (supportEmail && !supportEmail.includes("@")) {
    return { error: "Support email is invalid" };
  }

  return { data: { supportWhatsappNumber, supportEmail } };
}

function parseContactRequestPayload(payload) {
  const name = String(payload?.name || "").trim();
  const email = normalizeEmail(payload?.email);
  const subject = String(payload?.subject || "").trim();
  const message = String(payload?.message || "").trim();

  if (!name) {
    return { error: "Name is required" };
  }

  if (!email || !email.includes("@")) {
    return { error: "Email is invalid" };
  }

  if (!subject) {
    return { error: "Subject is required" };
  }

  if (!message || message.length < 10) {
    return { error: "Message must contain at least 10 characters" };
  }

  return {
    data: {
      name,
      email,
      subject,
      message,
    },
  };
}

function parseContactRequestStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(ContactRequestStatus).includes(normalized) ? normalized : null;
}

function parseContactRequestAdminPayload(payload) {
  const updates = {};

  if (payload?.status !== undefined) {
    const nextStatus = parseContactRequestStatus(payload.status);
    if (!nextStatus) {
      return { error: "Invalid contact request status" };
    }

    updates.status = nextStatus;
  }

  if (payload?.admin_notes !== undefined) {
    updates.adminNotes = typeof payload.admin_notes === "string" ? payload.admin_notes.trim() : "";
  }

  if (payload?.response_message !== undefined) {
    updates.responseMessage = typeof payload.response_message === "string" ? payload.response_message.trim() : "";
  }

  if (!Object.keys(updates).length) {
    return { error: "No valid fields to update" };
  }

  return { data: updates };
}

function buildContactRequestSummary(contactRequests) {
  const summary = {
    total: contactRequests.length,
    new: 0,
    in_progress: 0,
    responded: 0,
    archived: 0,
  };

  for (const contactRequest of contactRequests) {
    const status = String(contactRequest.status || "").toLowerCase();
    if (status in summary) {
      summary[status] += 1;
    }
  }

  return summary;
}

function aggregateSeries(orders) {
  const revenueByDay = new Map();
  const salesByDay = new Map();
  const ordersByDay = new Map();

  for (const order of orders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + order.total);
    salesByDay.set(day, (salesByDay.get(day) ?? 0) + quantity);
    ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
  }

  const allDays = [...new Set([...revenueByDay.keys(), ...salesByDay.keys(), ...ordersByDay.keys()])].sort();
  return allDays.map((day) => ({
    day,
    revenue: formatCurrency(revenueByDay.get(day) ?? 0),
    sales: salesByDay.get(day) ?? 0,
    orders: ordersByDay.get(day) ?? 0,
  }));
}

function aggregateUsersByDay(users) {
  const counts = new Map();
  for (const user of users) {
    const day = user.createdAt.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, count]) => ({ day, count }));
}

async function buildWorkbook(orders) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pedidos");

  sheet.columns = [
    { header: "Pedido", key: "id", width: 10 },
    { header: "Estado", key: "status", width: 18 },
    { header: "Cliente", key: "customer", width: 28 },
    { header: "Email", key: "email", width: 30 },
    { header: "Teléfono", key: "phone", width: 18 },
    { header: "Zona", key: "zone", width: 14 },
    { header: "Envío", key: "shipping", width: 18 },
    { header: "Subtotal", key: "subtotal", width: 14 },
    { header: "Total", key: "total", width: 14 },
    { header: "Dirección", key: "address", width: 44 },
    { header: "Items", key: "items", width: 60 },
    { header: "Fecha", key: "createdAt", width: 24 },
  ];

  for (const order of orders) {
    sheet.addRow({
      id: order.id,
      status: order.status,
      customer: order.customerName || order.user?.fullName || "-",
      email: order.customerEmail || order.user?.email || "-",
      phone: order.customerPhone || order.user?.phone || "-",
      zone: order.shippingZone,
      shipping: order.shippingLabel,
      subtotal: order.subtotal,
      total: order.total,
      address: buildAddressSummary(order),
      items: order.items.map((item) => `${item.quantity}x ${item.card?.name || `Card ${item.cardId}`}`).join(" | "),
      createdAt: order.createdAt.toISOString(),
    });
  }

  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

app.get("/api/health", async (_req, res) => {
  /* ── Health always returns 200 so Railway / load-balancers treat the
       process as alive.  Infrastructure status is informational. ── */
  let dbOk = false;
  let dbError = null;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`.then(() => { dbOk = true; }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db probe timeout")), 2000)),
    ]);
  } catch (err) {
    dbError = err?.message || "unknown";
  }

  let redisCache = null;
  try {
    redisCache = await probeRedisConnection();
  } catch {
    // Redis is non-critical
  }

  let redisTcpOk = false;
  try {
    redisTcpOk = await pingRedisTcp();
  } catch {
    // non-critical
  }

  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    database: { ok: dbOk, ...(dbError ? { error: dbError } : {}) },
    redis: {
      cache: redisCache,
      cache_backend: getRedisBackendName(),
      tcp: { ok: redisTcpOk, configured: isRedisTcpConfigured() },
    },
    sse: getSSEClientCount(),
  });
});

app.get("/api/storefront/config", async (_req, res) => {
  try {
    res.json({ storefront: await getPublicStorefrontConfig() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load storefront config" });
  }
});

/* ── SSE realtime streams ── */
app.get("/api/events/stream", publicSSEHandler);
app.get("/api/admin/events/stream", requireAdminEventStreamAuth, adminSSEHandler);

app.post("/api/contact", contactRateLimit, validateBody(contactRequestBodySchema), async (req, res) => {
  const parsed = parseContactRequestPayload(req.validatedBody || {});
  if (parsed.error) {
    throw createAppError(parsed.error, {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const contactRequest = await prisma.contactRequest.create({
    data: {
      ...parsed.data,
      source: "storefront",
      ipAddress: extractIp(req),
      userAgent: req.headers["user-agent"] || null,
    },
  });

  res.status(201).json({
    contact_request: toContactRequestResponse(contactRequest),
    message: "Contact request created",
  });
});

async function handlePublicCatalogList(req, res) {
  await listPublicCards(req, res, undefined, { stockOnly: true });
}

async function handlePublicCatalogFilters(_req, res) {
  setPublicFiltersCacheHeaders(res);
  res.json({ filters: await getPublicCardFilters({ stockOnly: true }) });
}

async function handlePublicCatalogSearch(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!q) {
    res.json({ cards: [], total: 0, page: 1, pageSize: Math.min(50, Math.max(1, Number(req.query.pageSize || 20))), totalPages: 0 });
    return;
  }

  void recordCatalogSearchMetric(q);
  await listPublicCards(req, res, q, { stockOnly: true });
}

async function handlePublicCatalogDetail(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid card id" });
    return;
  }

  const cacheKey = `${PUBLIC_CARD_DETAIL_CACHE_PREFIX}:stock:${id}`;

  const payload = await cacheGetOrFetch(cacheKey, PUBLIC_CARD_DETAIL_CACHE_TTL_SECONDS, async () => {
    const card = await prisma.card.findFirst({
      where: {
        id,
        isVisible: true,
        stock: { gt: 0 },
      },
    });

    if (!card) {
      return null; // cacheGetOrFetch won't cache null
    }

    const publicCard = toPublicCard(card);
    return {
      card: publicCard,
      versions: [
        {
          version_id: String(card.id),
          card_id: String(card.id),
          name: publicCard.name,
          image: publicCard.image,
          set_name: publicCard.set_name,
          set_code: publicCard.set_code,
          rarity: publicCard.rarity,
          price: publicCard.price,
          stock: publicCard.stock,
          condition: publicCard.condition,
        },
      ],
      ygoproData: {
        description: publicCard.description,
        image: publicCard.image,
        cardType: publicCard.card_type,
        race: publicCard.race,
        attribute: publicCard.attribute,
        atk: publicCard.atk,
        def: publicCard.def,
        level: publicCard.level,
      },
    };
  });

  if (!payload) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  setPublicCardDetailCacheHeaders(res);
  res.json(payload);
}

app.get("/api/catalog", async (req, res) => {
  try {
    await handlePublicCatalogList(req, res);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to load cards" });
  }
});

app.get("/api/cards", async (req, res) => {
  try {
    await handlePublicCatalogList(req, res);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to load cards" });
  }
});

app.get("/api/catalog/filters", async (req, res) => {
  try {
    await handlePublicCatalogFilters(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load card filters" });
  }
});

app.get("/api/cards/filters", async (req, res) => {
  try {
    await handlePublicCatalogFilters(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load card filters" });
  }
});

app.get("/api/catalog/search", async (req, res) => {
  try {
    await handlePublicCatalogSearch(req, res);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to search cards" });
  }
});

app.get("/api/cards/search", async (req, res) => {
  try {
    await handlePublicCatalogSearch(req, res);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to search cards" });
  }
});

app.get("/api/catalog/:id", async (req, res) => {
  try {
    await handlePublicCatalogDetail(req, res);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to load card" });
  }
});

app.get("/api/cards/:id", async (req, res) => {
  try {
    await handlePublicCatalogDetail(req, res);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to load card" });
  }
});

app.get("/api/custom/categories/tree", async (_req, res) => {
  try {
    const categories = await prisma.customCategory.findMany({
      where: { isVisible: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json({ categories: buildCustomCategoryTree(categories) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom categories" });
  }
});

app.get("/api/custom/categories/path", async (req, res) => {
  try {
    const slugPath = typeof req.query.slugPath === "string" ? req.query.slugPath.trim() : "";

    if (!slugPath) {
      const rootCategories = await prisma.customCategory.findMany({
        where: { isVisible: true, parentId: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });

      res.json({ category: null, children: buildCustomCategoryTree(rootCategories), products: [] });
      return;
    }

    const category = await getCustomCategoryByPath(slugPath, { visibleOnly: true });

    if (!category) {
      res.status(404).json({ error: "Custom category not found" });
      return;
    }

    const [children, products] = await Promise.all([
      prisma.customCategory.findMany({
        where: { parentId: category.id, isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.customProduct.findMany({
        where: { categoryId: category.id, isVisible: true },
        include: { category: true, images: true },
        orderBy: [{ createdAt: "desc" }, { title: "asc" }],
      }),
    ]);

    res.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || "",
        image: category.image || null,
        parent_id: category.parentId ?? null,
      },
      children: buildCustomCategoryTree(children),
      products: products.map(toCustomProductResponse),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom category" });
  }
});

app.get("/api/custom/products/:slug", async (req, res) => {
  try {
    const slug = slugify(req.params.slug);

    if (!slug) {
      res.status(400).json({ error: "Invalid product slug" });
      return;
    }

    const product = await prisma.customProduct.findFirst({
      where: {
        slug,
        isVisible: true,
        category: { isVisible: true },
      },
      include: { category: true, images: true },
    });

    if (!product) {
      res.status(404).json({ error: "Custom product not found" });
      return;
    }

    res.json({ product: toCustomProductResponse(product) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom product" });
  }
});

app.post("/api/auth/register", authWriteRateLimit, validateBody(registerBodySchema), async (req, res) => {
  const parsed = parseRegisterPayload(req.validatedBody || {});
  if (parsed.error) {
    throw createAppError(parsed.error, {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const { email, username, password, fullName, phone, avatarUrl } = parsed.data;
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existing) {
    throw createAppError(existing.email === email ? "Email already registered" : "Username already in use", {
      statusCode: 409,
      code: "USER_ALREADY_EXISTS",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      fullName,
      phone,
      avatarUrl,
      role: UserRole.USER,
    },
  });

  await recordActivity(user.id, "AUTH_REGISTER", req, { email: user.email });
  const session = await createSession(user, req);
  res.status(201).json(session);
});

app.post("/api/auth/login", authWriteRateLimit, validateBody(loginBodySchema), async (req, res) => {
  await withDatabaseConnection(async () => {
    const identifier = typeof req.validatedBody?.identifier === "string"
      ? req.validatedBody.identifier
      : typeof req.validatedBody?.email === "string"
        ? req.validatedBody.email
        : "";
    const user = await authenticateSessionUser({
      identifier,
      password: req.validatedBody.password,
    });

    await recordActivity(user.id, "AUTH_LOGIN", req, { via: "storefront" });
    const session = await createSession(user, req);
    res.json(session);
  }, { maxWaitMs: 4000 });
});

app.post("/api/auth/refresh", sessionRateLimit, validateBody(refreshTokenBodySchema), async (req, res) => {
  await withDatabaseConnection(async () => {
    const user = await resolveRefreshSessionUser({ refreshToken: req.validatedBody.refreshToken });

    await revokeRefreshToken(req.validatedBody.refreshToken);
    await recordActivity(user.id, "AUTH_REFRESH", req, null);
    const session = await createSession(user, req);
    res.json(session);
  }, { maxWaitMs: 4000 });
});

app.post("/api/auth/logout", sessionRateLimit, validateBody(logoutBodySchema), async (req, res) => {
  try {
    const refreshToken = typeof req.validatedBody?.refreshToken === "string" ? req.validatedBody.refreshToken : "";
    await revokeRefreshToken(refreshToken);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

app.post("/api/auth/forgot-password", passwordResetRateLimit, validateBody(forgotPasswordBodySchema), async (req, res) => {
  const email = normalizeEmail(req.validatedBody?.email);
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user) {
    res.json({ ok: true, message: "Si el email existe, enviamos instrucciones." });
    return;
  }

  const resetToken = createPasswordResetToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hashToken(resetToken),
      passwordResetExpiresAt: new Date(Date.now() + 1000 * 60 * 30),
    },
  });

  await recordActivity(user.id, "PASSWORD_RESET_REQUESTED", req, null);
  res.json({
    ok: true,
    message: "Si el email existe, enviamos instrucciones.",
    ...(process.env.NODE_ENV !== "production" ? { resetToken } : {}),
  });
});

app.post("/api/auth/reset-password", passwordResetRateLimit, validateBody(resetPasswordBodySchema), async (req, res) => {
  const { token, password } = req.validatedBody;

  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { gt: new Date() },
    },
  });

  if (!user) {
    throw createAppError("Reset token invalid or expired", {
      statusCode: 400,
      code: "INVALID_RESET_TOKEN",
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordActivity(user.id, "PASSWORD_RESET_COMPLETED", req, null);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.user.sub) },
      include: {
        addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      user: toUserResponse(user),
      addresses: user.addresses.map(toAddressResponse),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/api/auth/profile", requireAuth, async (req, res) => {
  try {
    const parsed = parseProfilePayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const userId = Number(req.user.sub);
    if (parsed.data.email || parsed.data.username) {
      const existing = await prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            ...(parsed.data.email ? [{ email: parsed.data.email }] : []),
            ...(parsed.data.username ? [{ username: parsed.data.username }] : []),
          ],
        },
      });

      if (existing) {
        res.status(409).json({ error: "Email or username already in use" });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
    });

    await recordActivity(user.id, "PROFILE_UPDATED", req, Object.keys(parsed.data));
    res.json({ user: toUserResponse(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.get("/api/auth/addresses", requireAuth, async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: Number(req.user.sub) },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    res.json({ addresses: addresses.map(toAddressResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load addresses" });
  }
});

app.post("/api/auth/addresses", requireAuth, async (req, res) => {
  try {
    const parsed = parseAddressPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const userId = Number(req.user.sub);
    if (parsed.data.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    const address = await prisma.address.create({
      data: {
        userId,
        ...parsed.data,
      },
    });

    await recordActivity(userId, "ADDRESS_CREATED", req, { addressId: address.id });
    res.status(201).json({ address: toAddressResponse(address) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create address" });
  }
});

app.put("/api/auth/addresses/:id", requireAuth, async (req, res) => {
  try {
    const addressId = Number(req.params.id);
    if (!Number.isFinite(addressId)) {
      res.status(400).json({ error: "Invalid address id" });
      return;
    }

    const parsed = parseAddressPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const userId = Number(req.user.sub);
    await ensureAddressOwnership(userId, addressId);

    if (parsed.data.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    const address = await prisma.address.update({
      where: { id: addressId },
      data: parsed.data,
    });

    await recordActivity(userId, "ADDRESS_UPDATED", req, { addressId });
    res.json({ address: toAddressResponse(address) });
  } catch (error) {
    if (error.message === "ADDRESS_NOT_FOUND") {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update address" });
  }
});

app.delete("/api/auth/addresses/:id", requireAuth, async (req, res) => {
  try {
    const addressId = Number(req.params.id);
    if (!Number.isFinite(addressId)) {
      res.status(400).json({ error: "Invalid address id" });
      return;
    }

    const userId = Number(req.user.sub);
    await ensureAddressOwnership(userId, addressId);
    await prisma.address.delete({ where: { id: addressId } });
    await recordActivity(userId, "ADDRESS_DELETED", req, { addressId });
    res.json({ deletedAddressId: addressId });
  } catch (error) {
    if (error.message === "ADDRESS_NOT_FOUND") {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to delete address" });
  }
});

app.get("/api/auth/orders", requireAuth, async (req, res) => {
  try {
    await expirePendingOrdersBestEffort({
      source: "auth_orders_list",
      requestId: req.requestContext?.requestId || null,
    });

    const orders = await prisma.order.findMany({
      where: { userId: Number(req.user.sub) },
      include: { items: true, user: true, address: true },
      orderBy: { createdAt: "desc" },
    });

    const cardsById = await getOrderCardsMap(orders, { adminThumbnail: true });
    res.json({ orders: orders.map((order) => toOrderResponse(order, cardsById)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load your orders" });
  }
});

app.get("/api/auth/activity", requireAuth, async (req, res) => {
  try {
    const activities = await prisma.userActivity.findMany({
      where: { userId: Number(req.user.sub) },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ activities: activities.map(toActivityResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

app.post("/api/checkout", requireAuth, checkoutRateLimit, async (req, res) => {
  let idempotency = null;

  try {
    assertMercadoPagoDirectPaymentsConfigured();
    await ensureOrderSchemaReady();

    idempotency = await beginIdempotentMutation(req, {
      payload: req.body || null,
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const userId = Number(req.user.sub);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const acceptedPrivacy = req.body?.accepted === true;

    if (!acceptedPrivacy) {
      res.status(400).json({ error: "Debés aceptar la política de privacidad" });
      return;
    }

    if (!items.length) {
      res.status(400).json({ error: "Cart is empty" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const normalizedItems = items.map((item) => ({
      cardId: Number(item.cardId ?? item.version_id),
      quantity: Number(item.quantity),
    }));

    if (normalizedItems.some((item) => !Number.isFinite(item.cardId) || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      res.status(400).json({ error: "Invalid checkout payload" });
      return;
    }

    const customerName = typeof req.body?.customer_name === "string" && req.body.customer_name.trim()
      ? req.body.customer_name.trim()
      : user.fullName;
    const customerEmail = typeof req.body?.customer_email === "string" && req.body.customer_email.trim()
      ? normalizeEmail(req.body.customer_email)
      : user.email;
    const fallbackPhone = typeof req.body?.phone === "string" && req.body.phone.trim()
      ? req.body.phone.trim()
      : user.phone;

    const result = await withDatabaseConnection(() => prisma.$transaction(async (tx) => {
      const cards = await tx.card.findMany({
        where: { id: { in: normalizedItems.map((item) => item.cardId) } },
      });

      const cardMap = new Map(cards.map((card) => [card.id, card]));
      const cardsById = new Map(attachMetadata(cards).map((card) => [card.id, card]));
      let subtotal = 0;

      const unavailableItems = normalizedItems.filter((item) => {
        const card = cardMap.get(item.cardId);
        return !card || !card.isVisible;
      });

      if (unavailableItems.length > 0) {
        throw createAppError("Hay cartas del carrito que ya no están disponibles", {
          code: "CARD_UNAVAILABLE",
          unavailableCardIds: unavailableItems.map((item) => item.cardId),
        });
      }

      for (const item of normalizedItems) {
        const card = cardMap.get(item.cardId);
        subtotal += card.price * item.quantity;
      }

      // Atomic stock reservation: decrement only if stock >= quantity (prevents overselling)
      for (const item of normalizedItems) {
        const card = cardMap.get(item.cardId);
        const updated = await tx.card.updateMany({
          where: { id: item.cardId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });

        if (updated.count === 0) {
          throw createAppError(`Insufficient stock for ${card.name}`, {
            code: "INSUFFICIENT_STOCK",
            unavailableCardIds: [item.cardId],
          });
        }
      }

      const delivery = await buildCheckoutAddress(tx, userId, req.body || {}, fallbackPhone);
      const total = formatCurrency(subtotal + delivery.shipping.cost);
      const expiresAt = buildCheckoutExpirationDate();

      const order = await tx.order.create({
        data: {
          userId,
          addressId: delivery.addressId,
          subtotal: formatCurrency(subtotal),
          shippingCost: delivery.shipping.cost,
          total,
          currency: "ARS",
          status: OrderStatus.PENDING_PAYMENT,
          expires_at: expiresAt,
          payment_status: null,
          payment_status_detail: null,
          shippingZone: delivery.shippingZone,
          shippingLabel: delivery.shipping.label,
          customerName,
          customerEmail,
          customerPhone: delivery.snapshot.customerPhone,
          shippingAddress: delivery.snapshot.shippingAddress,
          shippingCity: delivery.snapshot.shippingCity,
          shippingProvince: delivery.snapshot.shippingProvince,
          shippingPostalCode: delivery.snapshot.shippingPostalCode,
          notes: typeof req.body?.notes === "string" && req.body.notes.trim() ? req.body.notes.trim() : null,
          items: {
            create: normalizedItems.map((item) => {
              const card = cardMap.get(item.cardId);
              return {
                cardId: item.cardId,
                quantity: item.quantity,
                price: card.price,
              };
            }),
          },
        },
        include: { items: true, user: true, address: true },
      });

      return { order, cardsById };
    }), { maxWaitMs: 5000 });

    const responseOrder = toOrderResponse(result.order, result.cardsById);

    const responsePayload = {
      order: responseOrder,
      init_point: null,
      exchange_rate: responseOrder.exchange_rate ?? null,
      total_ars: responseOrder.total_ars ?? null,
      expires_at: responseOrder.expires_at ?? null,
      payment_redirect_available: false,
    };

    try {
      await recordActivity(userId, "CHECKOUT_CREATED", req, {
        orderId: result.order.id,
        paymentFlow: "checkout_api",
      });
    } catch (activityError) {
      console.error("Failed to record checkout activity", activityError);
    }

    console.info("Checkout created", {
      requestId: req.requestContext?.requestId || null,
      orderId: result.order.id,
      paymentRedirectAvailable: false,
    });

    await finalizeIdempotentMutation(idempotency, 201, responsePayload);
    res.status(201).json(responsePayload);

    /* ── Async post-checkout: cache invalidation + realtime event ── */
    enqueueJob("process-order-post-checkout", {
      orderId: result.order.id,
      items: normalizedItems,
    }, { jobId: `post-checkout-${result.order.id}` }).catch((postResponseError) => {
      console.error("[checkout] failed to enqueue post-checkout job", postResponseError);
    });
    return;
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        ...(error.details ? error.details : {}),
        ...(Array.isArray(error.unavailableCardIds) ? { unavailableCardIds: error.unavailableCardIds } : {}),
      });
      return;
    }

    if (error?.code === "CARD_UNAVAILABLE") {
      res.status(409).json({
        error: error.message,
        code: error.code,
        unavailableCardIds: error.unavailableCardIds || [],
      });
      return;
    }

    if (error?.code === "INSUFFICIENT_STOCK") {
      res.status(409).json({
        error: error.message,
        code: error.code,
        unavailableCardIds: error.unavailableCardIds || [],
      });
      return;
    }

    if (error.message === "ADDRESS_NOT_FOUND") {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    if (error.message?.includes("required")) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({ error: error.message || "Checkout failed" });
  }
});

app.post("/api/checkout/create-preference", requireAuth, checkoutRateLimit, async (req, res) => {
  let idempotency = null;

  try {
    idempotency = await beginIdempotentMutation(req, {
      payload: { orderId: req.body?.orderId ?? null },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const userId = Number(req.user.sub);
    const orderId = Number(req.body?.orderId);
    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    const preferenceResult = await createCheckoutPreferenceForOrder(req, { orderId, userId });
    const responsePayload = {
      init_point: preferenceResult.initPoint,
      exchange_rate: preferenceResult.exchangeRate,
      total_ars: preferenceResult.totalArs,
      expires_at: preferenceResult.expiresAt,
      order: toOrderResponse(preferenceResult.order, preferenceResult.cardsById),
    };

    try {
      await recordActivity(userId, "CHECKOUT_PREFERENCE_CREATED", req, {
        orderId: preferenceResult.order.id,
        preferenceId: preferenceResult.order.preference_id,
        exchangeRate: preferenceResult.exchangeRate,
        totalArs: preferenceResult.totalArs,
      });
    } catch (activityError) {
      console.error("Failed to record checkout preference activity", activityError);
    }

    console.info("Checkout preference created", {
      requestId: req.requestContext?.requestId || null,
      orderId: preferenceResult.order.id,
      preferenceId: preferenceResult.order.preference_id,
    });

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        ...(error.details ? error.details : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: error.message || "Failed to create Mercado Pago preference" });
  }
});

app.post("/api/payments/create", requireAuth, checkoutRateLimit, async (req, res) => {
  let idempotency = null;
  let prepared = null;
  let userId = null;

  try {
    assertMercadoPagoDirectPaymentsConfigured();
    await ensureOrderSchemaReady();

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        orderId: req.body?.orderId ?? null,
        token: req.body?.token ?? null,
        payment_method_id: req.body?.payment_method_id ?? null,
        issuer_id: req.body?.issuer_id ?? null,
        installments: req.body?.installments ?? null,
        identification: req.body?.identification ?? null,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    userId = Number(req.user.sub);
    const orderId = Number(req.body?.orderId);
    const token = String(req.body?.token || "").trim();
    const paymentMethodId = String(req.body?.payment_method_id || "").trim();
    const issuerId = String(req.body?.issuer_id || "").trim();
    const installments = Number(req.body?.installments);
    const identificationType = String(req.body?.identification?.type || "").trim();
    const identificationNumber = String(req.body?.identification?.number || "").trim();

    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: "Invalid order id", code: "INVALID_ORDER_ID" });
      return;
    }

    if (!token) {
      res.status(400).json({ error: "Missing card token", code: "MISSING_CARD_TOKEN" });
      return;
    }

    if (!paymentMethodId) {
      res.status(400).json({ error: "Missing payment method", code: "MISSING_PAYMENT_METHOD" });
      return;
    }

    if (!Number.isInteger(installments) || installments <= 0) {
      res.status(400).json({ error: "Invalid installments", code: "INVALID_INSTALLMENTS" });
      return;
    }

    prepared = await prepareOrderForDirectPayment(req, { orderId, userId });
    const mercadoPagoAccount = await getMercadoPagoAccountDetails();
    const notificationUrl = buildMercadoPagoNotificationUrl({
      useSandboxWebhook: shouldUseMercadoPagoSandboxWebhook(mercadoPagoAccount),
    });
    const providerIdempotencyKey = String(idempotency.key || req.body?.mutation_id || `${orderId}-${Date.now()}`);
    const paymentPayload = {
      transaction_amount: prepared.totalArs,
      token,
      payment_method_id: paymentMethodId,
      installments,
      description: `DuelVault order #${prepared.order.id}`,
      external_reference: String(prepared.order.id),
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      payer: {
        email: String(prepared.order.customerEmail || prepared.order.user?.email || "").trim().toLowerCase(),
        ...((identificationType && identificationNumber)
          ? {
              identification: {
                type: identificationType,
                number: identificationNumber,
              },
            }
          : {}),
      },
      ...(issuerId ? { issuer_id: issuerId } : {}),
      metadata: {
        order_id: prepared.order.id,
        request_id: req.requestContext?.requestId || null,
        user_id: prepared.order.userId ?? null,
      },
    };

    const payment = await createMercadoPagoDirectPayment({
      accessToken: MERCADOPAGO_ACCESS_TOKEN,
      idempotencyKey: providerIdempotencyKey,
      body: paymentPayload,
      timeoutMs: CHECKOUT_REQUEST_TIMEOUT_MS,
      signal: req.requestContext?.signal,
    });

    const paymentStatus = normalizeMercadoPagoPaymentStatus(payment?.status);
    const paymentStatusDetail = normalizeMercadoPagoPaymentStatusDetail(payment?.status_detail);
    const updatedOrder = await persistDirectPaymentAttempt(req, {
      orderId: prepared.order.id,
      userId,
      paymentId: String(payment?.id || "").trim() || null,
      paymentStatus,
      paymentStatusDetail,
      exchangeRate: prepared.exchangeRate,
      totalArs: prepared.totalArs,
      expiresAt: prepared.expiresAt,
    });
    const cardsById = await getOrderCardsMap([updatedOrder]);
    const responsePayload = {
      order: toOrderResponse(updatedOrder, cardsById),
      payment: {
        id: payment?.id ? String(payment.id) : null,
        status: paymentStatus || null,
        status_detail: paymentStatusDetail,
        amount: Number(payment?.transaction_amount || prepared.totalArs),
        installments: Number(payment?.installments || installments),
        payment_method_id: String(payment?.payment_method_id || paymentMethodId),
      },
      webhook_pending: true,
    };

    try {
      await recordActivity(userId, "PAYMENT_CREATE_REQUESTED", req, {
        orderId: updatedOrder.id,
        paymentId: responsePayload.payment.id,
        paymentStatus,
        paymentStatusDetail,
      });
    } catch (activityError) {
      console.error("Failed to record direct payment activity", activityError);
    }

    console.info("Direct payment created", {
      requestId: req.requestContext?.requestId || null,
      orderId: updatedOrder.id,
      paymentId: responsePayload.payment.id,
      paymentStatus,
      paymentStatusDetail,
    });

    await finalizeIdempotentMutation(idempotency, 201, responsePayload);
    return res.status(201).json(responsePayload);
  } catch (error) {
    if (
      prepared?.order?.id
      && Number.isFinite(userId)
      && error?.code === "MERCADOPAGO_PAYMENT_FAILED"
      && Number(error?.statusCode) >= 400
      && Number(error?.statusCode) < 500
    ) {
      try {
        const paymentStatusDetail = normalizeMercadoPagoPaymentStatusDetail(
          error?.providerPayload?.cause?.[0]?.description
          || error?.providerPayload?.message
          || error?.message
        );

        await persistDirectPaymentProviderFailure(req, {
          orderId: prepared.order.id,
          userId,
          paymentStatusDetail,
          exchangeRate: prepared.exchangeRate,
          totalArs: prepared.totalArs,
          expiresAt: prepared.expiresAt,
        });

        try {
          await recordActivity(userId, "PAYMENT_CREATE_REJECTED", req, {
            orderId: prepared.order.id,
            providerStatusCode: Number(error?.statusCode) || null,
            paymentStatusDetail,
          });
        } catch (activityError) {
          console.error("Failed to record direct payment rejection activity", activityError);
        }
      } catch (persistError) {
        console.error("Failed to persist direct payment rejection", persistError);
      }
    }

    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "PAYMENT_CREATE_FAILED",
        ...(error.providerPayload ? { provider: error.providerPayload } : {}),
        ...(error.details ? error.details : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: error.message || "Failed to create Mercado Pago payment" });
  }
});

app.post(MERCADOPAGO_WEBHOOK_PATHS, async (req, res) => {
  try {
    assertMercadoPagoWebhookConfigured();

    const notificationType = String(req.body?.type || req.query?.type || "payment").trim().toLowerCase();
    if (notificationType && notificationType !== "payment") {
      console.info("Ignoring unsupported Mercado Pago webhook", {
        type: notificationType,
        requestId: req.requestContext?.requestId || null,
      });
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const paymentId = extractMercadoPagoPaymentId(req.body || {}, req.query || {});
    if (!paymentId) {
      res.status(200).json({ received: true, ignored: true, reason: "missing_payment_id" });
      return;
    }

    const signatureMeta = validateMercadoPagoWebhookSignature(req, paymentId);

    const paymentResponse = await mercadoPagoPaymentClient.get({ id: paymentId });
    const payment = unwrapMercadoPagoBody(paymentResponse);
    const paymentStatus = normalizeMercadoPagoPaymentStatus(payment?.status);
    const orderId = resolveMercadoPagoOrderId(payment);

    if (!Number.isFinite(orderId)) {
      console.warn("Mercado Pago payment without valid external_reference", {
        paymentId,
        paymentStatus,
      });
      res.status(200).json({ received: true, ignored: true, reason: "missing_external_reference" });
      return;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await lockOrderForUpdate(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, user: true, address: true },
      });

      if (!order) {
        return null;
      }

      if (order.status === OrderStatus.PENDING_PAYMENT && order.expires_at && order.expires_at <= new Date()) {
        const expiredOrder = await updateOrderStatusWithEffects(tx, order, OrderStatus.EXPIRED, {
          payment_status: order.payment_status || "expired",
          payment_status_detail: order.payment_status_detail || "expired_order",
        });
        return {
          order: expiredOrder,
          duplicate: false,
          appliedStatus: OrderStatus.EXPIRED,
          paymentStatus,
          postCommitEffect: buildOrderStatusPostCommitEffect(order, OrderStatus.EXPIRED),
        };
      }

      const nextStatus = resolveWebhookOrderStatus(order.status, paymentStatus);
      const paymentData = {
        payment_id: String(payment?.id || paymentId),
        payment_status: paymentStatus || order.payment_status || null,
        payment_status_detail: normalizeMercadoPagoPaymentStatusDetail(payment?.status_detail) || order.payment_status_detail || null,
        payment_approved_at: paymentStatus === "approved"
          ? order.payment_approved_at || new Date()
          : order.payment_approved_at,
      };
      const staleWebhook = order.payment_id && order.payment_id !== paymentData.payment_id;

      if (staleWebhook && paymentStatus !== "approved") {
        return {
          order,
          duplicate: false,
          ignored: true,
          appliedStatus: order.status,
          paymentStatus,
        };
      }

      const isDuplicate = order.payment_id === paymentData.payment_id
        && order.payment_status === paymentData.payment_status
        && order.payment_status_detail === paymentData.payment_status_detail
        && (!nextStatus || order.status === nextStatus);

      if (isDuplicate) {
        return {
          order,
          duplicate: true,
          appliedStatus: order.status,
          paymentStatus,
          postCommitEffect: null,
        };
      }

      if (nextStatus && order.status !== nextStatus) {
        const updatedOrder = await updateOrderStatusWithEffects(tx, order, nextStatus, paymentData);
        return {
          order: updatedOrder,
          duplicate: false,
          appliedStatus: nextStatus,
          paymentStatus,
          postCommitEffect: buildOrderStatusPostCommitEffect(order, nextStatus),
        };
      }

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: paymentData,
        include: { items: true, user: true, address: true },
      });

      return {
        order: updatedOrder,
        duplicate: false,
        appliedStatus: order.status,
        paymentStatus,
        postCommitEffect: null,
      };
    });

    if (!outcome?.order) {
      console.warn("Mercado Pago webhook for unknown order", {
        paymentId,
        orderId,
        paymentStatus,
      });
      res.status(200).json({ received: true, ignored: true, reason: "order_not_found" });
      return;
    }

    await applyOrderStatusPostCommitEffect(outcome.postCommitEffect);

    const activityAction = outcome.duplicate
      ? "CHECKOUT_WEBHOOK_DUPLICATE"
      : outcome.ignored
        ? "CHECKOUT_WEBHOOK_IGNORED"
      : outcome.paymentStatus === "approved"
        ? "CHECKOUT_PAYMENT_APPROVED"
        : outcome.appliedStatus === OrderStatus.EXPIRED
          ? "CHECKOUT_PAYMENT_EXPIRED"
        : outcome.paymentStatus === "pending" || outcome.paymentStatus === "in_process"
          ? "CHECKOUT_PAYMENT_PENDING"
          : "CHECKOUT_PAYMENT_FAILED";

    try {
      await recordActivity(outcome.order.userId ?? null, activityAction, req, {
        orderId: outcome.order.id,
        paymentId: outcome.order.payment_id,
        paymentStatus: outcome.paymentStatus,
        paymentStatusDetail: outcome.order.payment_status_detail || null,
        appliedStatus: outcome.appliedStatus,
        duplicate: outcome.duplicate,
        ignored: Boolean(outcome.ignored),
        providerRequestId: signatureMeta.providerRequestId,
      });
    } catch (activityError) {
      console.error("Failed to record Mercado Pago webhook activity", activityError);
    }

    console.info("Mercado Pago webhook processed", {
      requestId: req.requestContext?.requestId || null,
      providerRequestId: signatureMeta.providerRequestId,
      orderId: outcome.order.id,
      paymentId: outcome.order.payment_id,
      paymentStatus: outcome.paymentStatus,
      appliedStatus: outcome.appliedStatus,
      duplicate: outcome.duplicate,
    });

    invalidatePublicCatalogCaches();
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook failed", error);
    if (res.headersSent) return;
    res.status(error?.statusCode || 500).json({
      error: error?.message || "Webhook processing failed",
      code: error?.code || "WEBHOOK_PROCESSING_FAILED",
    });
  }
});

app.get("/api/internal/orders/expire-pending", async (req, res) => {
  try {
    assertCronAuthorized(req);

    if (isRedisTcpConfigured()) {
      const job = await enqueueJob("expire-pending-orders", { source: "cron" }, { jobId: `expire-pending-${Date.now()}` });
      res.json({ enqueued: true, jobId: job?.id ?? "inline" });
      return;
    }

    const expired = await expirePendingOrders({
      source: "cron",
      requestId: req.requestContext?.requestId || null,
    });

    res.json({
      expired_count: expired.count,
      order_ids: expired.orderIds,
    });
  } catch (error) {
    if (res.headersSent) return;
    res.status(error?.statusCode || 500).json({
      error: error?.message || "Failed to expire pending orders",
      code: error?.code || "EXPIRE_PENDING_ORDERS_FAILED",
      requestId: req.requestContext?.requestId || null,
    });
  }
});

app.get("/api/internal/recompute-prices", async (req, res) => {
  try {
    assertCronAuthorized(req);
    const result = await handleRecomputePrices();
    res.json(result);
  } catch (error) {
    if (res.headersSent) return;
    res.status(error?.statusCode || 500).json({
      error: error?.message || "Failed to recompute prices",
      code: error?.code || "RECOMPUTE_PRICES_FAILED",
      requestId: req.requestContext?.requestId || null,
    });
  }
});

app.get("/api/internal/compute-rankings", async (req, res) => {
  try {
    assertCronAuthorized(req);
    const result = await handleComputeCardRankings();
    res.json(result);
  } catch (error) {
    if (res.headersSent) return;
    res.status(error?.statusCode || 500).json({
      error: error?.message || "Failed to compute rankings",
      code: error?.code || "COMPUTE_RANKINGS_FAILED",
      requestId: req.requestContext?.requestId || null,
    });
  }
});

app.get("/api/internal/warm-cache", async (req, res) => {
  try {
    assertCronAuthorized(req);
    const result = await handleWarmPublicCache();
    res.json(result);
  } catch (error) {
    if (res.headersSent) return;
    res.status(error?.statusCode || 500).json({
      error: error?.message || "Failed to warm cache",
      code: error?.code || "WARM_CACHE_FAILED",
      requestId: req.requestContext?.requestId || null,
    });
  }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const currentUserId = Number(req.user.sub);

    await expirePendingOrdersBestEffort({
      source: "public_orders_list",
      requestId: req.requestContext?.requestId || null,
    });

    const ids = typeof req.query.ids === "string"
      ? req.query.ids.split(",").map((value) => Number(value)).filter(Number.isFinite)
      : [];

    if (ids.length === 0) {
      res.json({ orders: [] });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, userId: currentUserId },
      orderBy: { createdAt: "desc" },
      include: { items: true, user: true, address: true },
    });

    const cardsById = await getOrderCardsMap(orders);
    res.json({ orders: orders.map((order) => toOrderResponse(order, cardsById)) });
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

app.post("/api/admin/login", adminAuthRateLimit, validateBody(adminLoginBodySchema), async (req, res) => {
  await withDatabaseConnection(async () => {
    const identifier = typeof req.validatedBody?.identifier === "string"
      ? req.validatedBody.identifier
      : typeof req.validatedBody?.email === "string"
        ? req.validatedBody.email
        : "";
    const user = await authenticateSessionUser({
      identifier,
      password: req.validatedBody.password,
      allowedRoles: [UserRole.ADMIN, UserRole.STAFF],
    });

    await recordActivity(user.id, "AUTH_LOGIN", req, { via: "admin" });
    const session = await createSession(user, req);
    res.json(toAdminSessionPayload(session));
  }, { maxWaitMs: 4000 });
});

app.post("/api/admin/refresh", adminAuthRateLimit, validateBody(refreshTokenBodySchema), async (req, res) => {
  await withDatabaseConnection(async () => {
    const user = await resolveRefreshSessionUser({
      refreshToken: req.validatedBody.refreshToken,
      allowedRoles: [UserRole.ADMIN, UserRole.STAFF],
    });

    await revokeRefreshToken(req.validatedBody.refreshToken);
    const session = await createSession(user, req);
    res.json(toAdminSessionPayload(session));
  }, { maxWaitMs: 4000 });
});

app.get("/api/admin/dashboard", requireAdminAuth, async (_req, res) => {
  try {
    await expirePendingOrdersBestEffort({
      source: "admin_dashboard",
      requestId: _req.requestContext?.requestId || null,
    });

    const dashboardData = await cacheGetOrFetch(DASHBOARD_CACHE_KEY, DASHBOARD_CACHE_TTL_SECONDS, async () => {
      const scopeSettings = await getCatalogScopeSettings();
      const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const [cardMetricsRows, topSellingCardRows, orderSummaryRows, recentOrders, customerCount, staffCount, recentUsers, customerSeriesRows] = await Promise.all([
        prisma.card.findMany({
          where: scopeWhere,
          select: { stock: true, lowStockThreshold: true },
        }),
        prisma.card.findMany({
          where: scopeWhere,
          orderBy: [{ salesCount: "desc" }, { name: "asc" }],
          take: 6,
          select: PUBLIC_CARD_LIST_SELECT,
        }),
        prisma.order.findMany({
          where: { createdAt: { gte: ninetyDaysAgo } },
          select: DASHBOARD_ORDER_SUMMARY_SELECT,
        }),
        prisma.order.findMany({
          where: { createdAt: { gte: ninetyDaysAgo } },
          include: { items: true, user: true, address: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
        prisma.user.count({ where: { role: UserRole.USER } }),
        prisma.user.count({ where: { role: { in: [UserRole.ADMIN, UserRole.STAFF] } } }),
        prisma.user.findMany({
          where: { role: UserRole.USER },
          take: 6,
          orderBy: { createdAt: "desc" },
          select: ADMIN_USER_RESPONSE_SELECT,
        }),
        prisma.user.findMany({
          where: { role: UserRole.USER, createdAt: { gte: ninetyDaysAgo } },
          select: { createdAt: true },
        }),
      ]);

      const cardsById = await getOrderCardsMap(recentOrders, { adminThumbnail: true });
      const completedOrders = orderSummaryRows.filter((order) => isBillableStatus(order.status));
      const lowStockCount = cardMetricsRows.filter(isLowStockCard).length;
      const outOfStockCount = cardMetricsRows.filter((card) => card.stock === 0).length;
      const totalRevenue = completedOrders.reduce((sum, order) => sum + order.total, 0);
      const avgOrderValue = completedOrders.length ? totalRevenue / completedOrders.length : 0;

      const statusCounts = Object.values(OrderStatus).reduce((accumulator, status) => {
        accumulator[status.toLowerCase()] = 0;
        return accumulator;
      }, {});
      const zoneCounts = new Map(Object.values(ShippingZone).map((zone) => [zone, 0]));
      const customerOrderSummaries = new Map();

      for (const order of orderSummaryRows) {
        statusCounts[order.status.toLowerCase()] = (statusCounts[order.status.toLowerCase()] || 0) + 1;
        zoneCounts.set(order.shippingZone, (zoneCounts.get(order.shippingZone) || 0) + 1);

        if (!Number.isFinite(order.userId)) {
          continue;
        }

        const currentCustomerSummary = customerOrderSummaries.get(order.userId) || {
          totalOrders: 0,
          totalSpent: 0,
        };

        currentCustomerSummary.totalOrders += 1;
        if (isBillableStatus(order.status)) {
          currentCustomerSummary.totalSpent += order.total;
        }

        customerOrderSummaries.set(order.userId, currentCustomerSummary);
      }

      const zones = Object.values(ShippingZone).map((zone) => ({
        zone: zone.toLowerCase(),
        orders: zoneCounts.get(zone) || 0,
      }));

      const topCustomerIds = [...customerOrderSummaries.entries()]
        .sort((left, right) => {
          const spendDelta = right[1].totalSpent - left[1].totalSpent;
          if (spendDelta !== 0) {
            return spendDelta;
          }

          const orderDelta = right[1].totalOrders - left[1].totalOrders;
          if (orderDelta !== 0) {
            return orderDelta;
          }

          return left[0] - right[0];
        })
        .slice(0, 5)
        .map(([userId]) => userId);

      const topCustomerUsers = topCustomerIds.length > 0
        ? await prisma.user.findMany({
          where: { id: { in: topCustomerIds } },
          select: ADMIN_USER_RESPONSE_SELECT,
        })
        : [];
      const topCustomerUsersById = new Map(topCustomerUsers.map((user) => [user.id, user]));
      const topCustomers = topCustomerIds
        .map((userId) => {
          const user = topCustomerUsersById.get(userId);
          const summary = customerOrderSummaries.get(userId);
          if (!user || !summary) {
            return null;
          }

          return {
            ...toUserResponse(user),
            total_orders: summary.totalOrders,
            total_spent: formatCurrency(summary.totalSpent),
          };
        })
        .filter(Boolean);

      return {
        metrics: {
          totalRevenue: formatCurrency(totalRevenue),
          totalOrders: orderSummaryRows.length,
          totalProducts: cardMetricsRows.length,
          lowStockCount,
          outOfStockCount,
          totalCustomers: customerCount,
          activeStaffCount: staffCount,
          avgOrderValue: formatCurrency(avgOrderValue),
          pendingPaymentCount: statusCounts.pending_payment || 0,
        },
        recentOrders: recentOrders.map((order) => toOrderResponse(order, cardsById, { includeAdminFields: true })),
        recentUsers: recentUsers.map((user) => toUserResponse(user)),
        topCustomers,
        topSellingCards: attachMetadata(topSellingCardRows, { adminThumbnail: true }),
        analytics: {
          daily: aggregateSeries(completedOrders),
          statuses: statusCounts,
          zones,
          usersByDay: aggregateUsersByDay(customerSeriesRows),
        },
        scope: serializeCatalogScopeSettings(scopeSettings, cardMetricsRows.length),
      };
    });

    res.json(dashboardData);
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

app.get("/api/admin/settings/catalog-scope", requireAdminAuth, async (_req, res) => {
  try {
    const scopeSettings = await getCatalogScopeSettings();
    const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);
    const appliedCardCount = await prisma.card.count({ where: scopeWhere });
    res.json({ settings: serializeCatalogScopeSettings(scopeSettings, appliedCardCount) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load catalog scope settings" });
  }
});

app.put("/api/admin/settings/catalog-scope", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  try {
    const parsedPayload = await _parseCatalogScopePayload(req.body || {});
    const scopeSettings = await setCatalogScopeSettings(parsedPayload.data);
    const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);
    const appliedCardCount = await prisma.card.count({ where: scopeWhere });
    res.json({ settings: serializeCatalogScopeSettings(scopeSettings, appliedCardCount) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update catalog scope settings" });
  }
});

app.get("/api/admin/settings/whatsapp", requireAdminAuth, async (_req, res) => {
  try {
    res.json({ settings: await getPublicStorefrontConfig() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load WhatsApp settings" });
  }
});

app.put("/api/admin/settings/whatsapp", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;
  try {
    const mutationMeta = getMutationMetadata(req);
    const parsed = parseWhatsappSettingsPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        support_whatsapp_number: parsed.data.supportWhatsappNumber,
        support_email: parsed.data.supportEmail,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const existingSettings = await tx.appSetting.findMany({
        where: {
          key: {
            in: ["support_whatsapp_number", "support_email"],
          },
        },
      });

      const before = {
        support_whatsapp_number: existingSettings.find((setting) => setting.key === "support_whatsapp_number")?.value || "",
        support_email: existingSettings.find((setting) => setting.key === "support_email")?.value || "",
      };

      const [whatsappSetting, emailSetting] = await Promise.all([
        tx.appSetting.upsert({
          where: { key: "support_whatsapp_number" },
          update: { value: parsed.data.supportWhatsappNumber },
          create: {
            key: "support_whatsapp_number",
            value: parsed.data.supportWhatsappNumber,
          },
        }),
        tx.appSetting.upsert({
          where: { key: "support_email" },
          update: { value: parsed.data.supportEmail },
          create: {
            key: "support_email",
            value: parsed.data.supportEmail,
          },
        }),
      ]);

      const after = {
        support_whatsapp_number: whatsappSetting.value,
        support_email: emailSetting.value,
      };

      invalidatePublicStorefrontConfigCache();

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "app_setting",
        entityId: "support_channels",
        action: "ADMIN_WHATSAPP_SETTINGS_UPDATED",
        req,
        routeKey: idempotency.routeKey,
        before,
        after,
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
        },
      });

      return { settings: after };
    });

    try {
      await recordActivity(req.user.id, "ADMIN_WHATSAPP_SETTINGS_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        supportWhatsappNumber: parsed.data.supportWhatsappNumber,
        supportEmail: parsed.data.supportEmail,
      });
    } catch (activityError) {
      console.error("Failed to record WhatsApp settings activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update WhatsApp settings" });
  }
});

app.get("/api/admin/contact-requests", requireAdminAuth, async (req, res) => {
  try {
    const requestedStatus = typeof req.query.status === "string" ? parseContactRequestStatus(req.query.status) : null;
    const contactRequests = await prisma.contactRequest.findMany({
      where: requestedStatus ? { status: requestedStatus } : { status: { not: ContactRequestStatus.ARCHIVED } },
      include: {
        respondedBy: true,
      },
      orderBy: [
        { createdAt: "desc" },
      ],
      take: 200,
    });

    res.json({
      contact_requests: contactRequests.map((contactRequest) => toContactRequestResponse(contactRequest)),
      summary: buildContactRequestSummary(contactRequests),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load contact requests" });
  }
});

app.patch("/api/admin/contact-requests/:id", requireAdminAuth, requireAdminRole([UserRole.ADMIN, UserRole.STAFF]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;
  try {
    const mutationMeta = getMutationMetadata(req);
    const contactRequestId = Number(req.params.id);
    if (!Number.isInteger(contactRequestId) || contactRequestId <= 0) {
      res.status(400).json({ error: "Invalid contact request id" });
      return;
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);
    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    const parsed = parseContactRequestAdminPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        contactRequestId,
        body: req.body || {},
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const existingContactRequest = await tx.contactRequest.findUnique({
        where: { id: contactRequestId },
        include: { respondedBy: true },
      });

      if (!existingContactRequest) {
        throw createAppError("Contact request not found", {
          statusCode: 404,
          code: "CONTACT_REQUEST_NOT_FOUND",
        });
      }

      assertExpectedUpdatedAt(existingContactRequest, expectedUpdatedAt);

      const nextStatus = parsed.data.status || existingContactRequest.status;

      if (nextStatus === ContactRequestStatus.ARCHIVED) {
        await tx.contactRequest.delete({
          where: { id: contactRequestId },
        });

        await createAdminAuditLog(tx, {
          actorId: req.user.id,
          entityType: "contact_request",
          entityId: contactRequestId,
          action: "ADMIN_CONTACT_REQUEST_DELETED",
          req,
          routeKey: idempotency.routeKey,
          before: sanitizeContactRequestForAudit(existingContactRequest),
          after: null,
          metadata: {
            mutationId: mutationMeta.mutationId,
            requestId: mutationMeta.requestId,
            nextStatus,
          },
        });

        return { deleted: true, contact_request_id: contactRequestId, status: "archived" };
      }

      const isResponded = nextStatus === ContactRequestStatus.RESPONDED;
      const contactRequest = await tx.contactRequest.update({
        where: { id: contactRequestId },
        data: {
          ...parsed.data,
          status: nextStatus,
          respondedAt: isResponded ? existingContactRequest.respondedAt || new Date() : null,
          respondedById: isResponded ? existingContactRequest.respondedById || req.user.id : null,
        },
        include: {
          respondedBy: true,
        },
      });

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "contact_request",
        entityId: contactRequestId,
        action: "ADMIN_CONTACT_REQUEST_UPDATED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeContactRequestForAudit(existingContactRequest),
        after: sanitizeContactRequestForAudit(contactRequest),
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
          nextStatus,
        },
      });

      return { contact_request: toContactRequestResponse(contactRequest) };
    });

    try {
      const activityType = responsePayload.deleted ? "ADMIN_CONTACT_REQUEST_DELETED" : "ADMIN_CONTACT_REQUEST_UPDATED";
      await recordActivity(req.user.id, activityType, req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        contactRequestId,
        nextStatus: responsePayload.contact_request?.status || responsePayload.status,
      });
    } catch (activityError) {
      console.error("Failed to record contact request activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error.message === "CONCURRENT_MODIFICATION") {
      const currentContactRequest = await prisma.contactRequest.findUnique({
        where: { id: Number(req.params.id) },
        include: { respondedBy: true },
      });
      sendConcurrencyConflict(res, {
        error: "La consulta ya fue actualizada por otro operador. Refrescá y reintentá.",
        currentResource: currentContactRequest ? toContactRequestResponse(currentContactRequest) : null,
        requestId,
        context: {
          entity: "contact_request",
          operation: "update",
        },
      });
      return;
    }

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update contact request" });
  }
});

function hasAdminCardListQuery(query = {}) {
  return ["page", "pageSize", "q", "search", "rarity", "cardType", "card_type", "stockStatus", "stock_status", "visibility", "mode"].some(
    (key) => query[key] !== undefined
  );
}

async function listAdminCardsRoute(req, res, options = {}) {
  const { defaultMode = "all", requireSearch = false, legacyUnpaginated = false } = options;

  if (legacyUnpaginated && !hasAdminCardListQuery(req.query || {})) {
    const scopeSettings = await getCatalogScopeSettings();
    const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);
    const cards = await prisma.card.findMany({
      where: scopeWhere,
      orderBy: [{ isFeatured: "desc" }, { salesCount: "desc" }, { name: "asc" }],
      select: PUBLIC_CARD_LIST_SELECT,
    });

    setAdminCatalogWeakCacheHeaders(res);
    res.json({
      cards: attachMetadata(cards, { adminThumbnail: true }),
      total: cards.length,
      page: 1,
      pageSize: cards.length,
      totalPages: 1,
      mode: "all",
      scope: serializeCatalogScopeSettings(scopeSettings, cards.length),
    });
    return;
  }

  const page = parsePositiveInteger(req.query.page, 1, { min: 1, max: 10000 });
  const pageSize = parsePositiveInteger(req.query.pageSize, 100, { min: 1, max: 100 });
  const scopeStrategy = options.scopeStrategy || "stock";
  const requirePositiveStockWhenModeStock = Boolean(options.requirePositiveStockWhenModeStock);
  const { filters, scopeSettings, baseWhere, finalWhere } = await buildAdminInventoryWhere(req.query || {}, {
    defaultMode,
    scopeStrategy,
    requirePositiveStockWhenModeStock,
  });

  if (requireSearch && !filters.search) {
    setAdminCatalogWeakCacheHeaders(res);
    res.json({
      cards: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      search: "",
      stockStatus: filters.stockStatus,
      mode: filters.mode,
      searchRequired: true,
      scope: serializeCatalogScopeSettings(scopeSettings, 0),
      filters: {
        rarities: [],
        cardTypes: [],
      },
    });
    return;
  }

  if (filters.mode === "stock") {
    setAdminInventoryCacheHeaders(res);
  } else {
    setAdminCatalogWeakCacheHeaders(res);
  }

  const orderBy = filters.search
    ? [{ stock: "desc" }, { isVisible: "desc" }, { isFeatured: "desc" }, { salesCount: "desc" }, { name: "asc" }]
    : [{ isFeatured: "desc" }, { salesCount: "desc" }, { name: "asc" }];

  const [total, cards, appliedCardCount, rarityOptions, cardTypeOptions] = await Promise.all([
    prisma.card.count({ where: finalWhere }),
    prisma.card.findMany({
      where: finalWhere,
      orderBy,
      select: PUBLIC_CARD_LIST_SELECT,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.card.count({ where: baseWhere }),
    prisma.card.findMany({
      where: baseWhere,
      distinct: ["rarity"],
      select: { rarity: true },
      orderBy: { rarity: "asc" },
    }),
    prisma.card.findMany({
      where: baseWhere,
      distinct: ["cardType"],
      select: { cardType: true },
      orderBy: { cardType: "asc" },
    }),
  ]);

  res.json({
    cards: attachMetadata(cards, { adminThumbnail: true }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    search: filters.search,
    stockStatus: filters.stockStatus,
    mode: filters.mode,
    scope: serializeCatalogScopeSettings(scopeSettings, appliedCardCount),
    filters: {
      rarities: rarityOptions.map((entry) => entry.rarity).filter(Boolean),
      cardTypes: cardTypeOptions.map((entry) => entry.cardType).filter(Boolean),
    },
  });
}

function parseAdminInventoryInsertPayload(payload = {}) {
  const cardId = Number(payload.cardId ?? payload.card_id);
  const quantity = Math.floor(Number(payload.quantity));

  if (!Number.isInteger(cardId) || cardId <= 0) {
    return { error: "Valid cardId is required" };
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a positive integer" };
  }

  return {
    data: {
      cardId,
      quantity,
    },
  };
}

app.get("/api/admin/cards", requireAdminAuth, async (req, res) => {
  try {
    await listAdminCardsRoute(req, res, {
      defaultMode: "all",
      legacyUnpaginated: true,
      scopeStrategy: "stock",
      requirePositiveStockWhenModeStock: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load admin cards" });
  }
});

app.get("/api/admin/cards/search", requireAdminAuth, async (req, res) => {
  try {
    await listAdminCardsRoute(req, res, { defaultMode: "all", requireSearch: true, scopeStrategy: "never" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to search admin cards" });
  }
});

app.get("/api/admin/inventory", requireAdminAuth, async (req, res) => {
  try {
    await listAdminCardsRoute(req, res, { defaultMode: "stock", scopeStrategy: "always" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load inventory cards" });
  }
});

app.get("/api/admin/cards/inventory", requireAdminAuth, async (req, res) => {
  try {
    await listAdminCardsRoute(req, res, { defaultMode: "stock", scopeStrategy: "always" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load inventory cards" });
  }
});

app.post("/api/admin/inventory", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;

  try {
    const mutationMeta = getMutationMetadata(req);
    const parsedPayload = parseAdminInventoryInsertPayload(req.body || {});
    if (parsedPayload.error) {
      res.status(400).json({ error: parsedPayload.error });
      return;
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);
    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        cardId: parsedPayload.data.cardId,
        quantity: parsedPayload.data.quantity,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const existingCard = await tx.card.findUnique({ where: { id: parsedPayload.data.cardId } });
      if (!existingCard) {
        throw createAppError("Card not found", {
          statusCode: 404,
          code: "CARD_NOT_FOUND",
        });
      }

      assertExpectedUpdatedAt(existingCard, expectedUpdatedAt);

      const updateData = {
        stock: Math.max(0, Number(existingCard.stock || 0) + parsedPayload.data.quantity),
        isVisible: true,
      };

      await recordCardHistoryEntries(tx, [existingCard], updateData, "admin_inventory_add");
      const card = await tx.card.update({
        where: { id: parsedPayload.data.cardId },
        data: updateData,
      });
      await updateCatalogScopeSelectedIds({ addIds: [parsedPayload.data.cardId] }, tx);

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "card",
        entityId: parsedPayload.data.cardId,
        action: "ADMIN_INVENTORY_ADDED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeCardForAudit(existingCard),
        after: sanitizeCardForAudit(card),
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
          quantity: parsedPayload.data.quantity,
        },
      });

      return {
        card: toPublicCard(card),
        addedQuantity: parsedPayload.data.quantity,
      };
    });

    invalidatePublicCatalogCaches();
    try {
      await recordActivity(req.user.id, "ADMIN_INVENTORY_ADDED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        cardId: parsedPayload.data.cardId,
        quantity: parsedPayload.data.quantity,
      });
    } catch (activityError) {
      console.error("Failed to record inventory add activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to add card to inventory" });
  }
});

app.get("/api/admin/cards/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid card id" });
      return;
    }

    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        priceHistory: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        stockHistory: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json({
      card: toPublicCard(card, { adminThumbnail: true }),
      price_history: card.priceHistory.map(serializeCardPriceHistory),
      stock_history: card.stockHistory.map(serializeCardStockHistory),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load admin card detail" });
  }
});

app.post("/api/admin/cards/sync-catalog", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (_req, res) => {
  try {
    const scopeSettings = await getCatalogScopeSettings();
    const result = await syncCatalogFromScope(scopeSettings);
    invalidatePublicCatalogCaches();

    /* ── Realtime: notify catalog sync completed ── */
    publishEvent("catalog-synced", {
      created: result.createdCount,
      updated: result.updatedCount,
      deleted: result.deletedCount,
      hidden: result.hiddenCount,
    });

    res.json({ sync: result, settings: serializeCatalogScopeSettings(scopeSettings, result.requestedCount) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to sync catalog from YGOPRODeck" });
  }
});

/* ── Async catalog sync (unavailable in serverless — use sync endpoint instead) ── */
app.post("/api/admin/cards/sync-catalog/async", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (_req, res) => {
  res.status(501).json({
    error: "Async catalog sync unavailable in serverless mode. Use /api/admin/cards/sync-catalog instead.",
    code: "ASYNC_UNAVAILABLE",
  });
});

app.put("/api/admin/cards/bulk", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;
  try {
    const mutationMeta = getMutationMetadata(req);
    const ids = await resolveAdminCardSelection(req.body || {});
    if (!ids.length) {
      res.status(400).json({ error: "At least one card id is required" });
      return;
    }

    const parsed = parseAdminCardUpdatePayload(req.body?.updates || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        ids,
        updates: req.body?.updates || {},
        resources: req.body?.resources || [],
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const expectedUpdatedAtById = getExpectedUpdatedAtMap(req.body || {});
    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const uniqueIds = [...new Set(ids)];
      const existingCards = await tx.card.findMany({ where: { id: { in: uniqueIds } } });
      const existingCardsById = new Map(existingCards.map((card) => [card.id, card]));
      const eligibleCards = [];
      const failed = [];
      const conflicts = [];

      for (const id of uniqueIds) {
        const card = existingCardsById.get(id);
        if (!card) {
          failed.push({ id, error: "Card not found" });
          continue;
        }

        const expectedUpdatedAtForCard = expectedUpdatedAtById.get(id);
        if (expectedUpdatedAtForCard && card.updatedAt.getTime() !== expectedUpdatedAtForCard.getTime()) {
          conflicts.push({
            id,
            error: "Concurrent modification",
            current_updated_at: card.updatedAt,
            current_resource: toPublicCard(card),
          });
          continue;
        }

        eligibleCards.push(card);
      }

      const eligibleIds = eligibleCards.map((card) => card.id);
      if (eligibleIds.length) {
        await recordCardHistoryEntries(tx, eligibleCards, parsed.data, "admin_bulk");
        await tx.card.updateMany({ where: { id: { in: eligibleIds } }, data: parsed.data });
        if (Number(parsed.data.stock) > 0) {
          await updateCatalogScopeSelectedIds({ addIds: eligibleIds }, tx);
        }

        const updatedCards = await tx.card.findMany({ where: { id: { in: eligibleIds } } });
        const updatedCardsById = new Map(updatedCards.map((card) => [card.id, card]));

        for (const existingCard of eligibleCards) {
          await createAdminAuditLog(tx, {
            actorId: req.user.id,
            entityType: "card",
            entityId: existingCard.id,
            action: "ADMIN_CARD_BULK_UPDATED",
            req,
            routeKey: idempotency.routeKey,
            before: sanitizeCardForAudit(existingCard),
            after: sanitizeCardForAudit(updatedCardsById.get(existingCard.id)),
            metadata: {
              mutationId: mutationMeta.mutationId,
              requestId: mutationMeta.requestId,
              updatedFields: Object.keys(parsed.data),
            },
          });
        }
      }

      return {
        updatedCardIds: eligibleIds,
        updatedCards: eligibleIds.length
          ? [...updatedCardsById.values()].map(toPublicCard)
          : [],
        success: eligibleIds.map((id) => ({ id, action: "updated" })),
        failed,
        conflicts,
      };
    });

    if (responsePayload.updatedCardIds.length) {
      invalidatePublicCatalogCaches();
    }
    try {
      await recordActivity(req.user.id, "ADMIN_CARDS_BULK_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        cardCount: responsePayload.updatedCardIds.length,
        updatedFields: Object.keys(parsed.data),
        failedCount: responsePayload.failed.length,
        conflictCount: responsePayload.conflicts.length,
      });
    } catch (activityError) {
      console.error("Failed to record bulk card activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to bulk update cards" });
  }
});

app.put("/api/admin/cards/:id", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;
  try {
    const mutationMeta = getMutationMetadata(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid card id" });
      return;
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);
    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    const parsed = parseAdminCardUpdatePayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        id,
        body: req.body || {},
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const existingCard = await tx.card.findUnique({ where: { id } });
      if (!existingCard) {
        throw createAppError("Card not found", {
          statusCode: 404,
          code: "CARD_NOT_FOUND",
        });
      }

      assertExpectedUpdatedAt(existingCard, expectedUpdatedAt);

      await recordCardHistoryEntries(tx, [existingCard], parsed.data, "admin_single");
      const card = await tx.card.update({ where: { id }, data: parsed.data });
      if (Number(card.stock) > 0) {
        await updateCatalogScopeSelectedIds({ addIds: [id] }, tx);
      }

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "card",
        entityId: id,
        action: "ADMIN_CARD_UPDATED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeCardForAudit(existingCard),
        after: sanitizeCardForAudit(card),
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
          updatedFields: Object.keys(parsed.data),
        },
      });

      return { card: toPublicCard(card) };
    });

    invalidatePublicCatalogCaches();
    try {
      await recordActivity(req.user.id, "ADMIN_CARD_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        cardId: id,
        updatedFields: Object.keys(parsed.data),
      });
    } catch (activityError) {
      console.error("Failed to record single card activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error.message === "CONCURRENT_MODIFICATION") {
      const currentCard = await prisma.card.findUnique({ where: { id: Number(req.params.id) } });
      sendConcurrencyConflict(res, {
        error: "La carta fue modificada por otro operador. Refrescá y reintentá.",
        currentResource: currentCard ? toPublicCard(currentCard) : null,
        requestId,
        context: {
          entity: "card",
          operation: "update",
        },
      });
      return;
    }

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update card" });
  }
});

app.delete("/api/admin/cards", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;
  try {
    const mutationMeta = getMutationMetadata(req);
    const ids = await resolveAdminCardSelection(req.body || {});
    if (!ids.length) {
      res.status(400).json({ error: "At least one card id is required" });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        ids,
        resources: req.body?.resources || [],
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const expectedUpdatedAtById = getExpectedUpdatedAtMap(req.body || {});
    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const uniqueIds = [...new Set(ids)];
      const cards = await tx.card.findMany({
        where: { id: { in: uniqueIds } },
        include: {
          _count: {
            select: { orderItems: true },
          },
        },
      });
      const cardsById = new Map(cards.map((card) => [card.id, card]));
      const deletableIds = [];
      const hiddenIds = [];
      const failed = [];
      const conflicts = [];

      for (const id of uniqueIds) {
        const card = cardsById.get(id);
        if (!card) {
          failed.push({ id, error: "Card not found" });
          continue;
        }

        const expectedUpdatedAtForCard = expectedUpdatedAtById.get(id);
        if (expectedUpdatedAtForCard && card.updatedAt.getTime() !== expectedUpdatedAtForCard.getTime()) {
          conflicts.push({
            id,
            error: "Concurrent modification",
            current_updated_at: card.updatedAt,
            current_resource: toPublicCard(card),
          });
          continue;
        }

        if (card._count.orderItems === 0) {
          deletableIds.push(id);
        } else {
          hiddenIds.push(id);
        }
      }

      if (deletableIds.length) {
        await tx.card.deleteMany({ where: { id: { in: deletableIds } } });
        await updateCatalogScopeSelectedIds({ removeIds: deletableIds }, tx);
      }

      let hiddenCardsById = new Map();
      if (hiddenIds.length) {
        await tx.card.updateMany({ where: { id: { in: hiddenIds } }, data: { isVisible: false } });
        const hiddenCards = await tx.card.findMany({ where: { id: { in: hiddenIds } } });
        hiddenCardsById = new Map(hiddenCards.map((card) => [card.id, card]));
      }

      for (const id of deletableIds) {
        await createAdminAuditLog(tx, {
          actorId: req.user.id,
          entityType: "card",
          entityId: id,
          action: "ADMIN_CARD_DELETED",
          req,
          routeKey: idempotency.routeKey,
          before: sanitizeCardForAudit(cardsById.get(id)),
          after: null,
          metadata: {
            mutationId: mutationMeta.mutationId,
            requestId: mutationMeta.requestId,
            deleteMode: "hard_delete",
          },
        });
      }

      for (const id of hiddenIds) {
        await createAdminAuditLog(tx, {
          actorId: req.user.id,
          entityType: "card",
          entityId: id,
          action: "ADMIN_CARD_HIDDEN",
          req,
          routeKey: idempotency.routeKey,
          before: sanitizeCardForAudit(cardsById.get(id)),
          after: sanitizeCardForAudit(hiddenCardsById.get(id)),
          metadata: {
            mutationId: mutationMeta.mutationId,
            requestId: mutationMeta.requestId,
            deleteMode: "soft_hide",
          },
        });
      }

      return {
        deletedCardIds: deletableIds,
        hiddenCardIds: hiddenIds,
        success: [
          ...deletableIds.map((id) => ({ id, action: "deleted" })),
          ...hiddenIds.map((id) => ({ id, action: "hidden" })),
        ],
        failed,
        conflicts,
      };
    });

    if (responsePayload.success.length) {
      invalidatePublicCatalogCaches();
    }
    try {
      await recordActivity(req.user.id, "ADMIN_CARDS_DELETED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        deletedCount: responsePayload.deletedCardIds.length,
        hiddenCount: responsePayload.hiddenCardIds.length,
        failedCount: responsePayload.failed.length,
        conflictCount: responsePayload.conflicts.length,
      });
    } catch (activityError) {
      console.error("Failed to record card delete activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to delete cards" });
  }
});

app.get("/api/admin/custom/categories", requireAdminAuth, async (_req, res) => {
  try {
    const categories = await prisma.customCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || "",
        image: category.image || null,
        is_visible: category.isVisible,
        sort_order: category.sortOrder,
        parent_id: category.parentId ?? null,
      })),
      tree: buildCustomCategoryTree(categories),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom categories" });
  }
});

app.post("/api/admin/custom/categories", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  try {
    const parsed = parseCustomCategoryPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const category = await prisma.$transaction(async (tx) => {
      await assertValidCategoryParent(tx, null, parsed.data.parentId);
      return tx.customCategory.create({ data: parsed.data });
    });

    res.status(201).json({ category });
  } catch (error) {
    if (error.message === "CUSTOM_CATEGORY_PARENT_NOT_FOUND") {
      res.status(404).json({ error: "Parent category not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to create custom category" });
  }
});

app.put("/api/admin/custom/categories/:id", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }

    const parsed = parseCustomCategoryPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const category = await prisma.$transaction(async (tx) => {
      await assertValidCategoryParent(tx, id, parsed.data.parentId);
      return tx.customCategory.update({ where: { id }, data: parsed.data });
    });

    res.json({ category });
  } catch (error) {
    if (error.message === "CUSTOM_CATEGORY_PARENT_NOT_FOUND") {
      res.status(404).json({ error: "Parent category not found" });
      return;
    }

    if (error.message === "CUSTOM_CATEGORY_CYCLE") {
      res.status(409).json({ error: "Category hierarchy cannot create a cycle" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update custom category" });
  }
});

app.get("/api/admin/custom/products", requireAdminAuth, async (_req, res) => {
  try {
    const products = await prisma.customProduct.findMany({
      include: { category: true, images: true },
      orderBy: [{ createdAt: "desc" }, { title: "asc" }],
    });

    res.json({ products: products.map(toCustomProductResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom products" });
  }
});

app.post("/api/admin/custom/products", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  try {
    const parsed = parseCustomProductPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const product = await prisma.customProduct.create({
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        description: parsed.data.description,
        price: parsed.data.price,
        isVisible: parsed.data.isVisible,
        categoryId: parsed.data.categoryId,
        images: {
          create: parsed.data.images,
        },
      },
      include: { category: true, images: true },
    });

    res.status(201).json({ product: toCustomProductResponse(product) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create custom product" });
  }
});

app.put("/api/admin/custom/products/:id", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }

    const parsed = parseCustomProductPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const product = await prisma.$transaction(async (tx) => {
      await tx.customProductImage.deleteMany({ where: { productId: id } });
      return tx.customProduct.update({
        where: { id },
        data: {
          title: parsed.data.title,
          slug: parsed.data.slug,
          description: parsed.data.description,
          price: parsed.data.price,
          isVisible: parsed.data.isVisible,
          categoryId: parsed.data.categoryId,
          images: { create: parsed.data.images },
        },
        include: { category: true, images: true },
      });
    });

    res.json({ product: toCustomProductResponse(product) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update custom product" });
  }
});

app.get("/api/admin/users", requireAdminAuth, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, { min: 1, max: 10000 });
    const pageSize = parsePositiveInteger(req.query.pageSize, DEFAULT_ADMIN_USERS_PAGE_SIZE, { min: 1, max: MAX_ADMIN_PAGE_SIZE });
    const role = parseAdminRoleFilter(req.query.role);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    if (role === "INVALID_ROLE_FILTER") {
      throw createAppError("Invalid role filter", {
        statusCode: 400,
        code: "INVALID_ROLE_FILTER",
      });
    }

    const where = buildAdminUsersWhere({ search, role });
    const skip = (page - 1) * pageSize;

    const [users, filteredTotal, totalUsers, roleGroups] = await withDatabaseConnection(() => Promise.all([
      prisma.user.findMany({
        where,
        include: {
          addresses: {
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
            take: 3,
          },
          activities: {
            orderBy: { createdAt: "desc" },
            take: 4,
          },
          _count: {
            select: {
              addresses: true,
              orders: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
      prisma.user.count(),
      prisma.user.groupBy({
        by: ["role"],
        _count: {
          _all: true,
        },
      }),
    ]), { maxWaitMs: 5000 });

    const userIds = users.map((user) => user.id);
    const totalsByUser = userIds.length
      ? await withDatabaseConnection(() => prisma.order.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          status: { in: BILLABLE_ORDER_STATUSES },
        },
        _sum: {
          total: true,
        },
      }), { maxWaitMs: 5000 })
      : [];
    const spentByUserId = new Map(totalsByUser.map((entry) => [entry.userId, formatCurrency(entry._sum.total || 0)]));
    const roleCounts = roleGroups.reduce((accumulator, entry) => {
      accumulator[entry.role] = entry._count._all;
      return accumulator;
    }, {});

    res.json({
      users: users.map((user) => {
        return {
          ...toUserResponse(user),
          address_count: user._count.addresses,
          order_count: user._count.orders,
          total_spent: spentByUserId.get(user.id) || 0,
          latest_activity: user.activities[0] ? toActivityResponse(user.activities[0]) : null,
          addresses: user.addresses.map(toAddressResponse),
          activities: user.activities.map(toActivityResponse),
        };
      }),
      summary: {
        totalUsers,
        customerCount: roleCounts[UserRole.USER] || 0,
        staffCount: roleCounts[UserRole.STAFF] || 0,
        adminCount: roleCounts[UserRole.ADMIN] || 0,
        filteredTotal,
      },
      pagination: buildPagination(page, pageSize, filteredTotal),
    });
  } catch (error) {
    sendErrorResponse(error, req, res, "Failed to load users");
  }
});

app.put("/api/admin/users/:id/role", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  const requestedRole = String(req.body?.role || "").trim().toUpperCase();
  let idempotency = null;

  try {
    const mutationMeta = getMutationMetadata(req);
    const userId = Number(req.params.id);
    const role = requestedRole;
    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);
    const overrideConflict = req.body?.override_conflict === true;

    if (!Number.isFinite(userId) || !Object.values(UserRole).includes(role)) {
      res.status(400).json({ error: "Invalid role update" });
      return;
    }

    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        userId,
        role,
        expected_updated_at: req.body?.expected_updated_at || null,
        override_conflict: overrideConflict,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const existingUser = await tx.user.findUnique({ where: { id: userId } });
      if (!existingUser) {
        throw createAppError("User not found", {
          statusCode: 404,
          code: "USER_NOT_FOUND",
        });
      }

      if (!overrideConflict) {
        assertExpectedUpdatedAt(existingUser, expectedUpdatedAt);
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { role },
      });

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "user",
        entityId: userId,
        action: "ADMIN_USER_ROLE_UPDATED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeUserForAudit(existingUser),
        after: sanitizeUserForAudit(user),
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
          previousRole: existingUser.role,
          nextRole: role,
          overrideConflict,
        },
      });

      return { user: toUserResponse(user) };
    });

    try {
      await recordActivity(req.user.id, "ADMIN_USER_ROLE_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        targetUserId: userId,
        nextRole: role,
        overrideConflict,
      });
    } catch (activityError) {
      console.error("Failed to record user role activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error.message === "CONCURRENT_MODIFICATION") {
      const currentUser = await prisma.user.findUnique({ where: { id: Number(req.params.id) } });
      sendConcurrencyConflict(res, {
        error: "El usuario cambió antes de guardar el nuevo rol. Confirmá si querés forzar el cambio con el estado actual.",
        currentResource: currentUser ? toUserResponse(currentUser) : null,
        requestId,
        canOverrideConflict: true,
        context: {
          entity: "user",
          operation: "role_update",
          requested_role: requestedRole,
        },
      });
      return;
    }

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

app.get("/api/admin/orders", requireAdminAuth, async (req, res) => {
  try {
    await expirePendingOrdersBestEffort({
      source: "admin_orders_list",
      requestId: req.requestContext?.requestId || null,
      batchSize: 5,
    });
    assertRequestActive(req);

    const page = parsePositiveInteger(req.query.page, 1, { min: 1, max: 10000 });
    const pageSize = parsePositiveInteger(req.query.pageSize, DEFAULT_ADMIN_ORDERS_PAGE_SIZE, { min: 1, max: MAX_ADMIN_PAGE_SIZE });
    const status = parseAdminOrderStatusFilter(req.query.status);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    if (status === "INVALID_STATUS_FILTER") {
      throw createAppError("Invalid status filter", {
        statusCode: 400,
        code: "INVALID_STATUS_FILTER",
      });
    }

    const where = buildAdminOrdersWhere({ search, status });
    const skip = (page - 1) * pageSize;

    const [orders, filteredTotal, totalOrders, pendingCount, countedCount] = await withDatabaseConnection(() => Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true, user: true, address: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.order.count({ where }),
      prisma.order.count(),
      prisma.order.count({ where: { status: OrderStatus.PENDING_PAYMENT } }),
      prisma.order.count({ where: { status: { in: BILLABLE_ORDER_STATUSES } } }),
    ]), { maxWaitMs: 5000 });

    const cardsById = await getOrderCardsMap(orders, { adminThumbnail: true });
    assertRequestActive(req);

    if (res.headersSent) {
      return;
    }

    res.json({
      orders: orders.map((order) => toOrderResponse(order, cardsById, { includeAdminFields: true })),
      summary: {
        totalOrders,
        pendingCount,
        countedCount,
        filteredTotal,
      },
      pagination: buildPagination(page, pageSize, filteredTotal),
    });
  } catch (error) {
    sendErrorResponse(error, req, res, "Failed to load admin orders");
  }
});

app.get("/api/admin/export/orders", requireAdminAuth, async (_req, res) => {
  try {
    await expirePendingOrdersBestEffort({
      source: "admin_orders_export",
      requestId: _req.requestContext?.requestId || null,
    });

    const orders = await prisma.order.findMany({
      include: { items: { include: { card: true } }, user: true, address: true },
      orderBy: { createdAt: "desc" },
    });

    const buffer = await buildWorkbook(orders);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="duelvault-orders-${Date.now()}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    res.status(500).json({ error: "Failed to export orders" });
  }
});

app.put("/api/admin/orders/:id/status", requireAdminAuth, async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  const requestedStatus = normalizeOrderStatus(req.body?.status);
  let idempotency = null;

  try {
    const mutationMeta = getMutationMetadata(req);
    const orderId = Number(req.params.id);
    const nextStatus = requestedStatus;
    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);

    if (!Number.isFinite(orderId) || !nextStatus) {
      res.status(400).json({ error: "Invalid status update" });
      return;
    }

    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        orderId,
        status: nextStatus,
        expected_updated_at: req.body?.expected_updated_at || null,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    await expirePendingOrders({
      orderIds: [orderId],
      source: "admin_order_status_update",
      requestId,
    });

    const orderUpdateResult = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      await lockOrderForUpdate(tx, orderId);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, user: true, address: true },
      });

      if (!order) {
        throw createAppError("Order not found", {
          statusCode: 404,
          code: "ORDER_NOT_FOUND",
        });
      }

      assertExpectedUpdatedAt(order, expectedUpdatedAt);

      const allowedNextStatuses = getAllowedOrderTransitions(order.status, req.user.role);
      if (!allowedNextStatuses.includes(nextStatus)) {
        throw createAppError("Invalid order transition for current role", {
          statusCode: 409,
          code: "INVALID_ORDER_TRANSITION",
          details: {
            current_status: order.status,
            next_status: nextStatus,
            allowed_next_statuses: allowedNextStatuses,
          },
        });
      }

      for (const _item of order.items) {
        assertRequestActive(req);
      }

      const nextOrder = await updateOrderStatusWithEffects(tx, order, nextStatus);

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "order",
        entityId: orderId,
        action: "ADMIN_ORDER_STATUS_UPDATED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeOrderForAudit(order),
        after: sanitizeOrderForAudit(nextOrder),
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
          previousStatus: order.status,
          nextStatus,
        },
      });

      return {
        order: nextOrder,
        postCommitEffect: buildOrderStatusPostCommitEffect(order, nextStatus),
      };
    });

    await applyOrderStatusPostCommitEffect(orderUpdateResult.postCommitEffect);
    const updatedOrder = orderUpdateResult.order;

    try {
      await recordActivity(req.user.id, "ADMIN_ORDER_STATUS_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        orderId,
        nextStatus,
      });
    } catch (activityError) {
      console.error("Failed to record order status activity", activityError);
    }

    const cardsById = await getOrderCardsMap([updatedOrder], { adminThumbnail: true });
    const responsePayload = { order: toOrderResponse(updatedOrder, cardsById, { includeAdminFields: true }) };
    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error.message === "CONCURRENT_MODIFICATION") {
      const currentOrder = await prisma.order.findUnique({
        where: { id: Number(req.params.id) },
        include: { items: true, user: true, address: true },
      });
      const cardsById = currentOrder ? await getOrderCardsMap([currentOrder], { adminThumbnail: true }) : new Map();
      sendConcurrencyConflict(res, {
        error: "El pedido ya cambió en otra sesión. Refrescá y reintentá.",
        currentResource: currentOrder ? toOrderResponse(currentOrder, cardsById, { includeAdminFields: true }) : null,
        requestId,
        context: currentOrder ? {
          entity: "order",
          operation: "status_update",
          current_status: currentOrder.status,
          next_status: requestedStatus,
          allowed_next_statuses: getAllowedOrderTransitions(currentOrder.status, req.user.role),
        } : null,
      });
      return;
    }

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? error.details : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

app.put("/api/admin/orders/:id/shipping", requireAdminAuth, async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;

  try {
    const mutationMeta = getMutationMetadata(req);
    const orderId = Number(req.params.id);
    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);
    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    const parsed = parseAdminOrderShippingPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        orderId,
        body: req.body || {},
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, user: true, address: true },
      });

      if (!order) {
        throw createAppError("Order not found", {
          statusCode: 404,
          code: "ORDER_NOT_FOUND",
        });
      }

      assertExpectedUpdatedAt(order, expectedUpdatedAt);

      if (order.shippingZone === ShippingZone.PICKUP) {
        throw createAppError("Pickup orders do not support tracking", {
          statusCode: 409,
          code: "ORDER_HAS_NO_SHIPPING",
        });
      }

      const nextOrder = await tx.order.update({
        where: { id: orderId },
        data: parsed.data,
        include: { items: true, user: true, address: true },
      });

      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "order",
        entityId: orderId,
        action: "ADMIN_ORDER_SHIPPING_UPDATED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeOrderForAudit(order),
        after: sanitizeOrderForAudit(nextOrder),
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
          trackingVisibleToUser: nextOrder.trackingVisibleToUser,
        },
      });

      return nextOrder;
    });

    const cardsById = await getOrderCardsMap([updatedOrder], { adminThumbnail: true });
    const responsePayload = { order: toOrderResponse(updatedOrder, cardsById, { includeAdminFields: true }) };
    try {
      await recordActivity(req.user.id, "ADMIN_ORDER_SHIPPING_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        orderId,
        trackingVisibleToUser: updatedOrder.trackingVisibleToUser,
      });
    } catch (activityError) {
      console.error("Failed to record order shipping activity", activityError);
    }
    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error.message === "CONCURRENT_MODIFICATION") {
      const currentOrder = await prisma.order.findUnique({
        where: { id: Number(req.params.id) },
        include: { items: true, user: true, address: true },
      });
      const cardsById = currentOrder ? await getOrderCardsMap([currentOrder], { adminThumbnail: true }) : new Map();
      sendConcurrencyConflict(res, {
        error: "El tracking ya cambió en otra sesión. Refrescá y reintentá.",
        currentResource: currentOrder ? toOrderResponse(currentOrder, cardsById, { includeAdminFields: true }) : null,
        requestId,
        context: {
          entity: "order",
          operation: "shipping_update",
        },
      });
      return;
    }

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update shipping info" });
  }
});

app.delete("/api/admin/orders/:id", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;

  try {
    const mutationMeta = getMutationMetadata(req);
    const orderId = Number(req.params.id);
    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expected_updated_at);
    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    if (expectedUpdatedAt === "INVALID_DATE") {
      res.status(400).json({ error: "Invalid expected_updated_at value" });
      return;
    }

    idempotency = await beginIdempotentMutation(req, {
      payload: {
        orderId,
        expected_updated_at: req.body?.expected_updated_at || null,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const deletedOrder = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw createAppError("Order not found", {
          statusCode: 404,
          code: "ORDER_NOT_FOUND",
        });
      }

      assertExpectedUpdatedAt(order, expectedUpdatedAt);

      await rollbackOrderEffects(tx, order);
      await createAdminAuditLog(tx, {
        actorId: req.user.id,
        entityType: "order",
        entityId: orderId,
        action: "ADMIN_ORDER_DELETED",
        req,
        routeKey: idempotency.routeKey,
        before: sanitizeOrderForAudit(order),
        after: null,
        metadata: {
          mutationId: mutationMeta.mutationId,
          requestId: mutationMeta.requestId,
        },
      });
      await tx.order.delete({ where: { id: orderId } });
      return order;
    });

    invalidatePublicCatalogCaches();
    const responsePayload = { deletedOrderId: deletedOrder.id };
    try {
      await recordActivity(req.user.id, "ADMIN_ORDER_DELETED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        orderId,
      });
    } catch (activityError) {
      console.error("Failed to record order delete activity", activityError);
    }
    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error.message === "CONCURRENT_MODIFICATION") {
      const currentOrder = await prisma.order.findUnique({
        where: { id: Number(req.params.id) },
        include: { items: true, user: true, address: true },
      });
      const cardsById = currentOrder ? await getOrderCardsMap([currentOrder], { adminThumbnail: true }) : new Map();
      sendConcurrencyConflict(res, {
        error: "El pedido cambió antes de eliminarlo. Refrescá y reintentá.",
        currentResource: currentOrder ? toOrderResponse(currentOrder, cardsById, { includeAdminFields: true }) : null,
        requestId,
        context: {
          entity: "order",
          operation: "delete",
        },
      });
      return;
    }

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

app.delete("/api/admin/orders", requireAdminAuth, requireAdminRole([UserRole.ADMIN]), async (req, res) => {
  const requestId = req.requestContext?.requestId || null;
  let idempotency = null;

  try {
    const mutationMeta = getMutationMetadata(req);
    idempotency = await beginIdempotentMutation(req, {
      payload: {
        clear: true,
      },
    });

    if (idempotency.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
      return;
    }

    const responsePayload = await prisma.$transaction(async (tx) => {
      assertRequestActive(req);

      const orders = await tx.order.findMany({ include: { items: true } });

      for (const order of orders) {
        assertRequestActive(req);
        await rollbackOrderEffects(tx, order);
        await createAdminAuditLog(tx, {
          actorId: req.user.id,
          entityType: "order",
          entityId: order.id,
          action: "ADMIN_ORDER_DELETED",
          req,
          routeKey: idempotency.routeKey,
          before: sanitizeOrderForAudit(order),
          after: null,
          metadata: {
            mutationId: mutationMeta.mutationId,
            requestId: mutationMeta.requestId,
            clearAll: true,
          },
        });
      }

      const result = await tx.order.deleteMany({});
      return { deletedCount: result.count };
    });

    invalidatePublicCatalogCaches();
    try {
      await recordActivity(req.user.id, "ADMIN_ORDERS_CLEARED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        deletedCount: responsePayload.deletedCount,
      });
    } catch (activityError) {
      console.error("Failed to record clear orders activity", activityError);
    }
    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

    if (res.headersSent) return;

    if (error?.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code || "REQUEST_ERROR",
        requestId,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to clear orders" });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  sendErrorResponse(error, req, res);
});

if (isDirectExecution) {
  console.log("[startup] DuelVault API starting...");
  console.log(`[startup] NODE_ENV=${process.env.NODE_ENV || "undefined"} PORT=${PORT}`);
  console.log(`[startup] JWT configured: access=${!!process.env.ACCESS_TOKEN_SECRET} refresh=${!!process.env.REFRESH_TOKEN_SECRET}`);
  console.log(`[startup] DB configured: ${!!process.env.DATABASE_URL}`);
  console.log(`[startup] DB host: ${(() => { try { return new URL(process.env.DATABASE_URL || "").hostname; } catch { return "INVALID_URL"; } })()}`);
  console.log(`[startup] Redis TCP: ${isRedisTcpConfigured()}`);

  const server = app.listen(PORT, () => {
    console.log(`[startup] DuelVault API running at http://localhost:${PORT}`);

    /* ── Fire-and-forget infrastructure probes (never block startup) ── */
    (async () => {
      try {
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 5000)),
        ]);
        console.log("[db] connected");
      } catch (err) {
        console.warn(`[db] connection failed — ${err.message}. Will retry on first request.`);
      }

      try {
        const redisCache = await probeRedisConnection();
        console.log(`[infra] cache backend=${redisCache.backend} ready=${redisCache.ok}`);
      } catch { /* non-critical */ }

      if (isRedisTcpConfigured()) {
        try {
          const tcpOk = await pingRedisTcp();
          console.log(`[infra] redis-tcp ready=${tcpOk}`);
        } catch { /* non-critical */ }
      } else {
        console.log("[infra] redis-tcp not configured — jobs will run inline");
      }
    })();
  });

  /* ── Graceful shutdown ── */
  const shutdown = async (signal) => {
    console.log(`[shutdown] ${signal} received — cleaning up...`);

    server.close(() => {
      console.log("[shutdown] HTTP server closed");
    });

    await Promise.allSettled([
      shutdownQueue(),
      stopEventBus(),
      shutdownRedisTcp(),
    ]);

    console.log("[shutdown] all resources released");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export { app };
export default app;
