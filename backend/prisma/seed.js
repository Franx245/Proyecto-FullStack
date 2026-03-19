import bcrypt from "bcryptjs";
import prismaPkg from "@prisma/client";
import { fetchAllMetadata, fetchMetadataByYgoIds } from "../src/lib/ygoprodeck.js";
import { buildDefaultPrice } from "../src/lib/catalogSync.js";

const { PrismaClient, OrderStatus, ShippingZone, UserRole } = prismaPkg;
const prisma = new PrismaClient();

const seedCards = [
  { ygoproId: 89631139, name: "Blue-Eyes White Dragon", price: 39.99, stock: 12, lowStockThreshold: 3, isVisible: true, isFeatured: true, isNewArrival: true },
  { ygoproId: 46986414, name: "Dark Magician", price: 29.5, stock: 9, lowStockThreshold: 3, isVisible: true, isFeatured: true, isNewArrival: true },
  { ygoproId: 74677422, name: "Red-Eyes Black Dragon", price: 24.9, stock: 4, lowStockThreshold: 4, isVisible: true, isFeatured: false, isNewArrival: false },
  { ygoproId: 55144522, name: "Exodia the Forbidden One", price: 18.75, stock: 2, lowStockThreshold: 2, isVisible: true, isFeatured: false, isNewArrival: false },
  { ygoproId: 40044918, name: "Dark Hole", price: 6.5, stock: 25, lowStockThreshold: 5, isVisible: true, isFeatured: false, isNewArrival: false },
  { ygoproId: 12580477, name: "Monster Reborn", price: 7.95, stock: 16, lowStockThreshold: 4, isVisible: true, isFeatured: true, isNewArrival: true },
  { ygoproId: 83764718, name: "Raigeki", price: 9.9, stock: 6, lowStockThreshold: 3, isVisible: true, isFeatured: false, isNewArrival: true },
  { ygoproId: 53129443, name: "Mirror Force", price: 5.2, stock: 10, lowStockThreshold: 3, isVisible: true, isFeatured: false, isNewArrival: false },
  { ygoproId: 58921041, name: "Summoned Skull", price: 14.3, stock: 7, lowStockThreshold: 3, isVisible: true, isFeatured: false, isNewArrival: false },
  { ygoproId: 6983839, name: "Slifer the Sky Dragon", price: 44.0, stock: 1, lowStockThreshold: 2, isVisible: true, isFeatured: true, isNewArrival: false },
  { ygoproId: 10000020, name: "Obelisk the Tormentor", price: 42.0, stock: 0, lowStockThreshold: 2, isVisible: true, isFeatured: false, isNewArrival: false },
  { ygoproId: 10000000, name: "The Winged Dragon of Ra", price: 41.5, stock: 3, lowStockThreshold: 3, isVisible: true, isFeatured: false, isNewArrival: true },
];

function chunk(items, size) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function buildShipping(zone) {
  const config = {
    CABA: { cost: 5.99, label: "Envío CABA" },
    GBA: { cost: 8.99, label: "Envío GBA" },
    INTERIOR: { cost: 12.99, label: "Envío Interior" },
    PICKUP: { cost: 0, label: "Retiro por showroom" },
  };

  return config[zone] || config.PICKUP;
}

async function upsertUser({ email, username, password, role, fullName, phone, avatarUrl, lastLoginIp }) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      username,
      passwordHash,
      role,
      fullName,
      phone: phone || null,
      avatarUrl: avatarUrl || null,
      isActive: true,
      lastLoginAt: new Date(),
      lastLoginIp: lastLoginIp || null,
    },
    create: {
      email,
      username,
      passwordHash,
      role,
      fullName,
      phone: phone || null,
      avatarUrl: avatarUrl || null,
      isActive: true,
      lastLoginAt: new Date(),
      lastLoginIp: lastLoginIp || null,
    },
  });
}

async function seedUsers() {
  const users = await Promise.all([
    upsertUser({
      email: "admin@test.com",
      username: "admin",
      password: "admin123",
      role: UserRole.ADMIN,
      fullName: "Fran Admin",
      phone: "+5491122334400",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
      lastLoginIp: "127.0.0.1",
    }),
    upsertUser({
      email: "staff@test.com",
      username: "staff",
      password: "staff123",
      role: UserRole.STAFF,
      fullName: "Valen Staff",
      phone: "+5491133344400",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
      lastLoginIp: "127.0.0.1",
    }),
    upsertUser({
      email: "user@test.com",
      username: "duelist",
      password: "user123",
      role: UserRole.USER,
      fullName: "Marcos Duelista",
      phone: "+5491160010020",
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80",
      lastLoginIp: "190.245.12.8",
    }),
    upsertUser({
      email: "caba@test.com",
      username: "caba_buyer",
      password: "user123",
      role: UserRole.USER,
      fullName: "Lucia Palermo",
      phone: "+5491144455566",
      avatarUrl: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=200&q=80",
      lastLoginIp: "181.31.80.10",
    }),
  ]);

  return {
    admin: users[0],
    staff: users[1],
    primaryCustomer: users[2],
    cabaCustomer: users[3],
  };
}

