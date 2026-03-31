import { isRedisEnabled, redis } from "./redis.js";

const fallbackBuckets = new Map();
const FALLBACK_CLEANUP_INTERVAL_MS = 60 * 1000;
let nextFallbackCleanupAt = 0;

export function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function buildRateLimitError(message, code, retryAfterSeconds) {
  const error = new Error(message);
  error.statusCode = 429;
  error.code = code;
  error.details = {
    retryAfterSeconds,
  };
  return error;
}

function cleanupFallbackBuckets(now) {
  if (now < nextFallbackCleanupAt) {
    return;
  }

  for (const [key, bucket] of fallbackBuckets.entries()) {
    if (bucket.resetAt <= now) {
      fallbackBuckets.delete(key);
    }
  }

  nextFallbackCleanupAt = now + FALLBACK_CLEANUP_INTERVAL_MS;
}

function incrementFallbackBucket(key, windowMs) {
  const now = Date.now();
  cleanupFallbackBuckets(now);

  const existingBucket = fallbackBuckets.get(key);
  if (!existingBucket || existingBucket.resetAt <= now) {
    const nextBucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    fallbackBuckets.set(key, nextBucket);
    return {
      count: nextBucket.count,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  existingBucket.count += 1;
  return {
    count: existingBucket.count,
    retryAfterSeconds: Math.max(1, Math.ceil((existingBucket.resetAt - now) / 1000)),
  };
}

async function incrementRedisBucket(key, windowMs) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const count = Number(await redis.incr(key));
  let retryAfterSeconds = Number(await redis.ttl(key));

  if (count === 1 || retryAfterSeconds < 0) {
    await redis.expire(key, windowSeconds);
    retryAfterSeconds = windowSeconds;
  }

  return {
    count,
    retryAfterSeconds: Math.max(1, retryAfterSeconds || windowSeconds),
  };
}

function buildKeyPart(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown";
}

function setRateLimitHeaders(res, limit, count, retryAfterSeconds) {
  const remaining = Math.max(limit - count, 0);

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

  if (remaining === 0) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }
}

export function createRateLimitMiddleware({
  keyPrefix,
  windowMs,
  maxRequests,
  message,
  code = "RATE_LIMIT_EXCEEDED",
  buildKey,
}) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const identifier = buildKeyPart(buildKey ? buildKey(req) : `${req.method}:${req.path}:${getRequestIp(req)}`);
      const key = `${buildKeyPart(keyPrefix)}:${identifier}`;
      const bucket = isRedisEnabled()
        ? await incrementRedisBucket(key, windowMs)
        : incrementFallbackBucket(key, windowMs);

      setRateLimitHeaders(res, maxRequests, bucket.count, bucket.retryAfterSeconds);

      if (bucket.count > maxRequests) {
        next(buildRateLimitError(message, code, bucket.retryAfterSeconds));
        return;
      }

      next();
    } catch (error) {
      console.error("[rate-limit] failed open", {
        keyPrefix,
        message: error instanceof Error ? error.message : String(error),
      });
      next();
    }
  };
}

function buildValidationError(issues, message, code) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.details = {
    issues,
  };
  return error;
}

export function validateBody(schema, { target = "validatedBody", code = "VALIDATION_ERROR" } = {}) {
  return function validateBodyMiddleware(req, _res, next) {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));
      const firstMessage = issues[0]?.message || "Request body validation failed";

      next(buildValidationError(issues, firstMessage, code));
      return;
    }

    req[target] = result.data;
    next();
  };
}