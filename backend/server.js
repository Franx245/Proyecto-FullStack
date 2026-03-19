import bcrypt from "bcryptjs";
import cors from "cors";
import ExcelJS from "exceljs";
import express from "express";
import { createHash } from "node:crypto";
import prismaPkg from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./src/lib/prisma.js";
import { syncCatalogFromScope } from "./src/lib/catalogSync.js";
import {
  createPasswordResetToken,
  getRefreshTokenExpiryDate,
  hashToken,
  requireAdminAuth,
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
  "5173",
  "5174",
]);
const allowVercelPreviewOrigins = process.env.ALLOW_VERCEL_PREVIEWS === "true";

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

    if (allowVercelPreviewOrigins && parsed.hostname.endsWith(".vercel.app")) {
      return true;
    }

    return localHosts.has(parsed.hostname) && allowedPorts.has(parsed.port);
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
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

app.use(cors({
  origin(origin, callback) {
    callback(isAllowedOrigin(origin) ? null : new Error("Origin not allowed by CORS"), isAllowedOrigin(origin));
  },
  credentials: true,
}));
app.use(express.json());
app.use((req, res, next) => {
  const requestId = String(req.headers["x-request-id"] || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const controller = new AbortController();

  req.requestContext = {
    requestId,
    signal: controller.signal,
    isCancelled: false,
    isTimedOut: false,
    startedAt: Date.now(),
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

  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    abortRequest("timeout");
    if (!res.headersSent) {
      res.status(408).json({
        error: "Request timed out",
        code: "REQUEST_TIMEOUT",
        requestId,
      });
    }
  });

  next();
});

function toStatus(card) {
  if (card.stock <= 0) {
    return "out_of_stock";
  }

  if (card.stock <= card.lowStockThreshold) {
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

const CATALOG_SCOPE_MODE = {
  ALL: "ALL",
  FIRST_N: "FIRST_N",
  SELECTED: "SELECTED",
};

const DEFAULT_CATALOG_SCOPE_LIMIT = 500;
const MAX_CATALOG_SCOPE_LIMIT = 5000;

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

function canTransitionOrder(currentStatus, nextStatus, role) {
  if (!nextStatus || currentStatus === nextStatus) {
    return false;
  }

  return getAllowedOrderTransitions(currentStatus, role).includes(nextStatus);
}

function formatCurrency(value) {
  return Number((value || 0).toFixed(2));
}

function createAppError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
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
  const actorId = Number(req.user?.id);
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
    status: order.status.toLowerCase(),
    counts_for_dashboard: isBillableStatus(order.status),
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
    user: order.user ? toUserResponse(order.user) : null,
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

function buildCardFilters(query) {
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
      isVisible: true,
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

const PUBLIC_CARD_FILTERS_CACHE_TTL_MS = 1000 * 60 * 10;
const PUBLIC_CARD_LIST_CACHE_TTL_MS = 1000 * 30;

let publicCardFiltersCache = {
  value: null,
  expiresAt: 0,
};

let publicCardListCache = new Map();

function invalidatePublicCatalogCaches() {
  publicCardListCache.clear();
  publicCardFiltersCache = {
    value: null,
    expiresAt: 0,
  };
}

function buildCatalogVersion(total, updatedAt) {
  const updatedAtMs = updatedAt instanceof Date ? updatedAt.getTime() : 0;
  return `v${total}-${updatedAtMs}`;
}

function setPublicCatalogCacheHeaders(res) {
  res.set("Cache-Control", "public, max-age=0, must-revalidate");
  res.set("CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.set("Vercel-CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
}

function buildPublicCardListCacheKey(query, searchOverride) {
  const params = new URLSearchParams();

  Object.entries(query)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => params.append(key, String(entry)));
        return;
      }

      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });

  if (searchOverride !== undefined) {
    params.set("__searchOverride", String(searchOverride));
  }

  return params.toString();
}

function getCachedPublicCardList(cacheKey) {
  const now = Date.now();
  const cached = publicCardListCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    publicCardListCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedPublicCardList(cacheKey, value) {
  publicCardListCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PUBLIC_CARD_LIST_CACHE_TTL_MS,
  });

  if (publicCardListCache.size > 50) {
    const oldestKey = publicCardListCache.keys().next().value;
    if (oldestKey) {
      publicCardListCache.delete(oldestKey);
    }
  }
}

