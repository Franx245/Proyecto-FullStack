const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3001";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function loginUser(identifier, password, path) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
}

async function main() {
  const health = await request("/api/health");

  const storefrontLogin = await loginUser("user@test.com", "user123", "/api/auth/login");
  const adminLogin = await loginUser("admin@test.com", "admin123", "/api/admin/login");

  const adminHeaders = adminLogin.body?.accessToken
    ? { Authorization: `Bearer ${adminLogin.body.accessToken}` }
    : {};

  const users = await request("/api/admin/users?page=1&pageSize=5", { headers: adminHeaders });
  const orders = await request("/api/admin/orders?page=1&pageSize=5", { headers: adminHeaders });
  const cards = await request("/api/cards?page=1&pageSize=10");
  const firstCard = Array.isArray(cards.body?.cards)
    ? cards.body.cards.find((card) => Number(card?.stock || 0) > 0) || null
    : null;

  const checkout = storefrontLogin.body?.accessToken && firstCard
    ? await request("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storefrontLogin.body.accessToken}`,
        },
        body: JSON.stringify({
          accepted: true,
          shipping_zone: "pickup",
          items: [{ cardId: firstCard.id, quantity: 1 }],
        }),
      })
    : { status: 0, body: { error: "Missing login token or card with stock" } };

  console.log(JSON.stringify({
    health: {
      status: health.status,
      database: health.body?.database || null,
      prisma: health.body?.prisma || null,
    },
    storefrontLogin: {
      status: storefrontLogin.status,
      user: storefrontLogin.body?.user?.email || null,
    },
    adminLogin: {
      status: adminLogin.status,
      admin: adminLogin.body?.admin?.email || null,
    },
    users: {
      status: users.status,
      count: Array.isArray(users.body?.users) ? users.body.users.length : 0,
      pagination: users.body?.pagination || null,
    },
    orders: {
      status: orders.status,
      count: Array.isArray(orders.body?.orders) ? orders.body.orders.length : 0,
      pagination: orders.body?.pagination || null,
    },
    checkout: {
      status: checkout.status,
      orderId: checkout.body?.order?.id || null,
      orderStatus: checkout.body?.order?.status || null,
      cardId: firstCard?.id || null,
    },
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});