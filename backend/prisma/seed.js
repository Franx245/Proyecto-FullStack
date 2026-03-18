import bcrypt from "bcryptjs";
import { PrismaClient, AdminRole, OrderStatus } from "@prisma/client";
import { fetchAllMetadata, fetchMetadataByYgoIds } from "../src/lib/ygoprodeck.js";

const prisma = new PrismaClient();

const seedCards = [
  { ygoproId: 89631139, name: "Blue-Eyes White Dragon", price: 39.99, stock: 12, lowStockThreshold: 3, isVisible: true, isFeatured: true },
  { ygoproId: 46986414, name: "Dark Magician", price: 29.5, stock: 9, lowStockThreshold: 3, isVisible: true, isFeatured: true },
  { ygoproId: 74677422, name: "Red-Eyes Black Dragon", price: 24.9, stock: 4, lowStockThreshold: 4, isVisible: true, isFeatured: false },
  { ygoproId: 55144522, name: "Exodia the Forbidden One", price: 18.75, stock: 2, lowStockThreshold: 2, isVisible: true, isFeatured: false },
  { ygoproId: 40044918, name: "Dark Hole", price: 6.5, stock: 25, lowStockThreshold: 5, isVisible: true, isFeatured: false },
  { ygoproId: 12580477, name: "Monster Reborn", price: 7.95, stock: 16, lowStockThreshold: 4, isVisible: true, isFeatured: true },
  { ygoproId: 83764718, name: "Raigeki", price: 9.9, stock: 6, lowStockThreshold: 3, isVisible: true, isFeatured: false },
  { ygoproId: 53129443, name: "Mirror Force", price: 5.2, stock: 10, lowStockThreshold: 3, isVisible: true, isFeatured: false },
  { ygoproId: 58921041, name: "Summoned Skull", price: 14.3, stock: 7, lowStockThreshold: 3, isVisible: true, isFeatured: false },
  { ygoproId: 6983839, name: "Slifer the Sky Dragon", price: 44.0, stock: 1, lowStockThreshold: 2, isVisible: true, isFeatured: true },
  { ygoproId: 10000020, name: "Obelisk the Tormentor", price: 42.0, stock: 0, lowStockThreshold: 2, isVisible: true, isFeatured: false },
  { ygoproId: 10000000, name: "The Winged Dragon of Ra", price: 41.5, stock: 3, lowStockThreshold: 3, isVisible: true, isFeatured: false }
];

function chunk(items, size) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function buildDefaultPrice(metadata) {
  const rarity = (metadata.rarity || "").toLowerCase();

  if (rarity.includes("secret")) return 14.9;
  if (rarity.includes("ultra")) return 11.9;
  if (rarity.includes("super")) return 8.9;
  if (rarity.includes("rare")) return 6.9;
  if ((metadata.cardType || "").toLowerCase().includes("monster")) return 5.9;
  return 4.9;
}

async function seedAdmin() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  const defaultAdminPasswordHash = await bcrypt.hash("admin", 10);

  await prisma.adminUser.upsert({
    where: { email: "admin@test.com" },
    update: { passwordHash, role: AdminRole.ADMIN },
    create: {
      email: "admin@test.com",
      passwordHash,
      role: AdminRole.ADMIN,
    },
  });

  await prisma.adminUser.upsert({
    where: { email: "admin" },
    update: { passwordHash: defaultAdminPasswordHash, role: AdminRole.ADMIN },
    create: {
      email: "admin",
      passwordHash: defaultAdminPasswordHash,
      role: AdminRole.ADMIN,
    },
  });

  const staffPasswordHash = await bcrypt.hash("staff123", 10);
  await prisma.adminUser.upsert({
    where: { email: "staff@test.com" },
    update: { passwordHash: staffPasswordHash, role: AdminRole.STAFF },
    create: {
      email: "staff@test.com",
      passwordHash: staffPasswordHash,
      role: AdminRole.STAFF,
    },
  });
}