async function upsertAddress({ userId, label, recipientName, phone, line1, line2, city, state, postalCode, zone, notes, isDefault }) {
  const existing = await prisma.address.findFirst({
    where: {
      userId,
      label,
      line1,
    },
  });

  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  if (existing) {
    return prisma.address.update({
      where: { id: existing.id },
      data: {
        recipientName,
        phone: phone || null,
        line2: line2 || null,
        city,
        state,
        postalCode: postalCode || null,
        zone,
        notes: notes || null,
        isDefault: Boolean(isDefault),
      },
    });
  }

  return prisma.address.create({
    data: {
      userId,
      label,
      recipientName,
      phone: phone || null,
      line1,
      line2: line2 || null,
      city,
      state,
      postalCode: postalCode || null,
      zone,
      notes: notes || null,
      isDefault: Boolean(isDefault),
    },
  });
}

async function seedAddresses(users) {
  const primary = await upsertAddress({
    userId: users.primaryCustomer.id,
    label: "Casa",
    recipientName: users.primaryCustomer.fullName,
    phone: users.primaryCustomer.phone,
    line1: "Av. Rivadavia 14520",
    line2: "PB 3",
    city: "Ramos Mejía",
    state: "Buenos Aires",
    postalCode: "1704",
    zone: ShippingZone.GBA,
    notes: "Portero eléctrico 14",
    isDefault: true,
  });

  const secondary = await upsertAddress({
    userId: users.primaryCustomer.id,
    label: "Trabajo",
    recipientName: users.primaryCustomer.fullName,
    phone: users.primaryCustomer.phone,
    line1: "Av. Corrientes 1120",
    line2: "Piso 5",
    city: "CABA",
    state: "Buenos Aires",
    postalCode: "1043",
    zone: ShippingZone.CABA,
    notes: "Recepción de 10 a 18hs",
    isDefault: false,
  });

  const caba = await upsertAddress({
    userId: users.cabaCustomer.id,
    label: "Depto",
    recipientName: users.cabaCustomer.fullName,
    phone: users.cabaCustomer.phone,
    line1: "Gorriti 4500",
    line2: "4B",
    city: "Palermo",
    state: "Buenos Aires",
    postalCode: "1414",
    zone: ShippingZone.CABA,
    notes: "Dejar en seguridad si no responde",
    isDefault: true,
  });

  return { primary, secondary, caba };
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
      isNewArrival: false,
      salesCount: 0,
    }));

  for (const batch of chunk(catalogCardsToCreate, 250)) {
    if (batch.length === 0) {
      continue;
    }

    await prisma.card.createMany({ data: batch });
  }
}

async function createActivity(userId, action, ipAddress, details) {
  await prisma.userActivity.create({
    data: {
      userId,
      action,
      ipAddress,
      userAgent: "seed-script",
      details,
    },
  });
}

