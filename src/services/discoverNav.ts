/**
 * Tiny in-memory handoff for "open the Discover tab on this category".
 *
 * The home-screen category CTA sets a pending slug, and the Discover tab
 * consumes it on focus. Lives here (not in the deleted contentRefresh service)
 * so it survives the background-sync teardown.
 */

let pendingDiscoverCategory: string | null = null;

export function setPendingDiscoverCategory(slug: string): void {
  pendingDiscoverCategory = slug;
}

export function consumePendingDiscoverCategory(): string | null {
  const slug = pendingDiscoverCategory;
  pendingDiscoverCategory = null;
  return slug;
}
