// In-process cache with the same async shape as a Redis client, so a Redis-backed store
// can replace it later without touching the services.
//
// Values are stored as JSON strings: a cached response can never be mutated by accident,
// and a cache hit looks exactly like what Redis would give back.
export function createMemoryCache({ ttlSeconds, now = Date.now }) {
  const entries = new Map();
  // Bumped on every invalidation. remember() uses it to detect "a write happened while I was
  // reading from the database" and then skips caching that (possibly already stale) result.
  let generation = 0;

  async function get(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return JSON.parse(entry.json);
  }

  async function set(key, value) {
    entries.set(key, { json: JSON.stringify(value), expiresAt: now() + ttlSeconds * 1000 });
  }

  async function del(...keys) {
    generation++;
    for (const key of keys) entries.delete(key);
  }

  // Cache-aside: return the cached value, or load it, store it and return it.
  // Errors (e.g. a 404) are never cached: they propagate before set() is reached.
  async function remember(key, loader) {
    const cached = await get(key);
    if (cached !== undefined) return cached;

    const startedAt = generation;
    const json = JSON.stringify(await loader());
    if (startedAt === generation) await set(key, JSON.parse(json));
    // Same shape on a miss as on a hit (dates as ISO strings), so callers can't tell the difference.
    return JSON.parse(json);
  }

  return { get, set, delete: del, remember };
}
