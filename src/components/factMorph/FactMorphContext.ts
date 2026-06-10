import { createContext, useContext } from 'react';

/**
 * Provided by FactMorphContainer when the fact detail screen is presented via
 * the morph (container transform) route. Screens inside it must close through
 * `close()` so the reverse morph plays before the route is popped; when the
 * context is null the host is a regular card/modal presentation and a plain
 * router.back() is correct.
 */
export interface FactMorphController {
  close: () => void;
}

export const FactMorphContext = createContext<FactMorphController | null>(null);

export function useFactMorph(): FactMorphController | null {
  return useContext(FactMorphContext);
}