async function getPublicCardFilters() {
  const now = Date.now();
  if (publicCardFiltersCache.value && publicCardFiltersCache.expiresAt > now) {
    return publicCardFiltersCache.value;
  }

  const [rarityRows, setRows] = await Promise.all([
    prisma.card.findMany({
      where: { isVisible: true },
      select: { rarity: true },
      distinct: ["rarity"],
      orderBy: { rarity: "asc" },
    }),
    prisma.card.findMany({
      where: { isVisible: true },
      select: { setName: true },
      distinct: ["setName"],
      orderBy: { setName: "asc" },
    }),
  ]);

  const nextValue = {
    rarities: rarityRows.map((card) => card.rarity).filter(Boolean),
    sets: setRows.map((card) => card.setName).filter(Boolean),
  };

  publicCardFiltersCache = {
    value: nextValue,
    expiresAt: now + PUBLIC_CARD_FILTERS_CACHE_TTL_MS,
  };

  return nextValue;
}

async function listPublicCards(req, res, searchOverride) {
  setPublicCatalogCacheHeaders(res);

  const cacheKey = buildPublicCardListCacheKey(req.query, searchOverride);
  const cachedResponse = getCachedPublicCardList(cacheKey);
  if (cachedResponse) {
    res.json(cachedResponse);
    return;
  }

  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));
  const filters = buildCardFilters({
    ...req.query,
    ...(searchOverride !== undefined ? { q: searchOverride } : {}),
  });

  const includeFilterMetadata = req.query.featured !== "true" && req.query.latest !== "true";

  const [total, cards, filterOptions, versionAggregate] = await Promise.all([
    prisma.card.count({ where: filters.where }),
    prisma.card.findMany({
      where: filters.where,
      orderBy: filters.orderBy,
      select: PUBLIC_CARD_LIST_SELECT,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    includeFilterMetadata ? getPublicCardFilters() : Promise.resolve({ rarities: [], sets: [] }),
    prisma.card.aggregate({
      where: filters.where,
      _max: { updatedAt: true },
    }),
  ]);

  const responsePayload = {
    cards: attachMetadata(cards),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    filters: filterOptions,
    version: buildCatalogVersion(total, versionAggregate._max.updatedAt),
  };

  setCachedPublicCardList(cacheKey, responsePayload);
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

async function getAppSetting(key, fallbackValue = "") {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting?.value ?? fallbackValue;
}

async function setAppSetting(key, value) {
  return prisma.appSetting.upsert({
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

function parseCatalogScopeMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(CATALOG_SCOPE_MODE).includes(normalized) ? normalized : CATALOG_SCOPE_MODE.ALL;
}

function normalizeSelectedCardIds(value) {
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

async function getCatalogScopeSettings() {
  return {
    mode: CATALOG_SCOPE_MODE.ALL,
    limit: null,
    selectedCardIds: [],
  };
}

async function resolveCatalogScopeWhere(scopeSettings) {
  return undefined;
}

function buildAdminCardSearchWhere(search) {
  const needle = String(search || "").trim();
  if (!needle) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: needle, mode: "insensitive" } },
      { rarity: { contains: needle, mode: "insensitive" } },
      { cardType: { contains: needle, mode: "insensitive" } },
      { setName: { contains: needle, mode: "insensitive" } },
    ],
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

function readAdminInventoryFilters(source = {}) {
  return {
    search: String(source.search || source.q || "").trim(),
    rarity: String(source.rarity || "").trim(),
    cardType: String(source.cardType || source.card_type || "").trim(),
    stockStatus: String(source.stockStatus || source.stock_status || "").trim(),
    visibility: String(source.visibility || "").trim(),
  };
}

async function buildAdminInventoryWhere(source = {}) {
  const filters = readAdminInventoryFilters(source);
  const scopeSettings = await getCatalogScopeSettings();
  const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);
  const searchWhere = buildAdminCardSearchWhere(filters.search);
  const filterClauses = [scopeWhere, searchWhere];

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
    const lowStockRows = await prisma.$queryRaw`
      SELECT id
      FROM "Card"
      WHERE stock > 0 AND stock <= "lowStockThreshold"
    `;
    lowStockIds = lowStockRows.map((row) => Number(row.id)).filter(Number.isFinite);
  }

  return {
    filters,
    scopeWhere,
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
    mode: CATALOG_SCOPE_MODE.ALL,
    limit: null,
    selected_card_ids: [],
    selected_count: 0,
    applied_card_count: appliedCardCount,
  };
}

async function parseCatalogScopePayload(payload) {
  return { data: await getCatalogScopeSettings() };
}

async function getPublicStorefrontConfig() {
  const supportWhatsappNumber = await getAppSetting("support_whatsapp_number", "");
  const supportEmail = await getAppSetting("support_email", "");
  return {
    support_whatsapp_number: supportWhatsappNumber,
    support_email: supportEmail,
  };
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
  try {
    res.json({
      ok: true,
      runtime: {
        api_port: PORT,
        store_port: Number(process.env.STORE_PORT || 5173),
        admin_port: Number(process.env.ADMIN_PORT || 5174),
        admin_url: String(process.env.ADMIN_URL || "").trim().replace(/\/$/, ""),
      },
      storefront: await getPublicStorefrontConfig(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load runtime config" });
  }
});

app.get("/api/storefront/config", async (_req, res) => {
  try {
    res.json({ storefront: await getPublicStorefrontConfig() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load storefront config" });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const parsed = parseContactRequestPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create contact request" });
  }
});

app.get("/api/cards", async (req, res) => {
  try {
    await listPublicCards(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load cards" });
  }
});

app.get("/api/cards/filters", async (_req, res) => {
  try {
    setPublicCatalogCacheHeaders(res);
    res.json({ filters: await getPublicCardFilters() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load card filters" });
  }
});

app.get("/api/cards/search", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      res.json({ cards: [], total: 0, page: 1, pageSize: Math.min(50, Math.max(1, Number(req.query.pageSize || 20))), totalPages: 0 });
      return;
    }

    await listPublicCards(req, res, q);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to search cards" });
  }
});

app.get("/api/cards/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid card id" });
      return;
    }

    const card = await prisma.card.findUnique({ where: { id } });
    if (!card || !card.isVisible) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const publicCard = toPublicCard(card);

    res.json({
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
    });
  } catch (error) {
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

app.post("/api/auth/register", async (req, res) => {
  try {
    const parsed = parseRegisterPayload(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { email, username, password, fullName, phone, avatarUrl } = parsed.data;
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existing) {
      res.status(409).json({ error: existing.email === email ? "Email already registered" : "Username already in use" });
      return;
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const identifier = typeof req.body?.identifier === "string"
      ? req.body.identifier
      : typeof req.body?.email === "string"
        ? req.body.email
        : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!identifier || !password) {
      res.status(400).json({ error: "Identifier and password are required" });
      return;
    }

    const user = await findUserByIdentifier(identifier);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    await recordActivity(user.id, "AUTH_LOGIN", req, { via: "storefront" });
    const session = await createSession(user, req);
    res.json(session);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    if (payload.type !== "refresh") {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date() || !storedToken.user?.isActive) {
      res.status(401).json({ error: "Refresh token expired" });
      return;
    }

    await revokeRefreshToken(refreshToken);
    await recordActivity(storedToken.user.id, "AUTH_REFRESH", req, null);
    const session = await createSession(storedToken.user, req);
    res.json(session);
  } catch {
    res.status(401).json({ error: "Refresh token expired" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    await revokeRefreshToken(refreshToken);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to request password reset" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!token || password.length < 6) {
      res.status(400).json({ error: "Token and a 6 character password are required" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: "Reset token invalid or expired" });
      return;
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to reset password" });
  }
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

app.post("/api/checkout", requireAuth, async (req, res) => {
  try {
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

    const result = await prisma.$transaction(async (tx) => {
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
        if (card.stock < item.quantity) {
          throw createAppError(`Insufficient stock for ${card.name}`, {
            code: "INSUFFICIENT_STOCK",
            unavailableCardIds: [item.cardId],
          });
        }

        subtotal += card.price * item.quantity;
      }

      const delivery = await buildCheckoutAddress(tx, userId, req.body || {}, fallbackPhone);
      const total = formatCurrency(subtotal + delivery.shipping.cost);

      const order = await tx.order.create({
        data: {
          userId,
          addressId: delivery.addressId,
          subtotal: formatCurrency(subtotal),
          shippingCost: delivery.shipping.cost,
          total,
          status: OrderStatus.PENDING_PAYMENT,
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

      await Promise.all(normalizedItems.map((item) => tx.card.update({
        where: { id: item.cardId },
        data: { stock: { decrement: item.quantity } },
      })));

      return { order, cardsById };
    });

    const responseOrder = toOrderResponse(result.order, result.cardsById);
    invalidatePublicCatalogCaches();

    try {
      await recordActivity(userId, "CHECKOUT_CREATED", req, { orderId: result.order.id });
    } catch (activityError) {
      console.error("Failed to record checkout activity", activityError);
    }

    res.status(201).json({ order: responseOrder });
  } catch (error) {
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

app.get("/api/orders", async (req, res) => {
  try {
    const ids = typeof req.query.ids === "string"
      ? req.query.ids.split(",").map((value) => Number(value)).filter(Number.isFinite)
      : [];

    if (ids.length === 0) {
      res.json({ orders: [] });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: { items: true, user: true, address: true },
    });

    const cardsById = await getOrderCardsMap(orders);
    res.json({ orders: orders.map((order) => toOrderResponse(order, cardsById)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const identifier = typeof req.body?.email === "string" ? req.body.email : typeof req.body?.identifier === "string" ? req.body.identifier : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!identifier || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await findUserByIdentifier(identifier);
    if (!user || ![UserRole.ADMIN, UserRole.STAFF].includes(user.role)) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    await recordActivity(user.id, "AUTH_LOGIN", req, { via: "admin" });
    const session = await createSession(user, req);
    res.json(toAdminSessionPayload(session));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/admin/refresh", async (req, res) => {
  try {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    if (payload.type !== "refresh") {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date() || !storedToken.user || ![UserRole.ADMIN, UserRole.STAFF].includes(storedToken.user.role)) {
      res.status(401).json({ error: "Refresh token expired" });
      return;
    }

    await revokeRefreshToken(refreshToken);
    const session = await createSession(storedToken.user, req);
    res.json(toAdminSessionPayload(session));
  } catch {
    res.status(401).json({ error: "Refresh token expired" });
  }
});

app.get("/api/admin/dashboard", requireAdminAuth, async (_req, res) => {
  try {
    const scopeSettings = await getCatalogScopeSettings();
    const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);

    const [cardMetricsRows, topSellingCardRows, orders, customerCount, staffCount, recentUsers, customerSeriesRows, topCustomerUsers] = await Promise.all([
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
        include: { items: true, user: true, address: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where: { role: UserRole.USER } }),
      prisma.user.count({ where: { role: { in: [UserRole.ADMIN, UserRole.STAFF] } } }),
      prisma.user.findMany({
        where: { role: UserRole.USER },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: { role: UserRole.USER },
        select: { createdAt: true },
      }),
      prisma.user.findMany({
        where: { role: UserRole.USER },
        include: { orders: { select: { userId: true, status: true, total: true } } },
      }),
    ]);

    const cardsById = await getOrderCardsMap(orders);
    const completedOrders = orders.filter((order) => isBillableStatus(order.status));
    const lowStockCount = cardMetricsRows.filter((card) => card.stock > 0 && card.stock <= card.lowStockThreshold).length;
    const outOfStockCount = cardMetricsRows.filter((card) => card.stock === 0).length;
    const totalRevenue = completedOrders.reduce((sum, order) => sum + order.total, 0);
    const avgOrderValue = completedOrders.length ? totalRevenue / completedOrders.length : 0;
    const statusCounts = Object.values(OrderStatus).reduce((accumulator, status) => {
      accumulator[status.toLowerCase()] = orders.filter((order) => order.status === status).length;
      return accumulator;
    }, {});
    const zones = Object.values(ShippingZone).map((zone) => ({
      zone: zone.toLowerCase(),
      orders: orders.filter((order) => order.shippingZone === zone).length,
    }));
    const topCustomers = topCustomerUsers
      .map((user) => {
        const userOrders = orders.filter((order) => order.userId === user.id);
        const totalSpent = userOrders.filter((order) => isBillableStatus(order.status)).reduce((sum, order) => sum + order.total, 0);
        return {
          ...toUserResponse(user),
          total_orders: userOrders.length,
          total_spent: formatCurrency(totalSpent),
        };
      })
      .sort((left, right) => right.total_spent - left.total_spent)
      .slice(0, 5);

    res.json({
      metrics: {
        totalRevenue: formatCurrency(totalRevenue),
        totalOrders: orders.length,
        totalProducts: cardMetricsRows.length,
        lowStockCount,
        outOfStockCount,
        totalCustomers: customerCount,
        activeStaffCount: staffCount,
        avgOrderValue: formatCurrency(avgOrderValue),
        pendingPaymentCount: statusCounts.pending_payment || 0,
      },
      recentOrders: orders.slice(0, 6).map((order) => toOrderResponse(order, cardsById, { includeAdminFields: true })),
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
    });
  } catch (error) {
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
    const scopeSettings = await getCatalogScopeSettings();
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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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
      where: requestedStatus ? { status: requestedStatus } : undefined,
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
      await recordActivity(req.user.id, "ADMIN_CONTACT_REQUEST_UPDATED", req, {
        mutationId: mutationMeta.mutationId,
        requestId: mutationMeta.requestId,
        contactRequestId,
        nextStatus: responsePayload.contact_request.status,
      });
    } catch (activityError) {
      console.error("Failed to record contact request activity", activityError);
    }

    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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

app.get("/api/admin/cards", requireAdminAuth, async (_req, res) => {
  try {
    const scopeSettings = await getCatalogScopeSettings();
    const scopeWhere = await resolveCatalogScopeWhere(scopeSettings);
    const cards = await prisma.card.findMany({
      where: scopeWhere,
      orderBy: [{ isFeatured: "desc" }, { salesCount: "desc" }, { name: "asc" }],
      select: PUBLIC_CARD_LIST_SELECT,
    });
    res.json({ cards: attachMetadata(cards, { adminThumbnail: true }), scope: serializeCatalogScopeSettings(scopeSettings, cards.length) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load admin cards" });
  }
});

app.get("/api/admin/cards/inventory", requireAdminAuth, async (req, res) => {
  try {
    const scopeSettings = await getCatalogScopeSettings();
    const page = parsePositiveInteger(req.query.page, 1, { min: 1, max: 10000 });
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, { min: 1, max: 100 });
    const { filters, scopeWhere, finalWhere } = await buildAdminInventoryWhere(req.query || {});

    const [total, cards, appliedCardCount, rarityOptions, cardTypeOptions] = await Promise.all([
      prisma.card.count({ where: finalWhere }),
      prisma.card.findMany({
        where: finalWhere,
        orderBy: [{ isFeatured: "desc" }, { salesCount: "desc" }, { name: "asc" }],
        select: PUBLIC_CARD_LIST_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.card.count({ where: scopeWhere }),
      prisma.card.findMany({
        where: scopeWhere,
        distinct: ["rarity"],
        select: { rarity: true },
        orderBy: { rarity: "asc" },
      }),
      prisma.card.findMany({
        where: scopeWhere,
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
      scope: serializeCatalogScopeSettings(scopeSettings, appliedCardCount),
      filters: {
        rarities: rarityOptions.map((entry) => entry.rarity).filter(Boolean),
        cardTypes: cardTypeOptions.map((entry) => entry.cardType).filter(Boolean),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load inventory cards" });
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
    res.json({ sync: result, settings: serializeCatalogScopeSettings(scopeSettings, result.requestedCount) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to sync catalog from YGOPRODeck" });
  }
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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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

app.get("/api/admin/users", requireAdminAuth, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        addresses: true,
        orders: {
          orderBy: { createdAt: "desc" },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    });

    res.json({
      users: users.map((user) => {
        const totalSpent = user.orders.filter((order) => isBillableStatus(order.status)).reduce((sum, order) => sum + order.total, 0);
        return {
          ...toUserResponse(user),
          address_count: user.addresses.length,
          order_count: user.orders.length,
          total_spent: formatCurrency(totalSpent),
          latest_activity: user.activities[0] ? toActivityResponse(user.activities[0]) : null,
          addresses: user.addresses.map(toAddressResponse),
          activities: user.activities.map(toActivityResponse),
        };
      }),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load users" });
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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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

app.get("/api/admin/orders", requireAdminAuth, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true, user: true, address: true },
      orderBy: { createdAt: "desc" },
    });

    const cardsById = await getOrderCardsMap(orders, { adminThumbnail: true });
    res.json({ orders: orders.map((order) => toOrderResponse(order, cardsById, { includeAdminFields: true })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load admin orders" });
  }
});

app.get("/api/admin/export/orders", requireAdminAuth, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: { include: { card: true } }, user: true, address: true },
      orderBy: { createdAt: "desc" },
    });

    const buffer = await buildWorkbook(orders);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="duelvault-orders-${Date.now()}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
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

      const wasBillable = isBillableStatus(order.status);
      const willBeBillable = isBillableStatus(nextStatus);
      const isCancelling = nextStatus === OrderStatus.CANCELLED;

      for (const item of order.items) {
        assertRequestActive(req);

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

        if (isCancelling) {
          await tx.card.update({
            where: { id: item.cardId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      const nextOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
        include: { items: true, user: true, address: true },
      });

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

      return nextOrder;
    });

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

    invalidatePublicCatalogCaches();
    const cardsById = await getOrderCardsMap([updatedOrder], { adminThumbnail: true });
    const responsePayload = { order: toOrderResponse(updatedOrder, cardsById, { includeAdminFields: true }) };
    await finalizeIdempotentMutation(idempotency, 200, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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
    res.json(responsePayload);
  } catch (error) {
    await releaseIdempotentMutation(idempotency);

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

if (isDirectExecution) {
  app.listen(PORT, () => {
    console.log(`DuelVault API running at http://localhost:${PORT}`);
  });
}

export { app };
export default app;