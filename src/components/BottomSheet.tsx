import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LAYOUT } from '../config/app';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { CloseButton } from './CloseButton';
import { InlineOverlay } from './InlineOverlay';
import { ModalBackdrop } from './ModalBackdrop';
import { YStack } from './Stacks';

/**
 * BottomSheet — the shared bottom-anchored sheet (the bottom-placement sibling
 * of DialogShell). Composes InlineOverlay + ModalBackdrop + a slide-up card and
 * OWNS the open/close choreography; callers manage only a `visible` boolean.
 *
 * Dismiss: backdrop tap, the optional ✕, swipe-down, or the parent flipping
 * `visible`. Like DialogShell it keeps internal `showContent` so the exit
 * animation plays before unmount (a reanimated `exiting` alone is cut off inside
 * the Android / forceWindow Modal). It's presented in a window-level Modal
 * (forceWindow) since callers mount it deep in the tree, so the swipe gesture is
 * wrapped in its own GestureHandlerRootView (gestures inside an RN Modal are
 * outside the app-root GH provider).
 */

const ENTER_MS = 260;
const EXIT_MS = 200;
/** Drag-down distance (px) or fling velocity past which the sheet dismisses. */
const DISMISS_DRAG_PX = 120;
const DISMISS_FLING_V = 800;

interface BottomSheetProps {
  visible: boolean;
  /** Fired AFTER the exit animation completes. Must drive `visible` to false. */
  onClose: () => void;
  /** false disables backdrop tap, swipe-down, and Android hardware back. */
  dismissible?: boolean;
  /** Absolute top-right ✕ close affordance. */
  showClose?: boolean;
  children: ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  dismissible = true,
  showClose = false,
  children,
}: BottomSheetProps) {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const { spacing, radius } = useResponsive();

  // Two-phase close (DialogShell pattern): unmount the card first so its exiting
  // animation plays, notify the parent only after it finishes.
  const [showContent, setShowContent] = useState(false);
  const closingRef = useRef(false);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setShowContent(true);
      closingRef.current = false;
      dragY.value = 0;
    } else if (!closingRef.current) {
      setShowContent(false);
    }
  }, [visible, dragY]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setShowContent(false);
    setTimeout(() => {
      onClose();
      closingRef.current = false;
    }, EXIT_MS);
  }, [onClose]);

  const handleRequestClose = useCallback(() => {
    if (dismissible) requestClose();
  }, [dismissible, requestClose]);

  const panGesture = Gesture.Pan()
    .enabled(dismissible)
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG_PX || e.velocityY > DISMISS_FLING_V) {
        runOnJS(requestClose)();
      } else {
        dragY.value = withSpring(0, { damping: 22, stiffness: 220 });
      }
    });

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <InlineOverlay
      visible={visible}
      onRequestClose={handleRequestClose}
      exitGraceMs={EXIT_MS + 40}
      forceWindow
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ModalBackdrop
          isDark={isDark}
          blurIntensity={isDark ? 50 : 70}
          androidScrim={isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)'}
          onPress={dismissible ? requestClose : undefined}
        />
        <YStack flex={1} justifyContent="flex-end" pointerEvents="box-none">
          {showContent && (
            <GestureDetector gesture={panGesture}>
              <Animated.View
                entering={SlideInDown.duration(ENTER_MS)}
                exiting={SlideOutDown.duration(EXIT_MS)}
                style={[
                  {
                    width: '100%',
                    maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
                    alignSelf: 'center',
                    backgroundColor: colors.cardBackground,
                    borderTopLeftRadius: radius.xl,
                    borderTopRightRadius: radius.xl,
                    paddingBottom: insets.bottom + spacing.md,
                    overflow: 'hidden',
                  },
                  dragStyle,
                ]}
              >
                {/* Grabber */}
                <YStack alignItems="center" paddingTop={spacing.sm} paddingBottom={spacing.xs}>
                  <View
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: colors.border,
                    }}
                  />
                </YStack>
                {showClose && (
                  <CloseButton
                    onPress={requestClose}
                    style={{ position: 'absolute', top: spacing.sm, right: spacing.md, zIndex: 10 }}
                  />
                )}
                {children}
              </Animated.View>
            </GestureDetector>
          )}
        </YStack>
      </GestureHandlerRootView>
    </InlineOverlay>
  );
}
