/**
 * Pending "container transform" handoff between a pressed story button and
 * the story/morph/[category] route — the story-row twin of factMorph.ts.
 *
 * Flow: CategoryButton measures its circle on press-IN (measureInWindow is
 * async, so starting at press-in guarantees the rect is registered by the
 * time the press handler pushes the route). The press handler then asks
 * storyBasePath() which route to push: when a fresh measurement for that
 * category exists it pushes story/morph/[category] (transparentModal, no
 * native animation), whose StoryMorphContainer expands from this rect to
 * full screen.
 *
 * Module state, single slot: a new press-in simply overwrites the previous
 * one. Consumers guard with category slug + TTL, so a stale registration
 * (e.g. a press-in that turned into a scroll) can never attach to the wrong
 * push.
 */
export interface StoryMorphSource {
  categorySlug: string;
  /** Window-absolute frame of the pressed circle (derived from the button). */
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  /** Circle visual props (StoryButtonCircle) so the replica pixel-matches. */
  hasUnseen: boolean;
  isMix: boolean;
  icon?: string;
  ringColor: string;
  iconColor: string;
  unseenFill: string;
  seenFill: string;
  borderColor: string;
  outerSize: number;
  innerSize: number;
  iconSize: number;
}

// Long enough to survive a slow press (press-in → release), short enough that
// an abandoned press-in (scroll-through) can't leak into a later interaction.
// The slug match is the primary guard; the TTL is the backstop.
const PENDING_TTL_MS = 5000;

let pending: { source: StoryMorphSource; at: number } | null = null;

function isValid(entry: typeof pending, slug: string): entry is NonNullable<typeof pending> {
  return !!entry && entry.source.categorySlug === slug && Date.now() - entry.at <= PENDING_TTL_MS;
}

export function setPendingStoryMorph(source: StoryMorphSource): void {
  pending = { source, at: Date.now() };
}

export function hasPendingStoryMorph(slug: string): boolean {
  return isValid(pending, slug);
}

/**
 * Read without clearing — safe to call from a render path (React StrictMode
 * double-invokes initializers). The route clears it post-commit via
 * clearPendingStoryMorph.
 */
export function peekPendingStoryMorph(slug: string): StoryMorphSource | null {
  return isValid(pending, slug) ? pending!.source : null;
}

export function clearPendingStoryMorph(slug: string): void {
  if (pending?.source.categorySlug === slug) {
    pending = null;
  }
}

// ── Active morph source ─────────────────────────────────────────────────────
// While a morph presentation is on screen, the pressed circle hides itself
// (like UIKit's zoom transition hiding the source cell), and is revealed one
// commit before the pop under the replica's exact cover. Identity is the
// registered source OBJECT, not the slug, mirroring factMorph: only the
// instance that was actually pressed may hide.

type ActiveMorphListener = (active: StoryMorphSource | null) => void;

let activeSource: StoryMorphSource | null = null;
const activeListeners = new Set<ActiveMorphListener>();

/** Set by StoryMorphContainer on mount (and cleared just before it pops). */
export function setActiveStoryMorph(source: StoryMorphSource | null): void {
  if (activeSource === source) return;
  activeSource = source;
  for (const listener of activeListeners) {
    listener(activeSource);
  }
}

export function getActiveStoryMorph(): StoryMorphSource | null {
  return activeSource;
}

export function subscribeActiveStoryMorph(listener: ActiveMorphListener): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

/**
 * Which story route a press should push. Story buttons that registered a
 * morph get the container transform; everything else (deep links, stale
 * state) keeps the plain fullScreenModal presentation.
 */
export function storyBasePath(slug: string): '/story/morph' | '/story' {
  return hasPendingStoryMorph(slug) ? '/story/morph' : '/story';
}
