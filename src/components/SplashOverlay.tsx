import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import * as SplashScreen from 'expo-splash-screen';

import { waitForHomeScreenReady } from '../contexts';
import { absoluteFillObject } from '../utils/styles';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashIcon = require('../../assets/splash-icon.png');

// Must match app.json splash config exactly
const SPLASH_BACKGROUND = '#0A1628';
const LOGO_SIZE = 200;

// Animation timing
const DELAY_DURATION = 1000;
const FADE_DURATION = 350;

interface SplashOverlayProps {
  /**
   * True once the app tree under the overlay is mounted. The readiness gates
   * (setHomeRenderPending) are armed during initialization, so waiting any
   * earlier would resolve against not-yet-created gates and fade the overlay
   * out while the home screen is still rendering (the old Android flash).
   */
  appReady: boolean;
  onHidden: () => void;
}

export function SplashOverlay({ appReady, onHidden }: SplashOverlayProps) {
  const [imageReady, setImageReady] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const opacity = useSharedValue(1);

  // Once the app tree is mounted, wait for the home screen's first real paint
  useEffect(() => {
    if (!appReady) return;
    let cancelled = false;
    waitForHomeScreenReady().then(() => {
      if (!cancelled) setHomeReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [appReady]);

  // When image is loaded and decoded, hide native splash
  const handleImageLoaded = useCallback(() => {
    if (!imageReady) {
      const hideNativeSplash = () => {
        SplashScreen.hide();
        setImageReady(true);
      };

      if (Platform.OS === 'android') {
        // Android needs extra frames after decode for GPU compositing
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            hideNativeSplash();
          });
        });
      } else {
        requestAnimationFrame(() => {
          hideNativeSplash();
        });
      }
    }
  }, [imageReady]);

  // Animate when both image and home screen are ready
  useEffect(() => {
    if (imageReady && homeReady) {
      opacity.value = withDelay(
        DELAY_DURATION,
        withTiming(0, {
          duration: FADE_DURATION,
          easing: Easing.out(Easing.ease),
        })
      );

      const timer = setTimeout(onHidden, DELAY_DURATION + FADE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [imageReady, homeReady, onHidden]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.content}>
        <Image
          source={splashIcon}
          style={styles.logo}
          resizeMode="contain"
          onLoad={handleImageLoaded}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...absoluteFillObject,
    backgroundColor: SPLASH_BACKGROUND,
    zIndex: 9999,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
