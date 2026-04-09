import "../backend/src/lib/load-env.js";
import { spawn } from "child_process";
import net from "net";

const host = "127.0.0.1";
const FIXED_PORTS = Object.freeze({
  api: 3311,
  next: 3005,
  admin: 5198,
});

function prefixOutput(chunk, label) {
  const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`[${label}] ${line}`);
  }
}

function runCommand(label, command, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => prefixOutput(chunk, label));
    child.stderr.on("data", (chunk) => prefixOutput(chunk, label));

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

function spawnService(label, command, env = process.env) {
  const child = spawn(command, {
    cwd: process.cwd(),
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => prefixOutput(chunk, label));
  child.stderr.on("data", (chunk) => prefixOutput(chunk, label));

  return child;
}

function canConnect(port, hostname) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, hostname);
  });
}

async function assertPortAvailable(port, label) {
  if (await canConnect(port, host)) {
    throw new Error(`Port ${port} for ${label} is already in use. Free it before starting the stack.`);
  }

  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Port ${port} for ${label} is already reserved by another process.`)));
    server.once("listening", () => server.close(resolve));
    server.listen(port);
  });
}

async function resolveServiceReuse(port, label, url) {
  const portIsBusy = await canConnect(port, host);
  if (!portIsBusy) {
    return false;
  }

  if (await isUrlReady(url)) {
    console.log(`[boot] Reusing existing ${label}: ${url}`);
    return true;
  }

  throw new Error(`Port ${port} for ${label} is already in use. Free it before starting the stack.`);
}

function normalizeValue(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function assertExpectedEnv(envName, expectedValue) {
  const currentValue = process.env[envName];
  if (currentValue == null || currentValue === "") {
    return;
  }

  if (normalizeValue(currentValue) !== normalizeValue(expectedValue)) {
    throw new Error(`Expected ${envName}=${expectedValue}, received ${currentValue}. Fix the environment before starting the stack.`);
  }
}

function validateDeterministicEnv(apiBaseUrl, nextStoreBaseUrl, adminBaseUrl) {
  assertExpectedEnv("API_PORT", String(FIXED_PORTS.api));
  assertExpectedEnv("PORT", String(FIXED_PORTS.api));
  assertExpectedEnv("NEXT_STORE_PORT", String(FIXED_PORTS.next));
  assertExpectedEnv("ADMIN_PORT", String(FIXED_PORTS.admin));
  assertExpectedEnv("BACKEND_URL", apiBaseUrl);
  assertExpectedEnv("FRONTEND_URL", nextStoreBaseUrl);
  assertExpectedEnv("ADMIN_URL", adminBaseUrl);
  assertExpectedEnv("VITE_API_BASE_URL", apiBaseUrl);
  assertExpectedEnv("VITE_STOREFRONT_URL", nextStoreBaseUrl);
  assertExpectedEnv("NEXT_PUBLIC_API_BASE_URL", apiBaseUrl);
  assertExpectedEnv("NEXT_PUBLIC_SITE_URL", nextStoreBaseUrl);
}

async function waitForUrl(url, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`[ready] ${label}: ${url}`);
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  const apiPort = FIXED_PORTS.api;
  const nextStorePort = FIXED_PORTS.next;
  const adminPort = FIXED_PORTS.admin;

  const apiBaseUrl = `http://${host}:${apiPort}`;
  const nextStoreBaseUrl = `http://${host}:${nextStorePort}`;
  const adminBaseUrl = `http://${host}:${adminPort}`;
  const apiHealthUrl = `http://${host}:${apiPort}/api/health`;

  validateDeterministicEnv(apiBaseUrl, nextStoreBaseUrl, adminBaseUrl);
  const [reuseApi, reuseNext, reuseAdmin] = await Promise.all([
    resolveServiceReuse(apiPort, "api", apiHealthUrl),
    resolveServiceReuse(nextStorePort, "storefront", nextStoreBaseUrl),
    resolveServiceReuse(adminPort, "admin", adminBaseUrl),
  ]);

  await Promise.all([
    reuseApi ? Promise.resolve() : assertPortAvailable(apiPort, "api"),
    reuseNext ? Promise.resolve() : assertPortAvailable(nextStorePort, "storefront"),
    reuseAdmin ? Promise.resolve() : assertPortAvailable(adminPort, "admin"),
  ]);

  console.log(`[boot] Using ports api=${apiPort} next=${nextStorePort} admin=${adminPort}`);

  const sharedEnv = {
    ...process.env,
    API_PORT: String(apiPort),
    PORT: String(apiPort),
    NEXT_STORE_PORT: String(nextStorePort),
    ADMIN_PORT: String(adminPort),
    BACKEND_URL: apiBaseUrl,
    FRONTEND_URL: nextStoreBaseUrl,
    ADMIN_URL: adminBaseUrl,
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_STOREFRONT_URL: nextStoreBaseUrl,
    NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    NEXT_PUBLIC_SITE_URL: nextStoreBaseUrl,
    SKIP_FULL_SEED_IF_READY: "1",
  };

  let seedPromise = Promise.resolve();
  let api = null;
  let nextStore = null;
  let admin = null;

  if (!reuseApi) {
    console.log("[boot] Syncing schema...");

    await runCommand("prepare:schema", "prisma db push --skip-generate --schema backend/prisma/schema.prisma", {
      ...process.env,
      API_PORT: String(apiPort),
      NEXT_STORE_PORT: String(nextStorePort),
      ADMIN_PORT: String(adminPort),
    });

    console.log("[boot] Starting services while seed finishes...");
    api = spawnService("api", "npm run dev:api", sharedEnv);
    seedPromise = runCommand("prepare:seed", "prisma db seed", sharedEnv);
    children.push(api);
    await waitForUrl(apiHealthUrl, "api");
  }

  if (!reuseNext) {
    nextStore = spawnService("next", "npm run dev:store:next", sharedEnv);
    children.push(nextStore);
  }

  if (!reuseAdmin) {
    admin = spawnService("admin", "npm run dev:admin", sharedEnv);
    children.push(admin);
  }

  const serviceHealthChecks = new Map([
    ...(api ? [[api, { label: "api", url: apiHealthUrl }]] : []),
    ...(nextStore ? [[nextStore, { label: "next", url: nextStoreBaseUrl }]] : []),
    ...(admin ? [[admin, { label: "admin", url: adminBaseUrl }]] : []),
  ]);

  for (const child of children) {
    child.on("exit", async (code) => {
      if (shuttingDown) {
        return;
      }

      const service = serviceHealthChecks.get(child);
      const exitCode = code ?? 0;

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const serviceStillReady = service ? await isUrlReady(service.url) : false;
      if (serviceStillReady) {
        console.warn(`[boot] ${service.label} wrapper exited with code ${exitCode}, pero ${service.url} sigue respondiendo. Se mantiene el stack.`);
        return;
      }

      console.error(`[boot] ${service?.label || "service"} exited with code ${exitCode} y ya no responde. Shutting down the stack.`);
      shutdown(exitCode || 1);
    });
  }

  await Promise.all([
    seedPromise,
    waitForUrl(nextStoreBaseUrl, "next"),
    waitForUrl(adminBaseUrl, "admin"),
  ]);

  console.log("[boot] RareHunter next stack ready.");
  console.log(`[boot] Next:  ${nextStoreBaseUrl}`);
  console.log(`[boot] Admin: ${adminBaseUrl}`);
  console.log(`[boot] API:   ${apiBaseUrl}`);
  console.log("[boot] Default admin login: admin@test.com / admin123");
}

main().catch((error) => {
  console.error(`[boot] ${error.message}`);
  shutdown(1);
});