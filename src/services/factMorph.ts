import { type ComponentType, useSyncExternalStore } from 'react';

import type { ViewStyle } from 'react-native';
import type { SampleFact } from '../config/sampleFacts';
import type { FactViewSource } from './analytics';
import type { Category } from './database';

/**
 * Pending "container transform" handoff between a pressed fact card and the
 * fact-detail morph overlay.
 *
 * Flow: the card measures its morph anchor on press-IN — full-bleed cards
 * measure themselves, row cards measure just their thumbnail (measureInWindow
 * is async, so starting at press-in guarantees the rect is registered by the
 * time the press handler opens the fact). openFactDetail() then reads this
 * pending source: when a fresh measurement for that fact id exists it opens the
 * in-tab overlay (FactMorphOverlayHost), whose FactMorphContainer expands from
 * this rect to full screen; otherwise it falls back to the plain card route.
 *
 * Module state, single slot: a new press-in simply overwrites the previous
 * one. Consumers guard with fact id + TTL, so a stale registration (e.g. a
 * press-in that turned into a scroll) can never attach to the wrong push.
 */
interface FactMorphSourceBase {
  factId: number;
  /** Window-absolute frame of the morph anchor (measureInWindow). */
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
  /** Mirrors the card's offline-save control so the morph replica matches. */
  showOfflineSave?: boolean;
  /** The card's resolved content overlay style, for a pixel-matching replica. */
  contentOverlayStyle?: ViewStyle;
  favoritePositionStyle?: ViewStyle;
  TitleComponent?: ComponentType<any>;
}

/**
 * Square thumbnail inside a row card (CompactFactCard — On This Day, related
 * facts — and the Keep Reading rows). The registered rect is the THUMBNAIL
 * itself, not the row: the container transform starts and ends on the image,
 * and when the fact has one the replica morphs onto the detail hero frame —
 * the same image continuity as the full-bleed cards. The rest of the row
 * never moves; only its thumbnail hides while the morph covers that rect.
 */
export interface ThumbnailMorphSource extends FactMorphSourceBase {
  kind: 'thumbnail';
  /** ImagePlaceholder props for facts without a usable image. */
  categoryIcon?: string;
  categoryColor?: string;
}

/**
 * Onboarding welcome-carousel sample card. Same hero-continuous geometry as
 * 'image-card', but renders from a bundled SampleFact (no DB fact, no remote
 * URI) — factId is the synthetic negative id from sampleFactMorphId().
 */
export interface SampleCardMorphSource extends FactMorphSourceBase {
  kind: 'sample-card';
  fact: SampleFact;
}

export type FactMorphSource = ImageCardMorphSource | ThumbnailMorphSource | SampleCardMorphSource;

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

// ── Fact-detail overlay ───────────────────────────────────────────────────────
// The morph is presented as an in-(tabs) overlay rather than a root native
// modal, so the persistent tab-bar banner (rendered ABOVE this in the tabs
// layout) stays mounted and visible the whole time — the bar beneath it just
// swaps from the native tab bar to the fact action bar. A native modal would
// paint over the banner; an in-tree overlay does not.

export interface FactOverlayState {
  factId: number;
  /** The pressed card's measured morph anchor (drives the container transform). */
  source: FactMorphSource;
  /** Analytics FactViewSource — distinct from the geometric morph source. */
  viewSource?: FactViewSource;
  /** JSON-encoded number[] for prev/next, matching the route's factIds param. */
  factIds?: string;
  currentIndex?: string;
}

let activeOverlay: FactOverlayState | null = null;
const overlayListeners = new Set<() => void>();

export function openFactOverlay(state: FactOverlayState): void {
  activeOverlay = state;
  for (const l of overlayListeners) l();
}

export function closeFactOverlay(): void {
  if (!activeOverlay) return;
  activeOverlay = null;
  for (const l of overlayListeners) l();
}

export function getFactOverlay(): FactOverlayState | null {
  return activeOverlay;
}

/** Re-renders the caller when the active fact overlay changes. */
export function useFactOverlay(): FactOverlayState | null {
  return useSyncExternalStore(
    (l) => {
      overlayListeners.add(l);
      return () => {
        overlayListeners.delete(l);
      };
    },
    getFactOverlay,
    getFactOverlay
  );
}

interface FactDetailRouter {
  push: (href: string) => void;
}

/**
 * Open a fact's detail from a press. When the pressed card registered a morph
 * anchor on press-in, it opens as the in-(tabs) overlay (FactMorphOverlayHost)
 * so the persistent banner stays above it; otherwise (deep link, non-card
 * surface) it falls back to the plain card route.
 */
export function openFactDetail(
  router: FactDetailRouter,
  factId: number,
  opts: { source: FactViewSource; factIds?: number[]; currentIndex?: number }
): void {
  const morphSource = peekPendingFactMorph(factId);
  const hasList = !!opts.factIds && opts.factIds.length > 1 && opts.currentIndex !== undefined;

  if (morphSource) {
    clearPendingFactMorph(factId);
    openFactOverlay({
      factId,
      source: morphSource,
      viewSource: opts.source,
      factIds: hasList ? JSON.stringify(opts.factIds) : undefined,
      currentIndex: hasList ? String(opts.currentIndex) : undefined,
    });
    return;
  }

  if (hasList) {
    router.push(
      `/fact/${factId}?source=${opts.source}&factIds=${JSON.stringify(opts.factIds)}&currentIndex=${opts.currentIndex}`
    );
  } else {
    router.push(`/fact/${factId}?source=${opts.source}`);
  }
}
