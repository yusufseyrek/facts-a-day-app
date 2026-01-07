import React from 'react';
import { Pressable, View } from 'react-native';
import { YStack, XStack } from 'tamagui';
import { Check, Zap, Shuffle, ChevronRight } from '@tamagui/lucide-icons';
import { tokens } from '../../theme/tokens';
import { Text, FONT_FAMILIES } from '../Typography';
import { getLucideIcon } from '../../utils/iconMapper';
import { hexToRgba } from '../../utils/colors';
import { useTranslation } from '../../i18n';
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
  const { typography: typo } = useResponsive();
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const purpleColor = isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
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
    const iconSize = 24;
    
    if (isCompleted && type === 'daily') {
      return <Check size={iconSize} color={accentColor} strokeWidth={2.5} />;
    }
    
    if (type === 'daily') {
      return <Zap size={iconSize} color={accentColor} strokeWidth={2} />;
    }
    
    if (type === 'mixed') {
      return <Shuffle size={iconSize} color={accentColor} strokeWidth={2} />;
    }
    
    // Category type - use the icon from props
    return getLucideIcon(icon, iconSize, accentColor);
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
        opacity: pressed && !isDisabled && !(isCompleted && type === 'daily') ? 0.85 : isDisabled ? 0.5 : 1,
        transform: [{ scale: pressed && !isDisabled && !(isCompleted && type === 'daily') ? 0.98 : 1 }],
      })}
      testID={getTestId()}
      accessibilityLabel={title}
    >
      <YStack
        backgroundColor={isDailyAvailable ? hexToRgba(primaryColor, 0.08) : cardBg}
        borderRadius={tokens.radius.lg}
        padding={tokens.space.lg}
        justifyContent="space-between"
        alignItems={centerContent ? 'center' : 'stretch'}
        borderWidth={isDailyAvailable ? 1.5 : 0}
        borderColor={isDailyAvailable ? hexToRgba(primaryColor, 0.4) : 'transparent'}
      >
        {/* Top section: Icon + Chevron */}
        <XStack 
          justifyContent="space-between" 
          alignItems="flex-start"
          width="100%"
        >
          {centerContent && <View style={{ width: 20 }} />}
          <YStack
            width={56}
            height={56}
            borderRadius={28}
            backgroundColor={hexToRgba(accentColor, 0.1)}
            justifyContent="center"
            alignItems="center"
          >
            {renderIcon()}
          </YStack>
          <ChevronRight size={20} color={chevronColor} />
        </XStack>

        {/* Bottom section: Title + Subtitle */}
        <YStack gap={4} marginTop={tokens.space.md} alignItems={centerContent ? 'center' : 'flex-start'}>
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

