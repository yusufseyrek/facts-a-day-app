/**
 * Ad Keywords Service
 * 
 * Manages keywords for banner ads using a Set to ensure uniqueness.
 * 
 * Strategy: 5 keywords total
 * - 4 core keywords (app identity, always included)
 * - 1 category keyword (from user's last viewed fact)
 */

// Core keywords that always apply to the app (4 keywords)
const CORE_KEYWORDS = ['daily facts', 'trivia', 'education', 'learning'] as const;

// Current category keyword (only 1, from last viewed fact)
let currentCategoryKeyword: string | null = null;

// Listeners for keyword changes
type KeywordListener = (keywords: string[]) => void;
const listeners = new Set<KeywordListener>();

/**
 * Get current keywords array for ad requests
 * Returns: 4 core + 1 category (if set) = max 5 keywords
 */
export function getAdKeywords(): string[] {
  const keywords: string[] = [...CORE_KEYWORDS];
  
  if (currentCategoryKeyword) {
    keywords.push(currentCategoryKeyword);
  }
  
  return keywords;
}

/**
 * Set the category keyword (replaces previous one)
 * Only keeps the most recent category from user interaction
 * @param categorySlug - Category slug from the fact
 */
export function addCategoryKeyword(categorySlug: string | undefined | null): void {
  if (!categorySlug || typeof categorySlug !== 'string') return;
  
  // Convert slug to keyword (e.g., 'science-technology' -> 'science technology')
  const normalized = categorySlug.replace(/-/g, ' ').toLowerCase().trim().slice(0, 80);
  
  // Skip if empty or already a core keyword
  if (!normalized || (CORE_KEYWORDS as readonly string[]).includes(normalized)) return;
  
  // Skip if same as current
  if (currentCategoryKeyword === normalized) return;
  
  // Set new category keyword (replaces previous)
  currentCategoryKeyword = normalized;
  
  // TODO: Remove after testing
  console.log('[adKeywords] Category keyword set:', normalized, '| All:', getAdKeywords());
  
  notifyListeners();
}

/**
 * Clear the category keyword
 */
export function clearCategoryKeyword(): void {
  if (!currentCategoryKeyword) return;
  
  currentCategoryKeyword = null;
  notifyListeners();
}

/**
 * Get current category keyword (if set)
 */
export function getCategoryKeyword(): string | null {
  return currentCategoryKeyword;
}

/**
 * Get core keywords (always included)
 */
export function getCoreKeywords(): string[] {
  return [...CORE_KEYWORDS];
}

/**
 * Subscribe to keyword changes
 * @param listener - Callback when keywords change
 * @returns Unsubscribe function
 */
export function subscribeToKeywords(listener: KeywordListener): () => void {
  listeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all listeners of keyword changes
 */
function notifyListeners(): void {
  const currentKeywords = getAdKeywords();
  listeners.forEach(listener => {
    try {
      listener(currentKeywords);
    } catch (error) {
      console.warn('[adKeywords] Listener error:', error);
    }
  });
}
