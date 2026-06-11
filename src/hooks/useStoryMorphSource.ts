import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getActiveStoryMorph,
  setPendingStoryMorph,
  subscribeActiveStoryMorph,
} from '../services/storyMorph';

import type { StoryMorphSource } from '../services/storyMorph';

/**
 * Button-side half of the story morph handoff — the story-row twin of
 * useFactMorphSource.
 *
 * `registerMorphSource` registers the measured circle on press-in (and
 * remembers the object). `isMorphSourceActive` flips true while a morph
 * presentation for THAT registration is on screen — the circle must hide
 * itself (opacity 0) for the duration, or the closing screen shrinks down on
 * top of a still-visible duplicate. The morph container always covers the
 * registered rect, so the hidden circle never reads as a hole in the row.
 *
 * `categorySlug` re-checks on cell recycling: if FlashList rebinds this
 * component instance to a different category while a morph is open (row
 * re-sort), the stale hide is dropped.
 */
export function useStoryMorphSource(categorySlug: string) {
  const registeredRef = useRef<StoryMorphSource | null>(null);
  const [isMorphSourceActive, setIsMorphSourceActive] = useState(false);

  useEffect(() => {
    const compute = (active: StoryMorphSource | null) => {
      setIsMorphSourceActive(
        active !== null && active === registeredRef.current && active.categorySlug === categorySlug
      );
    };
    compute(getActiveStoryMorph());
    return subscribeActiveStoryMorph(compute);
  }, [categorySlug]);

  const registerMorphSource = useCallback((source: StoryMorphSource) => {
    registeredRef.current = source;
    setPendingStoryMorph(source);
  }, []);

  return { registerMorphSource, isMorphSourceActive };
}
