import React from 'react';
import { Pressable, View } from 'react-native';
import { Check, Zap, Shuffle, ChevronRight } from '@tamagui/lucide-icons';
import { YStack, XStack } from 'tamagui';

import { Text, FONT_FAMILIES } from '../Typography';
import { useTranslation } from '../../i18n';
import { hexColors } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';

export type TriviaGridCardType = 'daily' | 'mixed' | 'category';

interface TriviaGridCardProps {
  type: TriviaGridCardType;
  title: string;
  subtitle?: string;
  icon?: string;
  colorHex?: string;
  isCompleted?: boolean;
  isDisabled?: boolean;
  progress?: { mastered: number; total: number };
  isDark: boolean;
  onPress: () => void;
  centerContent?: boolean;
}

export function TriviaGridCard({
  type,
  title,
  subtitle,
  icon,
  colorHex,
  isCompleted = false,
  isDisabled = false,
  progress,
  isDark,
  onPress,
  centerContent = false,
}: TriviaGridCardProps) {
  const { t } = useTranslation();
  const { typography, iconSizes, spacing, radius, media } = useResponsive();
  const iconContainerSize = media.topicCardSize * 0.7;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const chevronColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';

  // Determine the accent color based on type
  const getAccentColor = () => {
    if (isCompleted) return successColor;
    if (type === 'daily') return primaryColor;
    if (type === 'mixed') return purpleColor;
    return colorHex || primaryColor;
  };

  const accentColor = getAccentColor();

  // Render the icon based on type
  const renderIcon = () => {
    if (isCompleted && type === 'daily') {
      return <Check size={iconSizes.lg} color={accentColor} strokeWidth={2.5} />;
    }

    if (type === 'daily') {
      return <Zap size={iconSizes.lg} color={accentColor} strokeWidth={2} />;
    }

    if (type === 'mixed') {
      return <Shuffle size={iconSizes.lg} color={accentColor} strokeWidth={2} />;
    }

    // Category type - use the icon from props
    return getLucideIcon(icon, iconSizes.lg, accentColor);
  };

  // Get the subtitle text
  const getSubtitle = () => {
    if (subtitle) return subtitle;
    if (type === 'category' && progress) {
      return t('triviaQuestionsCount', { count: progress.total });
    }
    return '';
  };

  // Check if daily trivia is available (not completed and has questions)
  const isDailyAvailable = type === 'daily' && !isCompleted && !isDisabled;

  // Generate testID based on type and icon
  const getTestId = () => {
    if (type === 'daily') return 'trivia-card-daily';
    if (type === 'mixed') return 'trivia-card-mixed';
    return `trivia-card-category-${icon || 'unknown'}`;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled || (isCompleted && type === 'daily')}
      style={({ pressed }) => ({
        flex: 1,
        opacity:
          pressed && !isDisabled && !(isCompleted && type === 'daily')
            ? 0.85
            : isDisabled
              ? 0.5
              : 1,
        transform: [
          { scale: pressed && !isDisabled && !(isCompleted && type === 'daily') ? 0.98 : 1 },
        ],
      })}
      testID={getTestId()}
      accessibilityLabel={title}
    >
      <YStack
        backgroundColor={isDailyAvailable ? hexToRgba(primaryColor, 0.08) : cardBg}
        borderRadius={radius.lg}
        padding={spacing.lg}
        justifyContent="space-between"
        alignItems={centerContent ? 'center' : 'stretch'}
        borderWidth={isDailyAvailable ? 1.5 : 0}
        borderColor={isDailyAvailable ? hexToRgba(primaryColor, 0.4) : 'transparent'}
      >
        {/* Top section: Icon + Chevron */}
        <XStack justifyContent="space-between" alignItems="flex-start" width="100%">
          {centerContent && <View style={{ width: iconSizes.sm }} />}
          <YStack
            width={iconContainerSize}
            height={iconContainerSize}
            borderRadius={iconContainerSize / 2}
            backgroundColor={hexToRgba(accentColor, 0.1)}
            justifyContent="center"
            alignItems="center"
          >
            {renderIcon()}
          </YStack>
          <ChevronRight size={iconSizes.md} color={chevronColor} />
        </XStack>

        {/* Bottom section: Title + Subtitle */}
        <YStack
          gap={spacing.xs}
          marginTop={spacing.md}
          alignItems={centerContent ? 'center' : 'flex-start'}
        >
          <Text.Label
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
            numberOfLines={1}
            textAlign={centerContent ? 'center' : 'left'}
          >
            {title}
          </Text.Label>
          <Text.Caption
            color={secondaryTextColor}
            numberOfLines={1}
            textAlign={centerContent ? 'center' : 'left'}
          >
            {getSubtitle()}
          </Text.Caption>
        </YStack>
      </YStack>
    </Pressable>
  );
}
