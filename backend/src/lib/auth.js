import "./load-env.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`FATAL: ${name} environment variable is not set. Server cannot start without JWT secrets.`);
  }
  return value;
}

const ACCESS_TOKEN_SECRET = requireEnv("ACCESS_TOKEN_SECRET");
const REFRESH_TOKEN_SECRET = requireEnv("REFRESH_TOKEN_SECRET");

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "30d";

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);

  if (payload.type !== "access") {
    throw new Error("Invalid token");
  }

  return payload;
}

function resolveAccessTokenFromRequest(req, queryParamName = null) {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }

  if (queryParamName) {
    const queryToken = req.query?.[queryParamName];
    if (typeof queryToken === "string" && queryToken.trim()) {
      return queryToken.trim();
    }
  }

  return "";
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      type: "access",
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

export function signRefreshToken(user, tokenId) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      type: "refresh",
      tokenId,
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

export function getRefreshTokenExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt;
}

export function requireAuth(req, res, next) {
  const token = resolveAccessTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAuthWithAccessTokenQuery(queryParamName = "accessToken") {
  return (req, res, next) => {
    const token = resolveAccessTokenFromRequest(req, queryParamName);

    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}

export function requireAdminAuth(req, res, next) {
  return requireAuth(req, res, () => {
    if (!req.user || !["ADMIN", "STAFF"].includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    req.admin = req.user;
    next();
  });
}

export function requireAdminEventStreamAuth(req, res, next) {
  return requireAuthWithAccessTokenQuery("accessToken")(req, res, () => {
    if (!req.user || !["ADMIN", "STAFF"].includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    req.admin = req.user;
    next();
  });
}

export function requireAdminRole(roles) {
  return requireRole(roles);
}

export function createPasswordResetToken() {
  return crypto.randomBytes(24).toString("hex");
}
