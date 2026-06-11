import { useEffect, useState } from 'react';

import { Redirect, useLocalSearchParams } from 'expo-router';

import { StoryMorphContainer } from '../../../src/components/storyMorph/StoryMorphContainer';
import { clearPendingStoryMorph, peekPendingStoryMorph } from '../../../src/services/storyMorph';
import StoryScreen from '../[category]';

/**
 * Morph-presented variant of the story screen ("container transform"), the
 * story twin of fact/morph/[id].
 *
 * Registered as presentation:'transparentModal' + animation:'none' (see
 * app/_layout.tsx): the home feed stays visible behind while
 * StoryMorphContainer expands from the pressed story button's circle —
 * measured and registered by CategoryButton on press-in — to full screen,
 * and plays the reverse morph on close.
 *
 * Reached only via storyBasePath(), which falls back to /story/[category]
 * when no fresh morph source exists. If this route is somehow entered
 * without one (deep link, stale state), it redirects to the fullScreenModal
 * twin so the story keeps a real presentation instead of appearing with no
 * animation.
 */
export default function StoryMorphRoute() {
  const { category } = useLocalSearchParams<{ category: string }>();

  // Peek (don't clear) in the initializer — render paths can run twice under
  // StrictMode. Cleared post-commit below.
  const [morphSource] = useState(() => peekPendingStoryMorph(category!));

  useEffect(() => {
    clearPendingStoryMorph(category!);
  }, [category]);

  if (!morphSource) {
    return <Redirect href={`/story/${category}`} />;
  }

  return (
    <StoryMorphContainer source={morphSource}>
      <StoryScreen />
    </StoryMorphContainer>
  );
}
