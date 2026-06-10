import type { ComponentType } from 'react';
import type { ViewStyle } from 'react-native';
import type { Category } from './database';

/**
 * Pending "container transform" handoff between a pressed fact card and the
 * fact/morph/[id] route.
 *
 * Flow: ImageFactCard measures itself on press-IN (measureInWindow is async,
 * so starting at press-in guarantees the rect is registered by the time the
 * press handler pushes the route). The surface's press handler then asks
 * factDetailBasePath() which route to push: when a fresh measurement for that
 * fact id exists it pushes fact/morph/[id] (transparentModal, no native
 * animation), whose FactMorphContainer expands from this rect to full screen.
 *
 * Module state, single slot: a new press-in simply overwrites the previous
 * one. Consumers guard with fact id + TTL, so a stale registration (e.g. a
 * press-in that turned into a scroll) can never attach to the wrong push.
 */
export interface FactMorphSource {
  factId: number;
  /** Window-absolute frame of the pressed card (measureInWindow). */
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  /** Resolved URI the card is currently displaying (local cache or remote). */
  imageUri: string | null;
  /** Raw remote image URL (FavoriteButton replica needs the original prop). */
  imageUrl?: string;
  title: string;
  category?: string | Category;
  categorySlug?: string;
  titleNumberOfLines?: number;
  isPremiumLocked?: boolean;
  /** The card's resolved content overlay style, for a pixel-matching replica. */
  contentOverlayStyle?: ViewStyle;
  favoritePositionStyle?: ViewStyle;
  TitleComponent?: ComponentType<any>;
}

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

/**
 * Which fact-detail route a press should push. Surfaces using fact cards that
 * register a morph (ImageFactCard) get the morph transition; everything else
 * (compact rows, notifications, deep links) keeps the plain card presentation.
 */
export function factDetailBasePath(factId: number): '/fact/morph' | '/fact' {
  return hasPendingFactMorph(factId) ? '/fact/morph' : '/fact';
}
