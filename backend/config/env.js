import "../src/lib/load-env.js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const VALID_CACHE_MODES = new Set(["memory", "upstash"]);
const VALID_WORKER_MODES = new Set(["external", "inline"]);
const VALID_SHIPPING_MODES = new Set(["fallback", "real"]);

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeBaseUrl(value) {
  return normalizeString(value).replace(/\/$/, "");
}

export const isProd = normalizeString(process.env.NODE_ENV).toLowerCase() === "production";
export const isDev = !isProd;

function warnConfig(message, details = null) {
  if (details && Object.keys(details).length > 0) {
    console.warn(`[config] ${message}`, details);
    return;
  }

  console.warn(`[config] ${message}`);
}

function failProd(message, details = null) {
  const error = new Error(message);
  if (details && Object.keys(details).length > 0) {
    error.details = details;
  }
  throw error;
}

function resolveMode(envName, validModes, fallback) {
  const rawValue = normalizeString(process.env[envName]).toLowerCase();
  if (!rawValue) {
    return fallback;
  }

  if (validModes.has(rawValue)) {
    return rawValue;
  }

  const message = `${envName} has invalid value \"${rawValue}\"; using \"${fallback}\"`;
  const details = {
    envName,
    value: rawValue,
    fallback,
  };

  if (isProd) {
    failProd(message, details);
  }

  warnConfig(message, details);
  return fallback;
}

function isLocalhostHostname(hostname) {
  return LOCAL_HOSTNAMES.has(normalizeString(hostname).toLowerCase());
}

function extractHostnameFromUrl(value) {
  try {
    return new URL(normalizeString(value)).hostname;
  } catch {
    return "";
  }
}

function isLocalUrl(value) {
  const hostname = extractHostnameFromUrl(value);
  return Boolean(hostname && isLocalhostHostname(hostname));
}

function validateConfiguredUrl(envName) {
  const value = normalizeBaseUrl(process.env[envName]);
  if (!value) {
    return;
  }

  if (isProd && isLocalUrl(value)) {
    failProd(`${envName} must not point to localhost in production`, {
      [envName]: value,
    });
    return;
  }

  if (isDev && !isLocalUrl(value)) {
    warnConfig(`${envName} points to a non-local URL in development`, {
      [envName]: value,
    });
  }
}

function resolveRedisPort(rawValue, fallback = 6379) {
  const normalizedValue = normalizeString(rawValue);
  if (!normalizedValue) {
    return fallback;
  }

  const parsedValue = Number(normalizedValue);
  if (Number.isInteger(parsedValue) && parsedValue > 0 && parsedValue < 65536) {
    return parsedValue;
  }

  const message = `REDIS_PORT has invalid value \"${normalizedValue}\"; using ${fallback}`;
  const details = {
    REDIS_PORT: normalizedValue,
    fallback,
  };

  if (isProd) {
    failProd(message, details);
  }

  warnConfig(message, details);
  return fallback;
}

validateConfiguredUrl("BACKEND_URL");
validateConfiguredUrl("FRONTEND_URL");
validateConfiguredUrl("ADMIN_URL");

const configuredRedisHost = normalizeString(process.env.REDIS_HOST);
const configuredRedisPort = resolveRedisPort(process.env.REDIS_PORT, 6379);
const configuredRedisTcpUrl = normalizeBaseUrl(process.env.REDIS_TCP_URL);
const configuredRedisUrl = normalizeBaseUrl(process.env.REDIS_URL);

let resolvedRedisHost = configuredRedisHost || "127.0.0.1";
let resolvedRedisPort = configuredRedisPort;
let resolvedRedisUrl = "";
let resolvedRedisSource = "REDIS_HOST";

