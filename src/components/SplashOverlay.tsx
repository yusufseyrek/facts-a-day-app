import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import * as SplashScreen from 'expo-splash-screen';

import { waitForHomeScreenReady } from '../contexts';

// Must match app.json splash config exactly
const SPLASH_BACKGROUND = '#0A1628';
const LOGO_SIZE = 200;

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
      // Delay to ensure JS splash is fully painted before hiding native
      setTimeout(async () => {
        await SplashScreen.hideAsync();
        setImageReady(true);
      }, 500);
    }
  }, [imageReady]);

  // Fade out when both image and home screen are ready
  useEffect(() => {
    if (imageReady && homeReady) {
      opacity.value = withTiming(0, {
        duration: 350,
        easing: Easing.out(Easing.ease),
      });

      const timer = setTimeout(onHidden, 350);
      return () => clearTimeout(timer);
    }
  }, [imageReady, homeReady, onHidden]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/splash-icon.png')}
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
