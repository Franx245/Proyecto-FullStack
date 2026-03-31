import { spawn } from "node:child_process";
import net from "node:net";

const host = "127.0.0.1";
const preferredPort = Number(process.env.NEXT_STORE_PORT || process.env.PORT || 3003);
const prewarmRoutes = ["/", "/singles", "/orders", "/auth?redirect=/cart"];

function prefixOutput(chunk, label) {
  const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`[${label}] ${line}`);
  }
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

    server.listen(port, host);
  });
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 10; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`No free port found near ${startPort}`);
}

async function waitForUrl(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function prewarmUrl(baseUrl, route) {
  const targetUrl = `${baseUrl}${route}`;
  const start = performance.now();

  try {
    const response = await fetch(targetUrl);
    const duration = Math.round(performance.now() - start);
    console.log(`[warm] ${route} -> ${response.status} in ${duration}ms`);
  } catch (error) {
    console.warn(`[warm] ${route} failed: ${error.message}`);
  }
}

async function main() {
  const port = await findPort(preferredPort);
  const command = `npx next dev --turbo --port ${port}`;
  const child = spawn(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-dev",
      PORT: String(port),
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let shuttingDown = false;
  const shutdown = (code = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    if (!child.killed) {
      child.kill();
    }
    setTimeout(() => process.exit(code), 100);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  child.stdout.on("data", (chunk) => prefixOutput(chunk, "next"));
  child.stderr.on("data", (chunk) => prefixOutput(chunk, "next"));

  child.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    process.exit(code ?? 0);
  });

  const baseUrl = `http://${host}:${port}`;
  const isReady = await waitForUrl(baseUrl);
  if (!isReady) {
    throw new Error(`Timed out waiting for Next dev at ${baseUrl}`);
  }

  console.log(`[ready] Next dev: ${baseUrl}`);

  for (const route of prewarmRoutes) {
    await prewarmUrl(baseUrl, route);
  }
}

main().catch((error) => {
  console.error(`[boot] ${error.message}`);
  process.exit(1);
});