async function seedInventory() {
  const [metadataMap, fullCatalog, existingCards] = await Promise.all([
    fetchMetadataByYgoIds(seedCards.map((card) => card.ygoproId)),
    fetchAllMetadata(),
    prisma.card.findMany({ select: { ygoproId: true } }),
  ]);

  const existingIds = new Set(existingCards.map((card) => card.ygoproId));
  const curatedIds = new Set(seedCards.map((card) => card.ygoproId));

  for (const card of seedCards) {
    const metadata = metadataMap.get(card.ygoproId);

    await prisma.card.upsert({
      where: { ygoproId: card.ygoproId },
      update: {
        ...card,
        name: metadata?.name || card.name,
        description: metadata?.description || "",
        image: metadata?.image || null,
        cardType: metadata?.cardType || "Unknown",
        race: metadata?.race || null,
        attribute: metadata?.attribute || null,
        archetype: metadata?.archetype || null,
        atk: metadata?.atk ?? null,
        def: metadata?.def ?? null,
        level: metadata?.level ?? null,
        rarity: metadata?.rarity || "Unknown",
        setName: metadata?.setName || "YGOPRODeck",
        setCode: metadata?.setCode || `YGO-${card.ygoproId}`,
      },
      create: {
        ...card,
        name: metadata?.name || card.name,
        description: metadata?.description || "",
        image: metadata?.image || null,
        cardType: metadata?.cardType || "Unknown",
        race: metadata?.race || null,
        attribute: metadata?.attribute || null,
        archetype: metadata?.archetype || null,
        atk: metadata?.atk ?? null,
        def: metadata?.def ?? null,
        level: metadata?.level ?? null,
        rarity: metadata?.rarity || "Unknown",
        setName: metadata?.setName || "YGOPRODeck",
        setCode: metadata?.setCode || `YGO-${card.ygoproId}`,
      },
    });

    existingIds.add(card.ygoproId);
  }

  const catalogCardsToCreate = fullCatalog
    .filter((card) => !existingIds.has(card.ygoproId) && !curatedIds.has(card.ygoproId))
    .map((metadata) => ({
      name: metadata.name,
      ygoproId: metadata.ygoproId,
      description: metadata.description || "",
      image: metadata.image || null,
      cardType: metadata.cardType || "Unknown",
      race: metadata.race || null,
      attribute: metadata.attribute || null,
      archetype: metadata.archetype || null,
      atk: metadata.atk ?? null,
      def: metadata.def ?? null,
      level: metadata.level ?? null,
      rarity: metadata.rarity || "Unknown",
      setName: metadata.setName || "YGOPRODeck",
      setCode: metadata.setCode || `YGO-${metadata.ygoproId}`,
      price: buildDefaultPrice(metadata),
      stock: 5,
      lowStockThreshold: 2,
      isVisible: true,
      isFeatured: false,
      salesCount: 0,
    }));

  for (const batch of chunk(catalogCardsToCreate, 250)) {
    if (batch.length === 0) {
      continue;
    }

    await prisma.card.createMany({
      data: batch,
    });
  }
}

async function seedOrders() {
  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    return;
  }

  const cards = await prisma.card.findMany({
    where: {
      ygoproId: {
        in: [89631139, 46986414, 12580477],
      },
    },
  });

  const cardMap = new Map(cards.map((card) => [card.ygoproId, card]));

  const orders = [
    {
      status: OrderStatus.PAID,
      customerPhone: "+5491122334455",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      items: [
        { ygoproId: 89631139, quantity: 1 },
        { ygoproId: 12580477, quantity: 2 },
      ],
    },
    {
      status: OrderStatus.SHIPPED,
      customerPhone: "+5491166677788",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      items: [
        { ygoproId: 46986414, quantity: 1 },
      ],
    },
    {
      status: OrderStatus.PENDING,
      customerPhone: "+5491199988877",
      createdAt: new Date(),
      items: [
        { ygoproId: 12580477, quantity: 1 },
      ],
    },
  ];

  for (const order of orders) {
    const items = order.items
      .map((item) => {
        const card = cardMap.get(item.ygoproId);
        if (!card) {
          return null;
        }

        return {
          cardId: card.id,
          quantity: item.quantity,
          price: card.price,
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      continue;
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    await prisma.order.create({
      data: {
        total,
        status: order.status,
        customerPhone: order.customerPhone,
        createdAt: order.createdAt,
        items: {
          create: items,
        },
      },
    });
  }
}

async function syncSalesCount() {
  const cards = await prisma.card.findMany({
    include: {
      orderItems: {
        include: {
          order: true,
        },
      },
    },
  });

  for (const card of cards) {
    const sold = card.orderItems.reduce((sum, item) => {
      if (item.order.status === OrderStatus.PAID || item.order.status === OrderStatus.SHIPPED) {
        return sum + item.quantity;
      }

      return sum;
    }, 0);

    await prisma.card.update({
      where: { id: card.id },
      data: { salesCount: sold },
    });
  }
}

async function main() {
  await seedAdmin();
  await seedInventory();
  await seedOrders();
  await syncSalesCount();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });