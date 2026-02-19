import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { XStack, YStack } from 'tamagui';

import { STAR_COLORS } from '../../config/badges';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';

import { BadgeIcon } from './BadgeIcon';
import { StarRating } from './StarRating';
import { FONT_FAMILIES, Text } from '../Typography';

import type { BadgeWithStatus } from '../../services/badges';

interface BadgeCardProps {
  badge: BadgeWithStatus;
  onPress: () => void;
}

export function BadgeCard({ badge, onPress }: BadgeCardProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const { definition, earnedStars, currentProgress, nextThreshold } = badge;

  const isUnlocked = earnedStars.length > 0;
  const allStarsEarned = earnedStars.length === definition.stars.length;

  const progressFraction = useMemo(() => {
    if (allStarsEarned) return 1;
    if (!nextThreshold || nextThreshold === 0) return isUnlocked ? 1 : 0;
    return Math.min(currentProgress / nextThreshold, 1);
  }, [currentProgress, nextThreshold, isUnlocked, allStarsEarned]);

  const iconSize = iconSizes.heroLg * 1.5;
  const progressText = allStarsEarned
    ? null
    : nextThreshold
      ? `${currentProgress}/${nextThreshold}`
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        shadowStyles.card,
        {
          borderRadius: radius.lg,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          overflow: 'hidden',
        },
      ]}
    >
      <XStack alignItems="center" padding={spacing.md} gap={spacing.md}>
        {/* Badge icon */}
        <View
          style={
            isUnlocked
              ? {
                  shadowColor: STAR_COLORS.filled,
                  shadowOffset: { width: 0, height: 3 + earnedStars.length * 3 },
                  shadowOpacity: 0.3 + earnedStars.length * 0.2,
                  shadowRadius: 8 + earnedStars.length * 6,
                  elevation: 4 + earnedStars.length * 5,
                }
              : shadowStyles.badgeIcon
          }
        >
          <BadgeIcon badgeId={definition.id} size={iconSize} isUnlocked={isUnlocked} />
        </View>

        {/* Name + description + stars */}
        <YStack flex={1} gap={spacing.xs}>
          <Text.Body
            fontFamily={FONT_FAMILIES.semibold}
            color={isUnlocked ? colors.text : colors.textMuted}
            numberOfLines={1}
          >
            {t(`badge_${definition.id}` as any)}
          </Text.Body>
          <Text.Caption color={isUnlocked ? colors.textSecondary : colors.textMuted} numberOfLines={1}>
            {t(`badge_${definition.id}_desc` as any)}
          </Text.Caption>
          <XStack alignItems="center" gap={spacing.sm} marginTop={spacing.xs}>
            <StarRating earnedCount={earnedStars.length} size={iconSizes.xs} gap={spacing.xs} />
            {progressText && (
              <Text.Caption color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                {progressText}
              </Text.Caption>
            )}
          </XStack>
        </YStack>
      </XStack>

      {/* Progress bar at bottom */}
      {!allStarsEarned && progressFraction > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: `${colors.border}20`,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${progressFraction * 100}%` as any,
              height: '100%',
              backgroundColor: STAR_COLORS.filled,
            }}
          />
        </View>
      )}
    </Pressable>
  );
}

const shadowStyles = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeIcon: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
});
