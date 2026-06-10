import type { ComponentType } from 'react';
import type { ViewStyle } from 'react-native';
import type { Category } from './database';

/**
 * Pending "container transform" handoff between a pressed fact card and the
 * fact/morph/[id] route.
 *
 * Flow: the card measures itself on press-IN (measureInWindow is async, so
 * starting at press-in guarantees the rect is registered by the time the
 * press handler pushes the route). The surface's press handler then asks
 * factDetailBasePath() which route to push: when a fresh measurement for that
 * fact id exists it pushes fact/morph/[id] (transparentModal, no native
 * animation), whose FactMorphContainer expands from this rect to full screen.
 *
 * Module state, single slot: a new press-in simply overwrites the previous
 * one. Consumers guard with fact id + TTL, so a stale registration (e.g. a
 * press-in that turned into a scroll) can never attach to the wrong push.
 */
interface FactMorphSourceBase {
  factId: number;
  /** Window-absolute frame of the pressed card (measureInWindow). */
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  /** Resolved URI the card is currently displaying (local cache or remote). */
  imageUri: string | null;
  title: string;
}

/**
 * Full-bleed hero image card (ImageFactCard). The replica's image region
 * morphs from the card frame onto the detail hero frame, keeping the image
 * geometrically continuous.
 */
export interface ImageCardMorphSource extends FactMorphSourceBase {
  kind: 'image-card';
  /** Raw remote image URL (FavoriteButton replica needs the original prop). */
  imageUrl?: string;
  category?: string | Category;
  categorySlug?: string;
  titleNumberOfLines?: number;
  isPremiumLocked?: boolean;
  /** The card's resolved content overlay style, for a pixel-matching replica. */
  contentOverlayStyle?: ViewStyle;
  favoritePositionStyle?: ViewStyle;
  TitleComponent?: ComponentType<any>;
}

/**
 * Thumbnail row card (CompactFactCard, e.g. the On This Day carousel). No
 * geometric continuity to a full-width hero — the replica fades in place at
 * its original size while the container expands around it.
 */
export interface CompactCardMorphSource extends FactMorphSourceBase {
  kind: 'compact-card';
  category?: string | Category;
  hideCategoryBadge?: boolean;
  showChevron?: boolean;
  titleLines: number;
  thumbnailSize: number;
  /** ImagePlaceholder props for facts without a usable image. */
  categoryIcon?: string;
  categoryColor?: string;
}

/** Keep Reading list row. Same fade-in-place replica behavior as compact. */
export interface KeepReadingMorphSource extends FactMorphSourceBase {
  kind: 'keep-reading';
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  imageSize: number;
  /** Odd rows have a translucent card background, even rows are transparent. */
  isOdd: boolean;
}

export type FactMorphSource =
  | ImageCardMorphSource
  | CompactCardMorphSource
  | KeepReadingMorphSource;

// Long enough to survive a slow press (press-in → release), short enough that
// an abandoned press-in (scroll-through) can't leak into a later interaction.
// The fact-id match is the primary guard; the TTL is the backstop.
const PENDING_TTL_MS = 5000;

let pending: { source: FactMorphSource; at: number } | null = null;

function isValid(entry: typeof pending, factId: number): entry is NonNullable<typeof pending> {
  return !!entry && entry.source.factId === factId && Date.now() - entry.at <= PENDING_TTL_MS;
}

export function setPendingFactMorph(source: FactMorphSource): void {
  pending = { source, at: Date.now() };
}

export function hasPendingFactMorph(factId: number): boolean {
  return isValid(pending, factId);
}

/**
 * Read without clearing — safe to call from a render path (React StrictMode
 * double-invokes initializers). The route clears it post-commit via
 * clearPendingFactMorph.
 */
export function peekPendingFactMorph(factId: number): FactMorphSource | null {
  return isValid(pending, factId) ? pending!.source : null;
}

export function clearPendingFactMorph(factId: number): void {
  if (pending?.source.factId === factId) {
    pending = null;
  }
}

// ── Active morph source ─────────────────────────────────────────────────────
// While a morph presentation is on screen, the pressed card hides itself
// (like UIKit's zoom transition hiding the source cell). Without this, the
// closing screen shrinks down on top of a still-visible duplicate — clearly
// so when the rect drifted after press-in (carousel snap) or the card was
// partially off-screen. Identity is the registered source OBJECT, not the
// fact id: the same fact can appear in several feed sections at once, and
// only the instance that was actually pressed may hide.

type ActiveMorphListener = (active: FactMorphSource | null) => void;

let activeSource: FactMorphSource | null = null;
const activeListeners = new Set<ActiveMorphListener>();

/** Set by FactMorphContainer on mount (and cleared just before it pops). */
export function setActiveFactMorph(source: FactMorphSource | null): void {
  if (activeSource === source) return;
  activeSource = source;
  for (const listener of activeListeners) {
    listener(activeSource);
  }
}

export function getActiveFactMorph(): FactMorphSource | null {
  return activeSource;
}

export function subscribeActiveFactMorph(listener: ActiveMorphListener): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

/**
 * Which fact-detail route a press should push. Surfaces using fact cards that
 * register a morph (ImageFactCard, CompactFactCard, KeepReadingItem) get the
 * morph transition; everything else (notifications, deep links) keeps the
 * plain card presentation.
 */
export function factDetailBasePath(factId: number): '/fact/morph' | '/fact' {
  return hasPendingFactMorph(factId) ? '/fact/morph' : '/fact';
}
