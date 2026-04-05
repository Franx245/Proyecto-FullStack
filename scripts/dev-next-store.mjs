import { spawn } from "node:child_process";
import net from "node:net";

const host = "127.0.0.1";
const FIXED_API_PORT = 3311;
const FIXED_NEXT_PORT = 3005;
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

async function assertPortAvailable(port) {
  if (await canConnect(port, host)) {
    throw new Error(`Port ${port} for Next storefront is already in use. Free it before starting the service.`);
  }

  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Port ${port} for Next storefront is already reserved by another process.`)));
    server.once("listening", () => server.close(resolve));
    server.listen(port, host);
  });
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
    throw new Error(`Expected ${envName}=${expectedValue}, received ${currentValue}. Fix the environment before starting the storefront.`);
  }
}

function assertExpectedPort() {
  const configuredPort = process.env.NEXT_STORE_PORT;
  if (configuredPort && Number(configuredPort) !== FIXED_NEXT_PORT) {
    throw new Error(`Expected NEXT_STORE_PORT=${FIXED_NEXT_PORT}, received ${configuredPort}. Fix the environment before starting the storefront.`);
  }
}

function validateDeterministicEnv(apiBaseUrl, storefrontBaseUrl) {
  assertExpectedEnv("API_PORT", String(FIXED_API_PORT));
  assertExpectedEnv("NEXT_STORE_PORT", String(FIXED_NEXT_PORT));
  assertExpectedEnv("BACKEND_URL", apiBaseUrl);
  assertExpectedEnv("FRONTEND_URL", storefrontBaseUrl);
  assertExpectedEnv("VITE_API_BASE_URL", apiBaseUrl);
  assertExpectedEnv("VITE_STOREFRONT_URL", storefrontBaseUrl);
  assertExpectedEnv("NEXT_PUBLIC_API_BASE_URL", apiBaseUrl);
  assertExpectedEnv("NEXT_PUBLIC_SITE_URL", storefrontBaseUrl);
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
  assertExpectedPort();
  const port = FIXED_NEXT_PORT;
  const apiBaseUrl = `http://${host}:${FIXED_API_PORT}`;
  const storefrontBaseUrl = `http://${host}:${port}`;
  validateDeterministicEnv(apiBaseUrl, storefrontBaseUrl);
  await assertPortAvailable(port);
  const command = `npx next dev --turbo --port ${port}`;
  const child = spawn(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-dev",
      PORT: String(port),
      API_PORT: String(FIXED_API_PORT),
      NEXT_STORE_PORT: String(port),
      BACKEND_URL: apiBaseUrl,
      FRONTEND_URL: storefrontBaseUrl,
      VITE_API_BASE_URL: apiBaseUrl,
      VITE_STOREFRONT_URL: storefrontBaseUrl,
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_SITE_URL: storefrontBaseUrl,
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