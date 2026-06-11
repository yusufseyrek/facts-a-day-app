import { createContext, useContext } from 'react';

/**
 * Provided by StoryMorphContainer when the story screen is presented via the
 * morph (container transform) route. Screens inside it must close through
 * `close()` so the reverse morph plays before the route is popped; when the
 * context is null the host is the regular fullScreenModal presentation and a
 * plain router.back() is correct.
 */
export interface StoryMorphController {
  close: () => void;
}

export const StoryMorphContext = createContext<StoryMorphController | null>(null);

export function useStoryMorph(): StoryMorphController | null {
  return useContext(StoryMorphContext);
}
