/**
 * In-memory ETag store for conditional GETs. makeRequest stamps each cacheable
 * GET response's ETag + parsed body here; on the next request for the same URL
 * it sends `If-None-Match`, and a `304 Not Modified` is served from this store
 * without re-downloading (or re-computing, server-side) the body.
 *
 * This sits BENEATH React Query: RQ avoids the request entirely within its
 * staleTime; when it does revalidate, this layer turns an unchanged response
 * into a cheap 304. The store is in-memory (per session) — RQ's disk
 * persistence already covers cold-start render, so the only cost of not
 * persisting ETags is one full 200 on the first revalidation after a restart.
 *
 * Entries are keyed by full request URL (query params included). ETag and body
 * are stored and evicted together, so a 304 always has a body to return.
 */

interface Entry {
  etag: string;
  body: unknown;
}

const cache = new Map<string, Entry>();
const MAX_ENTRIES = 100;

/** The stored ETag for a URL, to send as `If-None-Match`. */
export function getStoredEtag(url: string): string | undefined {
  return cache.get(url)?.etag;
}

/** The cached body for a URL. Use `has` semantics: an entry can legitimately
 * hold a falsy body (empty array, 0), so callers check presence separately. */
export function getCachedBody<T>(url: string): { hit: boolean; body?: T } {
  const entry = cache.get(url);
  return entry ? { hit: true, body: entry.body as T } : { hit: false };
}

/** Record an ETag + its body (oldest entry evicted at capacity). */
export function storeEtag(url: string, etag: string, body: unknown): void {
  if (!cache.has(url) && cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, { etag, body });
}

/** Test/reset hook. */
export function clearEtagCache(): void {
  cache.clear();
}
