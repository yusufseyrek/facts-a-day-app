import React from 'react';
import { Pressable } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Check, Zap, Shuffle } from '@tamagui/lucide-icons';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import { getLucideIcon } from '../../utils/iconMapper';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

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
}: TriviaGridCardProps) {
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const purpleColor = isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const surfaceBg = isDark ? tokens.color.dark.surface : tokens.color.light.surface;

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
    const iconSize = 20;
    
    if (isCompleted && type === 'daily') {
      return <Check size={iconSize} color="#FFFFFF" strokeWidth={2.5} />;
    }
    
    if (type === 'daily') {
      return <Zap size={iconSize} color="#FFFFFF" strokeWidth={2} />;
    }
    
    if (type === 'mixed') {
      return <Shuffle size={iconSize} color="#FFFFFF" strokeWidth={2} />;
    }
    
    // Category type - use the icon from props
    return getLucideIcon(icon, iconSize, '#FFFFFF');
  };

  // Calculate progress percentage for categories
  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.mastered / progress.total) * 100)
    : 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled || (isCompleted && type === 'daily')}
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed && !isDisabled && !(isCompleted && type === 'daily') ? 0.8 : isDisabled ? 0.5 : 1,
      })}
    >
      <YStack
        backgroundColor={cardBg}
        borderRadius={tokens.radius.md}
        borderWidth={1}
        borderColor={isCompleted ? successColor : borderColor}
        padding={tokens.space.md}
        paddingVertical={tokens.space.lg}
        gap={tokens.space.sm}
      >
        {/* Top row: Icon + Title + Progress */}
        <XStack alignItems="center" gap={tokens.space.sm}>
          <YStack
            width={36}
            height={36}
            borderRadius={18}
            backgroundColor={accentColor}
            justifyContent="center"
            alignItems="center"
          >
            {renderIcon()}
          </YStack>
          <YStack flex={1} gap={4}>
            <Text
              fontSize={13}
              fontWeight="600"
              color={textColor}
              fontFamily={FONT_FAMILIES.semibold}
              numberOfLines={1}
            >
              {title}
            </Text>
            {/* Subtitle for non-category types */}
            {subtitle && type !== 'category' && (
              <Text 
                fontSize={11} 
                color={secondaryTextColor}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
            {/* Progress bar for categories - in place of subtitle */}
            {type === 'category' && progress && (
              <XStack alignItems="center" gap={tokens.space.xs} marginTop={5}>
                <YStack 
                  flex={1}
                  height={6} 
                  borderRadius={3} 
                  backgroundColor={surfaceBg}
                  overflow="hidden"
                >
                  <YStack 
                    height={6} 
                    borderRadius={3}
                    backgroundColor={progress.mastered >= progress.total && progress.total > 0 ? successColor : accentColor}
                    width={`${progressPercent}%`}
                  />
                </YStack>
                {progress.mastered >= progress.total && progress.total > 0 && (
                  <Check size={12} color={successColor} strokeWidth={3} />
                )}
              </XStack>
            )}
          </YStack>
        </XStack>
      </YStack>
    </Pressable>
  );
}

