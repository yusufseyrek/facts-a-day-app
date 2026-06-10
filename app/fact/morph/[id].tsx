import { useEffect, useState } from 'react';

import { Redirect, useLocalSearchParams } from 'expo-router';

import { FactMorphContainer } from '../../../src/components/factMorph/FactMorphContainer';
import { clearPendingFactMorph, peekPendingFactMorph } from '../../../src/services/factMorph';
import FactDetailScreen from '../[id]';

/**
 * Morph-presented variant of the fact detail screen ("container transform").
 *
 * Registered as presentation:'transparentModal' + animation:'none' (see
 * app/_layout.tsx): the previous screen stays visible behind while
 * FactMorphContainer expands from the pressed card's rect — measured and
 * registered by ImageFactCard on press-in — to full screen, and plays the
 * reverse morph on close.
 *
 * Reached only via factDetailBasePath(), which falls back to /fact/[id] when
 * no fresh morph source exists. If this route is somehow entered without one
 * (deep link, stale state), it redirects to the card-presented twin so the
 * screen keeps its native gestures instead of appearing with no animation.
 */
export default function FactMorphRoute() {
  const { id, source, factIds, currentIndex } = useLocalSearchParams<{
    id: string;
    source?: string;
    factIds?: string;
    currentIndex?: string;
  }>();
  const factId = parseInt(id, 10);

  // Peek (don't clear) in the initializer — render paths can run twice under
  // StrictMode. Cleared post-commit below.
  const [morphSource] = useState(() => peekPendingFactMorph(factId));

  useEffect(() => {
    clearPendingFactMorph(factId);
  }, [factId]);

  if (!morphSource) {
    const params: string[] = [];
    if (source) params.push(`source=${source}`);
    if (factIds) params.push(`factIds=${encodeURIComponent(factIds)}`);
    if (currentIndex) params.push(`currentIndex=${currentIndex}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return <Redirect href={`/fact/${id}${query}`} />;
  }

  return (
    <FactMorphContainer source={morphSource}>
      <FactDetailScreen />
    </FactMorphContainer>
  );
}
