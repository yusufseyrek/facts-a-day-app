import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import * as Haptics from 'expo-haptics';

import * as database from '../services/database';
import { performFavoriteToggle } from '../services/favorites';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { animateHeartToggle, ParticleBurst } from './favoriteHeartAnimation';
import { Heart } from './icons';

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
  const containerSize = iconSize + spacing.sm;

  const [isFavorited, setIsFavorited] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const heartScale = useSharedValue(1);
  const heartRotation = useSharedValue(0);

  useEffect(() => {
    database
      .isFactFavorited(factId)
      .then(setIsFavorited)
      .catch(() => {});
  }, [factId]);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }, { rotate: `${heartRotation.value}deg` }],
  }));

  const handlePress = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newStatus = await performFavoriteToggle(factId, categorySlug, imageUrl);
      setIsFavorited(newStatus);

      animateHeartToggle(heartScale, heartRotation, newStatus);
      if (newStatus) {
        setShowParticles(true);
        setTimeout(() => setShowParticles(false), 500);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error toggling favorite:', error);
      }
    }
  }, [factId, imageUrl, categorySlug, heartScale, heartRotation]);

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
      {/* Mounted only for the ~500ms burst so idle cards in virtualized feeds
          don't each carry the particle effect's UI-thread mappers. */}
      {showParticles && <ParticleBurst color={heartColor} isActive />}
      <Animated.View style={heartAnimatedStyle}>
        <Heart
          size={iconSize}
          color={isFavorited ? heartColor : '#FFFFFF'}
          fill={isFavorited ? heartColor : 'none'}
          style={styles.iconShadow}
          marginTop={spacing.xs / 2}
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