async function seedOrders(users, addresses) {
  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    return;
  }

  const cards = await prisma.card.findMany({
    where: {
      ygoproId: {
        in: [89631139, 46986414, 12580477, 83764718],
      },
    },
  });

  const cardMap = new Map(cards.map((card) => [card.ygoproId, card]));

  const orders = [
    {
      userId: users.primaryCustomer.id,
      addressId: addresses.primary.id,
      status: OrderStatus.PAID,
      zone: ShippingZone.GBA,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
      customerName: users.primaryCustomer.fullName,
      customerEmail: users.primaryCustomer.email,
      customerPhone: users.primaryCustomer.phone,
      shippingAddress: `${addresses.primary.line1}, ${addresses.primary.city}`,
      shippingCity: addresses.primary.city,
      shippingProvince: addresses.primary.state,
      shippingPostalCode: addresses.primary.postalCode,
      notes: "Entregar por la tarde",
      items: [
        { ygoproId: 89631139, quantity: 1 },
        { ygoproId: 12580477, quantity: 2 },
      ],
    },
    {
      userId: users.cabaCustomer.id,
      addressId: addresses.caba.id,
      status: OrderStatus.SHIPPED,
      zone: ShippingZone.CABA,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      customerName: users.cabaCustomer.fullName,
      customerEmail: users.cabaCustomer.email,
      customerPhone: users.cabaCustomer.phone,
      shippingAddress: `${addresses.caba.line1}, ${addresses.caba.city}`,
      shippingCity: addresses.caba.city,
      shippingProvince: addresses.caba.state,
      shippingPostalCode: addresses.caba.postalCode,
      notes: "Avisar por WhatsApp antes de enviar",
      items: [{ ygoproId: 46986414, quantity: 1 }],
    },
    {
      userId: users.primaryCustomer.id,
      addressId: addresses.secondary.id,
      status: OrderStatus.COMPLETED,
      zone: ShippingZone.CABA,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      customerName: users.primaryCustomer.fullName,
      customerEmail: users.primaryCustomer.email,
      customerPhone: users.primaryCustomer.phone,
      shippingAddress: `${addresses.secondary.line1}, ${addresses.secondary.city}`,
      shippingCity: addresses.secondary.city,
      shippingProvince: addresses.secondary.state,
      shippingPostalCode: addresses.secondary.postalCode,
      notes: "Recibir en recepción",
      items: [{ ygoproId: 83764718, quantity: 1 }],
    },
    {
      userId: users.primaryCustomer.id,
      addressId: addresses.primary.id,
      status: OrderStatus.PENDING_PAYMENT,
      zone: ShippingZone.GBA,
      createdAt: new Date(),
      customerName: users.primaryCustomer.fullName,
      customerEmail: users.primaryCustomer.email,
      customerPhone: users.primaryCustomer.phone,
      shippingAddress: `${addresses.primary.line1}, ${addresses.primary.city}`,
      shippingCity: addresses.primary.city,
      shippingProvince: addresses.primary.state,
      shippingPostalCode: addresses.primary.postalCode,
      notes: "Pendiente de transferencia",
      items: [{ ygoproId: 12580477, quantity: 1 }],
    },
  ];

  for (const entry of orders) {
    const items = entry.items
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

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = buildShipping(entry.zone);

    await prisma.order.create({
      data: {
        userId: entry.userId,
        addressId: entry.addressId,
        subtotal,
        shippingCost: shipping.cost,
        total: Number((subtotal + shipping.cost).toFixed(2)),
        status: entry.status,
        shippingZone: entry.zone,
        shippingLabel: shipping.label,
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        customerPhone: entry.customerPhone,
        shippingAddress: entry.shippingAddress,
        shippingCity: entry.shippingCity,
        shippingProvince: entry.shippingProvince,
        shippingPostalCode: entry.shippingPostalCode,
        notes: entry.notes,
        createdAt: entry.createdAt,
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
      if ([OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(item.order.status)) {
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

async function seedActivities(users) {
  await Promise.all([
    createActivity(users.admin.id, "AUTH_LOGIN", "127.0.0.1", "Ingreso inicial administrador"),
    createActivity(users.staff.id, "AUTH_LOGIN", "127.0.0.1", "Ingreso inicial staff"),
    createActivity(users.primaryCustomer.id, "CHECKOUT_STARTED", "190.245.12.8", "Cliente inició checkout en GBA"),
    createActivity(users.primaryCustomer.id, "PROFILE_UPDATED", "190.245.12.8", "Actualizó teléfono y avatar"),
    createActivity(users.cabaCustomer.id, "AUTH_LOGIN", "181.31.80.10", "Cliente de CABA activo"),
  ]);
}

async function seedAppSettings() {
  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "support_whatsapp_number" },
      update: {},
      create: {
        key: "support_whatsapp_number",
        value: "5491122334455",
      },
    }),
    prisma.appSetting.upsert({
      where: { key: "support_email" },
      update: {},
      create: {
        key: "support_email",
        value: "crisnehu@gmail.com",
      },
    }),
    prisma.appSetting.upsert({
      where: { key: "catalog_scope_mode" },
      update: {},
      create: {
        key: "catalog_scope_mode",
        value: "ALL",
      },
    }),
    prisma.appSetting.upsert({
      where: { key: "catalog_scope_limit" },
      update: {},
      create: {
        key: "catalog_scope_limit",
        value: "500",
      },
    }),
    prisma.appSetting.upsert({
      where: { key: "catalog_scope_selected_ids" },
      update: {},
      create: {
        key: "catalog_scope_selected_ids",
        value: "[]",
      },
    }),
  ]);
}

async function shouldSkipHeavyDevSeed() {
  if (process.env.SKIP_FULL_SEED_IF_READY !== "1") {
    return false;
  }

  const [userCount, cardCount, appSettingCount] = await Promise.all([
    prisma.user.count(),
    prisma.card.count(),
    prisma.appSetting.count(),
  ]);

  return userCount >= 4 && cardCount >= 100 && appSettingCount >= 1;
}

async function main() {
  if (await shouldSkipHeavyDevSeed()) {
    console.log("[seed] Datos base ya presentes. Se omite full seed para acelerar el arranque.");
    return;
  }

  const users = await seedUsers();
  const addresses = await seedAddresses(users);
  await seedAppSettings();
  await seedInventory();
  await seedOrders(users, addresses);
  await seedActivities(users);
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