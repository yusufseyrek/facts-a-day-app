import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Heart } from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';

import { trackFactFavoriteAdd, trackFactFavoriteRemove } from '../services/analytics';
import { checkAndAwardBadges } from '../services/badges';
import * as database from '../services/database';
import { downloadImage } from '../services/images';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

interface FavoriteButtonProps {
  factId: number;
  imageUrl?: string;
  categorySlug?: string;
}

const FavoriteButtonComponent = ({
  factId,
  imageUrl,
  categorySlug = 'unknown',
}: FavoriteButtonProps) => {
  const { theme } = useTheme();
  const { iconSizes, spacing } = useResponsive();
  const heartColor = theme === 'dark' ? hexColors.dark.neonRed : hexColors.light.neonRed;
  const iconSize = iconSizes.sm;
  const containerSize = iconSize + spacing.md;

  const [isFavorited, setIsFavorited] = useState(false);
  const heartScale = useSharedValue(1);

  useEffect(() => {
    database
      .isFactFavorited(factId)
      .then(setIsFavorited)
      .catch(() => {});
  }, [factId]);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handlePress = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newStatus = await database.toggleFavorite(factId);
      setIsFavorited(newStatus);

      if (newStatus) {
        heartScale.value = withSequence(
          withTiming(0.7, { duration: 80, easing: Easing.in(Easing.cubic) }),
          withSpring(1.3, { damping: 15, stiffness: 300, mass: 0.2 }),
          withSpring(1, { damping: 15, stiffness: 100 })
        );
        trackFactFavoriteAdd({ factId, category: categorySlug });
        checkAndAwardBadges().catch(() => {});
        if (imageUrl) {
          downloadImage(imageUrl, factId).catch(() => {});
        }
      } else {
        heartScale.value = withSequence(
          withTiming(0.8, { duration: 100, easing: Easing.in(Easing.cubic) }),
          withSpring(1, { damping: 20, stiffness: 100 })
        );
        trackFactFavoriteRemove({ factId, category: categorySlug });
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error toggling favorite:', error);
      }
    }
  }, [factId, imageUrl, categorySlug, heartScale]);

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => ({
        width: containerSize,
        height: containerSize,
        borderRadius: containerSize / 2,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Animated.View style={heartAnimatedStyle}>
        <Heart
          size={iconSize}
          color={isFavorited ? heartColor : '#FFFFFF'}
          fill={isFavorited ? heartColor : 'none'}
          style={styles.iconShadow}
        />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  iconShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
});

export const FavoriteButton = React.memo(FavoriteButtonComponent);
