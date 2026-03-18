import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { AdminRole, OrderStatus } from "@prisma/client";
import { prisma } from "./src/lib/prisma.js";
import {
  getRefreshTokenExpiryDate,
  hashToken,
  requireAdminAuth,
  requireAdminRole,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./src/lib/auth.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

function toStatus(card) {
  if (card.stock <= 0) {
    return "out_of_stock";
  }

  if (card.stock <= card.lowStockThreshold) {
    return "low_stock";
  }

  return "in_stock";
}

function toPublicCard(card, metadata) {
  const stockStatus = toStatus(card);

  return {
    id: card.id,
    version_id: String(card.id),
    ygopro_id: card.ygoproId,
    name: card.name,
    image: card.image || null,
    image_url: card.image || null,
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
    condition: stockStatus === "out_of_stock" ? "Out of stock" : "Near Mint",
    status: stockStatus,
    is_low_stock: stockStatus === "low_stock",
    is_out_of_stock: stockStatus === "out_of_stock",
  };
}

function toOrderResponse(order, cardsById) {
  const items = order.items.map((item) => {
    const card = cardsById.get(item.cardId);
    return {
      id: item.id,
      card_id: item.cardId,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
      card: card || null,
    };
  });

  return {
    id: order.id,
    total: order.total,
    status: order.status.toLowerCase(),
    counts_for_dashboard: isCompletedStatus(order.status),
    customer_phone: order.customerPhone,
    created_at: order.createdAt,
    items,
  };
}

function attachMetadata(cards) {
  return cards.map((card) => toPublicCard(card));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
      { name: { contains: trimmedQuery } },
      { cardType: { contains: trimmedQuery } },
      { rarity: { contains: trimmedQuery } },
      { name: { startsWith: trimmedQuery } },
      { cardType: { startsWith: trimmedQuery } },
      { rarity: { startsWith: trimmedQuery } },
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
    return { cardType: { contains: "Monster" } };
  }

  if (normalized.includes("spell") || normalized.includes("magia")) {
    return { cardType: { contains: "Spell" } };
  }

  if (normalized.includes("trap") || normalized.includes("trampa")) {
    return { cardType: { contains: "Trap" } };
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

  /** @type {any[]} */
  const and = [
    q ? buildSearchWhere(q) : null,
    categoryWhere,
    conditionWhere,
    cardTypes.length
      ? {
          OR: cardTypes.map((cardType) => ({
            cardType: { contains: cardType },
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

async function listPublicCards(req, res, searchOverride) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));
  const filters = buildCardFilters({
    ...req.query,
    ...(searchOverride !== undefined ? { q: searchOverride } : {}),
  });

  const [total, cards, filterOptions] = await Promise.all([
    prisma.card.count({ where: filters.where }),
    prisma.card.findMany({
      where: filters.where,
      orderBy: filters.orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.card.findMany({
      where: filters.where,
      select: {
        rarity: true,
        setName: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  res.json({
    cards: attachMetadata(cards),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    filters: {
      rarities: [...new Set(filterOptions.map((card) => card.rarity).filter(Boolean))].sort(),
      sets: [...new Set(filterOptions.map((card) => card.setName).filter(Boolean))].sort(),
    },
  });
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

function matchesCategory(card, category) {
  if (!category) {
    return true;
  }

  const normalized = category.toLowerCase();

  if (normalized.includes("monster") || normalized.includes("monstruo")) {
    return card.card_type.toLowerCase().includes("monster");
  }

  if (normalized.includes("spell") || normalized.includes("magia")) {
    return card.card_type.toLowerCase().includes("spell");
  }

  if (normalized.includes("trap") || normalized.includes("trampa")) {
    return card.card_type.toLowerCase().includes("trap");
  }

  return true;
}

async function getOrderCardsMap(orders) {
  const cardIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.cardId)))];
  if (cardIds.length === 0) {
    return new Map();
  }

  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
  });

  const enrichedCards = attachMetadata(cards);
  return new Map(enrichedCards.map((card) => [card.id, card]));
}

function canCancelOrder(role) {
  return role === AdminRole.ADMIN;
}

function isCompletedStatus(status) {
  return status === OrderStatus.PAID || status === OrderStatus.SHIPPED;
}

async function rollbackOrderEffects(tx, order) {
  for (const item of order.items) {
    if (isCompletedStatus(order.status)) {
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

async function createSession(admin) {
  const accessToken = signAccessToken(admin);
  const refreshToken = signRefreshToken(admin, crypto.randomUUID?.() || `${Date.now()}-${admin.id}`);

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      adminId: admin.id,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return {
    accessToken,
    refreshToken,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
  };
}

function aggregateSeries(orders) {
  const revenueByDay = new Map();
  const salesByDay = new Map();

  for (const order of orders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    const revenue = revenueByDay.get(day) ?? 0;
    const sales = salesByDay.get(day) ?? 0;
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    revenueByDay.set(day, revenue + order.total);
    salesByDay.set(day, sales + quantity);
  }

  const allDays = [...new Set([...revenueByDay.keys(), ...salesByDay.keys()])].sort();
  return allDays.map((day) => ({
    day,
    revenue: Number((revenueByDay.get(day) ?? 0).toFixed(2)),
    sales: salesByDay.get(day) ?? 0,
  }));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/cards", async (req, res) => {
  try {
    await listPublicCards(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load cards" });
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
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
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
        where: {
          isVisible: true,
          parentId: null,
        },
        orderBy: [
          { sortOrder: "asc" },
          { name: "asc" },
        ],
      });

      res.json({
        category: null,
        children: buildCustomCategoryTree(rootCategories),
        products: [],
      });
      return;
    }

    const category = await getCustomCategoryByPath(slugPath, { visibleOnly: true });

    if (!category) {
      res.status(404).json({ error: "Custom category not found" });
      return;
    }

    const [children, products] = await Promise.all([
      prisma.customCategory.findMany({
        where: {
          parentId: category.id,
          isVisible: true,
        },
        orderBy: [
          { sortOrder: "asc" },
          { name: "asc" },
        ],
      }),
      prisma.customProduct.findMany({
        where: {
          categoryId: category.id,
          isVisible: true,
        },
        include: {
          category: true,
          images: true,
        },
        orderBy: [
          { createdAt: "desc" },
          { title: "asc" },
        ],
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
        category: {
          isVisible: true,
        },
      },
      include: {
        category: true,
        images: true,
      },
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

app.post("/api/checkout", async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const customerPhone = typeof req.body?.phone === "string" ? req.body.phone.trim() : null;

    if (items.length === 0) {
      res.status(400).json({ error: "Cart is empty" });
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

    const result = await prisma.$transaction(async (tx) => {
      const cards = await tx.card.findMany({
        where: {
          id: { in: normalizedItems.map((item) => item.cardId) },
        },
      });

      const cardMap = new Map(cards.map((card) => [card.id, card]));
      let total = 0;

      for (const item of normalizedItems) {
        const card = cardMap.get(item.cardId);
        if (!card || !card.isVisible) {
          throw new Error(`Card ${item.cardId} not available`);
        }

        if (card.stock < item.quantity) {
          const err = new Error(`Insufficient stock for ${card.name}`);
          err.code = "INSUFFICIENT_STOCK";
          throw err;
        }

        total += card.price * item.quantity;
      }

      const order = await tx.order.create({
        data: {
          total,
          status: OrderStatus.PENDING,
          customerPhone,
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
        include: {
          items: true,
        },
      });

      for (const item of normalizedItems) {
        await tx.card.update({
          where: { id: item.cardId },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }

      return order;
    });

    const cards = await prisma.card.findMany({
      where: {
        id: { in: result.items.map((item) => item.cardId) },
      },
    });
    const cardsById = new Map(attachMetadata(cards).map((card) => [card.id, card]));

    res.status(201).json({
      order: toOrderResponse(result, cardsById),
    });
  } catch (error) {
    if (error?.code === "INSUFFICIENT_STOCK") {
      res.status(409).json({ error: error.message });
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
      include: { items: true },
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
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    if (!admin) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);

    if (!isValidPassword) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    res.json(await createSession(admin));
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
      include: { admin: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      res.status(401).json({ error: "Refresh token expired" });
      return;
    }

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    res.json(await createSession(storedToken.admin));
  } catch (error) {
    res.status(401).json({ error: "Refresh token expired" });
  }
});

app.get("/api/admin/dashboard", requireAdminAuth, async (_req, res) => {
  try {
    const [cards, orders] = await Promise.all([
      prisma.card.findMany(),
      prisma.order.findMany({
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const enrichedCards = attachMetadata(cards);
    const cardsById = new Map(enrichedCards.map((card) => [card.id, card]));

    const completedOrders = orders.filter((order) => order.status === OrderStatus.PAID || order.status === OrderStatus.SHIPPED);
    const lowStockCards = cards.filter((card) => card.stock > 0 && card.stock <= card.lowStockThreshold);
    const outOfStockCards = cards.filter((card) => card.stock === 0);
    const topSellingCards = [...enrichedCards]
      .sort((left, right) => right.sales_count - left.sales_count)
      .slice(0, 5);
    const recentOrders = orders.slice(0, 5).map((order) => toOrderResponse(order, cardsById));

    res.json({
      metrics: {
        totalRevenue: Number(completedOrders.reduce((sum, order) => sum + order.total, 0).toFixed(2)),
        totalOrders: orders.length,
        totalProducts: cards.length,
        lowStockCount: lowStockCards.length,
        outOfStockCount: outOfStockCards.length,
      },
      topSellingCards,
      recentOrders,
      analytics: aggregateSeries(completedOrders),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

app.get("/api/admin/cards", requireAdminAuth, async (_req, res) => {
  try {
    const cards = await prisma.card.findMany({
      orderBy: [
        { isFeatured: "desc" },
        { isNewArrival: "desc" },
        { updatedAt: "desc" },
      ],
    });
    const enrichedCards = attachMetadata(cards);
    res.json({ cards: enrichedCards });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load admin cards" });
  }
});

app.put("/api/admin/cards/bulk", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const payload = req.body ?? {};
    const ids = Array.isArray(payload.ids)
      ? payload.ids.map((id) => Number(id)).filter(Number.isFinite)
      : [];

    if (ids.length === 0) {
      res.status(400).json({ error: "No valid card ids provided" });
      return;
    }

    const parsed = parseAdminCardUpdatePayload(payload.updates ?? payload);

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const result = await prisma.card.updateMany({
      where: { id: { in: ids } },
      data: parsed.data,
    });

    res.json({ updated: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update selected cards" });
  }
});

app.put("/api/admin/cards/:id", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid card id" });
      return;
    }
    const payload = req.body ?? {};
    const parsed = parseAdminCardUpdatePayload(payload);

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const card = await prisma.card.update({
      where: { id },
      data: parsed.data,
    });

    res.json({ card: toPublicCard(card) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update card" });
  }
});

app.get("/api/admin/custom/categories", requireAdminAuth, async (_req, res) => {
  try {
    const categories = await prisma.customCategory.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
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
        created_at: category.createdAt,
        updated_at: category.updatedAt,
      })),
      tree: buildCustomCategoryTree(categories),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom categories" });
  }
});

app.post("/api/admin/custom/categories", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const parsed = parseCustomCategoryPayload(req.body ?? {});

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
    if (error.code === "P2002") {
      res.status(409).json({ error: "Category slug already exists" });
      return;
    }

    if (error.message === "CUSTOM_CATEGORY_PARENT_NOT_FOUND") {
      res.status(400).json({ error: "Parent category not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to create custom category" });
  }
});

app.put("/api/admin/custom/categories/:id", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const categoryId = Number(req.params.id);

    if (!Number.isFinite(categoryId)) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }

    const parsed = parseCustomCategoryPayload(req.body ?? {});

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const category = await prisma.$transaction(async (tx) => {
      await assertValidCategoryParent(tx, categoryId, parsed.data.parentId);

      return tx.customCategory.update({
        where: { id: categoryId },
        data: parsed.data,
      });
    });

    res.json({ category });
  } catch (error) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    if (error.code === "P2002") {
      res.status(409).json({ error: "Category slug already exists" });
      return;
    }

    if (error.message === "CUSTOM_CATEGORY_PARENT_NOT_FOUND") {
      res.status(400).json({ error: "Parent category not found" });
      return;
    }

    if (error.message === "CUSTOM_CATEGORY_CYCLE") {
      res.status(409).json({ error: "A category cannot be nested inside itself" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update custom category" });
  }
});

app.get("/api/admin/custom/products", requireAdminAuth, async (_req, res) => {
  try {
    const products = await prisma.customProduct.findMany({
      include: {
        category: true,
        images: true,
      },
      orderBy: [
        { createdAt: "desc" },
        { title: "asc" },
      ],
    });

    res.json({ products: products.map(toCustomProductResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load custom products" });
  }
});

app.post("/api/admin/custom/products", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const parsed = parseCustomProductPayload(req.body ?? {});

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const category = await prisma.customCategory.findUnique({ where: { id: parsed.data.categoryId } });

    if (!category) {
      res.status(400).json({ error: "Custom category not found" });
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
      include: {
        category: true,
        images: true,
      },
    });

    res.status(201).json({ product: toCustomProductResponse(product) });
  } catch (error) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Product slug already exists" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to create custom product" });
  }
});

app.put("/api/admin/custom/products/:id", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const productId = Number(req.params.id);

    if (!Number.isFinite(productId)) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }

    const parsed = parseCustomProductPayload(req.body ?? {});

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const category = await prisma.customCategory.findUnique({ where: { id: parsed.data.categoryId } });

    if (!category) {
      res.status(400).json({ error: "Custom category not found" });
      return;
    }

    const product = await prisma.$transaction(async (tx) => {
      await tx.customProductImage.deleteMany({ where: { productId } });

      return tx.customProduct.update({
        where: { id: productId },
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
        include: {
          category: true,
          images: true,
        },
      });
    });

    res.json({ product: toCustomProductResponse(product) });
  } catch (error) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    if (error.code === "P2002") {
      res.status(409).json({ error: "Product slug already exists" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update custom product" });
  }
});

app.get("/api/admin/orders", requireAdminAuth, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    const cardsById = await getOrderCardsMap(orders);
    res.json({ orders: orders.map((order) => toOrderResponse(order, cardsById)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load admin orders" });
  }
});

app.put("/api/admin/orders/:id/status", requireAdminAuth, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const nextStatus = typeof req.body?.status === "string" ? req.body.status.trim().toUpperCase() : "";

    if (!Number.isFinite(orderId) || !Object.values(OrderStatus).includes(nextStatus)) {
      res.status(400).json({ error: "Invalid status update" });
      return;
    }

    if (nextStatus === OrderStatus.CANCELLED && !canCancelOrder(req.admin.role)) {
      res.status(403).json({ error: "Only ADMIN can cancel orders" });
      return;
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      if (order.status === OrderStatus.CANCELLED && nextStatus !== OrderStatus.CANCELLED) {
        throw new Error("CANCELLED_ORDER_LOCKED");
      }

      if (order.status === nextStatus) {
        return order;
      }

      const wasCompleted = isCompletedStatus(order.status);
      const willBeCompleted = isCompletedStatus(nextStatus);
      const isCancelling = nextStatus === OrderStatus.CANCELLED;

      for (const item of order.items) {
        if (!wasCompleted && willBeCompleted) {
          await tx.card.update({
            where: { id: item.cardId },
            data: { salesCount: { increment: item.quantity } },
          });
        }

        if (wasCompleted && !willBeCompleted) {
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

      return tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
        include: { items: true },
      });
    });

    const cardsById = await getOrderCardsMap([updatedOrder]);
    res.json({ order: toOrderResponse(updatedOrder, cardsById) });
  } catch (error) {
    if (error.message === "ORDER_NOT_FOUND") {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (error.message === "CANCELLED_ORDER_LOCKED") {
      res.status(409).json({ error: "Cancelled orders cannot be re-opened" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

app.delete("/api/admin/orders/:id", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    const deletedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      await rollbackOrderEffects(tx, order);
      await tx.order.delete({ where: { id: orderId } });

      return order;
    });

    res.json({ deletedOrderId: deletedOrder.id });
  } catch (error) {
    if (error.message === "ORDER_NOT_FOUND") {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

app.delete("/api/admin/orders", requireAdminAuth, requireAdminRole([AdminRole.ADMIN]), async (_req, res) => {
  try {
    const deletedCount = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        include: { items: true },
      });

      for (const order of orders) {
        await rollbackOrderEffects(tx, order);
      }

      const result = await tx.order.deleteMany({});
      return result.count;
    });

    res.json({ deletedCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to clear orders" });
  }
});

app.listen(PORT, () => {
  console.log(`DuelVault API running at http://localhost:${PORT}`);
});