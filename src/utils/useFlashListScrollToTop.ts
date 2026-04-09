import { RefObject, useCallback, useRef } from 'react';

import { SCROLL_TO_TOP_SETTINGS } from '../config/factListSettings';
import { useScrollToTopHandler } from '../contexts';

/**
 * Performs a smart scroll-to-top on a FlashList ref.
 * Jumps instantly if scrolled far to avoid blank flashing, otherwise animates.
 */
export function smartScrollToTop(
  listRef: RefObject<FlashListRef>,
  scrollOffset: number,
  debug = false,
  screenId = ''
): void {
  const { instantJumpThreshold, preRenderItemCount } = SCROLL_TO_TOP_SETTINGS;
  const shouldAnimate = scrollOffset < instantJumpThreshold;

  if (__DEV__ && debug) {
    console.log(
      `[${screenId}:ScrollToTop] offset:`,
      Math.round(scrollOffset),
      'animated:',
      shouldAnimate
    );
  }

  if (shouldAnimate) {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  } else {
    // First scroll to a nearby index to trigger rendering of top items
    listRef.current?.scrollToIndex({ index: preRenderItemCount, animated: false });
    // Then immediately jump to top
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }
}

interface ScrollEvent {
  nativeEvent: { contentOffset: { y: number } };
}

type FlashListRef = any;

interface UseFlashListScrollToTopOptions {
  /** Screen identifier for the scroll-to-top handler */
  screenId: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Custom hook for FlashList scroll-to-top with smart instant/animated behavior.
 * When scrolled far, jumps instantly to avoid blank flashing during long animated scroll.
 * Pre-renders top items before jumping to ensure they're visible immediately.
 */
export function useFlashListScrollToTop({
  screenId,
  debug = false,
}: UseFlashListScrollToTopOptions) {
  const listRef = useRef<FlashListRef>(null);
  const scrollOffsetRef = useRef(0);

  const handleScroll = useCallback(
    (event: ScrollEvent) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      if (__DEV__ && debug) {
        console.log(`[${screenId}:Scroll] offset:`, Math.round(scrollOffsetRef.current));
      }
    },
    [screenId, debug]
  );

  const scrollToTop = useCallback(() => {
    smartScrollToTop(listRef, scrollOffsetRef.current, debug, screenId);
  }, [screenId, debug]);

  useScrollToTopHandler(screenId, scrollToTop);

  return {
    listRef,
    handleScroll,
    scrollToTop,
    /** Current scroll offset for external use */
    getScrollOffset: () => scrollOffsetRef.current,
  };
}

