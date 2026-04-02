function normalizeLogValue(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code || null,
      statusCode: value.statusCode || null,
    };
  }

  if (depth >= 5) {
    return "[MaxDepth]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => normalizeLogValue(entry, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const normalized = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "function") {
        continue;
      }

      const nextValue = normalizeLogValue(entry, depth + 1, seen);
      if (nextValue !== undefined) {
        normalized[key] = nextValue;
      }
    }
    seen.delete(value);
    return normalized;
  }

  return String(value);
}

export function logEvent(type, message, data = {}) {
  const normalizedData = data && typeof data === "object" && !Array.isArray(data)
    ? normalizeLogValue(data)
    : { value: normalizeLogValue(data) };

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    type,
    message,
    ...(normalizedData || {}),
  }));
}

export function toLogError(error) {
  return normalizeLogValue(error);
}

export function toLogData(data) {
  return normalizeLogValue(data);
}