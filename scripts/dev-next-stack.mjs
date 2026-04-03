import "../backend/src/lib/load-env.js";
import { spawn } from "child_process";
import net from "net";

const host = "127.0.0.1";

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

function isPortFree(port) {
  return new Promise(async (resolve) => {
    const localhostOccupied = await canConnect(port, host);
    if (localhostOccupied) {
      resolve(false);
      return;
    }

    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

async function findPort(preferredPort, reservedPorts = new Set()) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (reservedPorts.has(port)) {
      continue;
    }

    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`No free port found near ${preferredPort}`);
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
  const reservedPorts = new Set();
  const apiPort = await findPort(Number(process.env.API_PORT || 3001), reservedPorts);
  reservedPorts.add(apiPort);
  const nextStorePort = await findPort(Number(process.env.NEXT_STORE_PORT || 3003), reservedPorts);
  reservedPorts.add(nextStorePort);
  const adminPort = await findPort(Number(process.env.ADMIN_PORT || 5174), reservedPorts);

  const apiBaseUrl = `http://${host}:${apiPort}`;
  const nextStoreBaseUrl = `http://${host}:${nextStorePort}`;
  const adminBaseUrl = `http://${host}:${adminPort}`;

  console.log(`[boot] Using ports api=${apiPort} next=${nextStorePort} admin=${adminPort}`);
  console.log("[boot] Syncing schema...");

  await runCommand("prepare:schema", "prisma db push --skip-generate --schema backend/prisma/schema.prisma", {
    ...process.env,
    API_PORT: String(apiPort),
    NEXT_STORE_PORT: String(nextStorePort),
    ADMIN_PORT: String(adminPort),
  });

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
    NEXT_PUBLIC_LEGACY_STOREFRONT_URL: nextStoreBaseUrl,
    SKIP_FULL_SEED_IF_READY: "1",
  };

  console.log("[boot] Starting services while seed finishes...");

  const api = spawnService("api", "npm run dev:api", sharedEnv);
  const seedPromise = runCommand("prepare:seed", "prisma db seed", sharedEnv);
  const apiHealthUrl = `http://${host}:${apiPort}/api/health`;

  children.push(api);

  await waitForUrl(apiHealthUrl, "api");

  const nextStore = spawnService("next", "npm run dev:store:next", sharedEnv);
  const admin = spawnService("admin", "npm run dev:admin", sharedEnv);

  const serviceHealthChecks = new Map([
    [api, { label: "api", url: apiHealthUrl }],
    [nextStore, { label: "next", url: nextStoreBaseUrl }],
    [admin, { label: "admin", url: adminBaseUrl }],
  ]);

  children.push(nextStore, admin);

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

  console.log("[boot] DuelVault next stack ready.");
  console.log(`[boot] Next:  ${nextStoreBaseUrl}`);
  console.log(`[boot] Admin: ${adminBaseUrl}`);
  console.log(`[boot] API:   ${apiBaseUrl}`);
  console.log("[boot] Default admin login: admin@test.com / admin123");
}

main().catch((error) => {
  console.error(`[boot] ${error.message}`);
  shutdown(1);
});