/**
 * Job: cleanup-cache
 * Scans and removes expired or orphan cache keys.
 */
import { getSharedRedisClient } from "../redis-tcp.js";

const SCAN_COUNT = 500;

export async function handleCleanupCache(_jobData) {
  const client = getSharedRedisClient();
  let cursor = "0";
  let totalScanned = 0;
  let deleted = 0;

  do {
    const [nextCursor, keys] = await client.scan(cursor, "MATCH", "duelvault:*", "COUNT", SCAN_COUNT);
    cursor = nextCursor;
    totalScanned += keys.length;

    for (const key of keys) {
      const ttl = await client.ttl(key);
      // Remove keys with no TTL that aren't permanent config
      if (ttl === -1 && !key.startsWith("duelvault:config:")) {
        await client.del(key);
        deleted++;
      }
    }
  } while (cursor !== "0");

  return { scanned: totalScanned, deleted };
}