if (isDev) {
  if (configuredRedisTcpUrl || configuredRedisUrl) {
    warnConfig("REDIS_TCP_URL/REDIS_URL are ignored in development; using REDIS_HOST/REDIS_PORT", {
      REDIS_TCP_URL: configuredRedisTcpUrl || null,
      REDIS_URL: configuredRedisUrl || null,
    });
  }

  if (configuredRedisHost && !isLocalhostHostname(configuredRedisHost)) {
    warnConfig("REDIS_HOST points to a non-local host in development; using 127.0.0.1", {
      REDIS_HOST: configuredRedisHost,
    });
    resolvedRedisHost = "127.0.0.1";
  }

  resolvedRedisSource = "local-host-port";
} else {
  resolvedRedisUrl = configuredRedisTcpUrl || configuredRedisUrl;
  if (resolvedRedisUrl) {
    if (isLocalUrl(resolvedRedisUrl)) {
      failProd("Redis TCP URL must not point to localhost in production", {
        redisUrl: resolvedRedisUrl,
      });
    }

    resolvedRedisSource = configuredRedisTcpUrl ? "REDIS_TCP_URL" : "REDIS_URL";
  } else if (configuredRedisHost) {
    if (isLocalhostHostname(configuredRedisHost)) {
      failProd("REDIS_HOST must not point to localhost in production", {
        REDIS_HOST: configuredRedisHost,
      });
    }

    resolvedRedisSource = "REDIS_HOST";
  } else {
    failProd("Redis TCP configuration is required in production", {
      envKeys: ["REDIS_TCP_URL", "REDIS_URL", "REDIS_HOST", "REDIS_PORT"],
    });
  }
}

let resolvedCacheMode = resolveMode("CACHE_MODE", VALID_CACHE_MODES, isProd ? "upstash" : "memory");
if (isDev && resolvedCacheMode !== "memory") {
  warnConfig("CACHE_MODE is forced to memory in development; remote cache credentials will be ignored", {
    CACHE_MODE: resolvedCacheMode,
  });
  resolvedCacheMode = "memory";
}

const configuredUpstashUrl = normalizeBaseUrl(process.env.UPSTASH_REDIS_REST_URL);
const configuredUpstashToken = normalizeString(process.env.UPSTASH_REDIS_REST_TOKEN);

if (resolvedCacheMode === "upstash") {
  if (isProd && (!configuredUpstashUrl || !configuredUpstashToken)) {
    failProd("CACHE_MODE=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production", {
      hasUrl: Boolean(configuredUpstashUrl),
      hasToken: Boolean(configuredUpstashToken),
    });
  }

  if (isProd && configuredUpstashUrl && isLocalUrl(configuredUpstashUrl)) {
    failProd("UPSTASH_REDIS_REST_URL must not point to localhost in production", {
      UPSTASH_REDIS_REST_URL: configuredUpstashUrl,
    });
  }
} else if (isDev && (configuredUpstashUrl || configuredUpstashToken)) {
  warnConfig("Upstash credentials are ignored while CACHE_MODE=memory in development", {
    hasUrl: Boolean(configuredUpstashUrl),
    hasToken: Boolean(configuredUpstashToken),
  });
}

export const cacheMode = resolvedCacheMode;
export const workerMode = resolveMode("WORKER_MODE", VALID_WORKER_MODES, "external");
export const shippingMode = resolveMode("SHIPPING_MODE", VALID_SHIPPING_MODES, "fallback");

const configuredEnviaBaseUrl = normalizeBaseUrl(process.env.ENVIA_BASE_URL || "https://api-test.envia.com");
if (shippingMode === "real") {
  if (isProd && isLocalUrl(configuredEnviaBaseUrl)) {
    failProd("ENVIA_BASE_URL must not point to localhost in production when SHIPPING_MODE=real", {
      ENVIA_BASE_URL: configuredEnviaBaseUrl,
    });
  }

  if (isDev && !normalizeString(process.env.ENVIA_API_KEY)) {
    warnConfig("SHIPPING_MODE=real without ENVIA_API_KEY may fail to reach Envia", {
      ENVIA_BASE_URL: configuredEnviaBaseUrl,
    });
  }
}

export const redisConfig = Object.freeze({
  host: resolvedRedisHost || null,
  port: resolvedRedisPort,
  url: resolvedRedisUrl || null,
  source: resolvedRedisSource,
  target: resolvedRedisUrl || `redis://${resolvedRedisHost}:${resolvedRedisPort}`,
});