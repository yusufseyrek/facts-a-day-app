import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getActiveFactMorph,
  setPendingFactMorph,
  subscribeActiveFactMorph,
} from '../services/factMorph';

import type { FactMorphSource } from '../services/factMorph';

/**
 * Card-side half of the morph transition handoff.
 *
 * `registerMorphSource` registers the measured source on press-in (and
 * remembers the object). `isMorphSourceActive` flips true while a morph
 * presentation for THAT registration is on screen — the card must hide
 * itself (opacity 0) for the duration, or the closing screen shrinks down on
 * top of a still-visible duplicate. The morph container always covers the
 * registered rect, so the hidden card never reads as a hole in the feed.
 *
 * `factId` re-checks on cell recycling: if FlashList rebinds this component
 * instance to a different fact while a morph is open (background feed
 * refresh), the stale hide is dropped.
 */
export function useFactMorphSource(factId: number) {
  const registeredRef = useRef<FactMorphSource | null>(null);
  const [isMorphSourceActive, setIsMorphSourceActive] = useState(false);

  useEffect(() => {
    const compute = (active: FactMorphSource | null) => {
      setIsMorphSourceActive(
        active !== null && active === registeredRef.current && active.factId === factId
      );
    };
    compute(getActiveFactMorph());
    return subscribeActiveFactMorph(compute);
  }, [factId]);

  const registerMorphSource = useCallback((source: FactMorphSource) => {
    registeredRef.current = source;
    setPendingFactMorph(source);
  }, []);

  return { registerMorphSource, isMorphSourceActive };
}
