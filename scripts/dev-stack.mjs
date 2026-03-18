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

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
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

async function waitForUrl(url, label, timeoutMs = 45000) {
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

    await new Promise((resolve) => setTimeout(resolve, 800));
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
  const storePort = await findPort(Number(process.env.STORE_PORT || 5173), reservedPorts);
  reservedPorts.add(storePort);
  const adminPort = await findPort(Number(process.env.ADMIN_PORT || 5174), reservedPorts);

  console.log(`[boot] Using ports api=${apiPort} store=${storePort} admin=${adminPort}`);
  console.log("[boot] Preparing database and seed data...");
  await runCommand("prepare", "npm run setup:dev", {
    ...process.env,
    API_PORT: String(apiPort),
    STORE_PORT: String(storePort),
    ADMIN_PORT: String(adminPort),
  });

  const sharedEnv = {
    ...process.env,
    API_PORT: String(apiPort),
    STORE_PORT: String(storePort),
    ADMIN_PORT: String(adminPort),
  };

  const api = spawnService("api", "npm run dev:api", {
    ...sharedEnv,
    PORT: String(apiPort),
  });
  const store = spawnService("store", "npm run dev:store", sharedEnv);
  const admin = spawnService("admin", "npm run dev:admin", sharedEnv);

  const serviceHealthChecks = new Map([
    [api, { label: "api", url: `http://${host}:${apiPort}/api/health` }],
    [store, { label: "store", url: `http://${host}:${storePort}` }],
    [admin, { label: "admin", url: `http://${host}:${adminPort}` }],
  ]);

  children.push(api, store, admin);

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
    waitForUrl(`http://${host}:${apiPort}/api/health`, "api"),
    waitForUrl(`http://${host}:${storePort}`, "store"),
    waitForUrl(`http://${host}:${adminPort}`, "admin"),
  ]);

  console.log("[boot] DuelVault stack ready.");
  console.log(`[boot] Store: http://${host}:${storePort}`);
  console.log(`[boot] Admin: http://${host}:${adminPort}`);
  console.log(`[boot] API:   http://${host}:${apiPort}`);
  console.log("[boot] Default admin login: admin / admin");
}

main().catch((error) => {
  console.error(`[boot] ${error.message}`);
  shutdown(1);
});