import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import * as SplashScreen from 'expo-splash-screen';

import { waitForHomeScreenReady } from '../contexts';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashIcon = require('../../assets/splash-icon.png');

// Must match app.json splash config exactly
const SPLASH_BACKGROUND = '#0A1628';
const LOGO_SIZE = 200;

// Animation timing
const DELAY_DURATION = 250;
const FADE_DURATION = 350;

interface SplashOverlayProps {
  onHidden: () => void;
}

export function SplashOverlay({ onHidden }: SplashOverlayProps) {
  const [imageReady, setImageReady] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const opacity = useSharedValue(1);

  // Wait for home screen to be ready
  useEffect(() => {
    waitForHomeScreenReady().then(() => {
      setHomeReady(true);
    });
  }, []);

  // When image is laid out, wait then hide native splash
  const handleImageLayout = useCallback(() => {
    if (!imageReady) {
      global.requestAnimationFrame(() => {
        SplashScreen.hide();
        setImageReady(true);
      });
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
          onLayout={handleImageLayout}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
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
