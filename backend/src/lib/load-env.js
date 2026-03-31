import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

function buildDirectDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(databaseUrl);
    if (!parsedUrl.hostname.endsWith("pooler.supabase.com")) {
      return databaseUrl;
    }

    const usernameParts = parsedUrl.username.split(".");
    const projectRef = usernameParts.length > 1 ? usernameParts.slice(1).join(".") : "";
    if (!projectRef) {
      return databaseUrl;
    }

    parsedUrl.username = usernameParts[0] || parsedUrl.username;
    parsedUrl.hostname = `db.${projectRef}.supabase.co`;
    parsedUrl.port = "5432";
    return parsedUrl.toString();
  } catch {
    return databaseUrl;
  }
}

function buildCandidateEnvFiles() {
  const mode = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  const candidates = [];

  if (mode) {
    candidates.push(`.env.${mode}.local`);
  }

  candidates.push(".env.local");

  if (mode) {
    candidates.push(`.env.${mode}`);
  }

  candidates.push(".env");

  return Array.from(new Set(candidates));
}

export function loadWorkspaceEnv() {
  const loadedFiles = [];

  for (const filename of buildCandidateEnvFiles()) {
    const filePath = path.join(repoRoot, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    process.loadEnvFile(filePath);
    loadedFiles.push(filePath);
  }

  if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
    process.env.DIRECT_URL = buildDirectDatabaseUrl(process.env.DATABASE_URL);
  }

  return loadedFiles;
}

loadWorkspaceEnv();

export { repoRoot };
