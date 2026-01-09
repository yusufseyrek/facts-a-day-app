import React from 'react';
import { Pressable } from 'react-native';
import { Check, ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { YStack, XStack } from 'tamagui';

import { Text, FONT_FAMILIES } from '../Typography';
import { hexColors } from '../../theme';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';

import type { CategoryWithProgress } from '../../services/trivia';

interface CategoryQuestCardProps {
  category: CategoryWithProgress;
  isDark: boolean;
  onPress: () => void;
  index: number;
}

export function CategoryQuestCard({
  category,
  isDark,
  onPress,
  index,
}: CategoryQuestCardProps) {
  const { spacing, radius, typography, iconSizes } = useResponsive();
  const progress = category.total > 0
    ? Math.round((category.mastered / category.total) * 100)
    : 0;
  
  const isComplete = category.isComplete;
  
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  
  // Use category color or fallback
  const categoryColor = category.color_hex || primaryColor;
  
  return (
    <Animated.View entering={FadeIn.duration(300).delay(150 + index * 50)}>
      <Pressable
        onPress={onPress}
        disabled={isComplete}
        style={({ pressed }) => ({
          opacity: pressed && !isComplete ? 0.7 : (isComplete ? 0.6 : 1),
        })}
      >
        <XStack
          backgroundColor={cardBg}
          padding={spacing.lg}
          borderRadius={radius.md}
          alignItems="center"
          gap={spacing.md}
        >
          {/* Category icon */}
          <YStack
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor={categoryColor}
            justifyContent="center"
            alignItems="center"
          >
            {getLucideIcon(category.icon, iconSizes.md, '#FFFFFF')}
          </YStack>
          
          {/* Content */}
          <YStack flex={1}>
            <XStack alignItems="center" gap={spacing.sm}>
              <Text.Label
                fontFamily={FONT_FAMILIES.semibold}
                color={textColor}
              >
                {category.name}
              </Text.Label>
              {isComplete && (
                <Check size={typography.fontSize.caption} color={successColor} />
              )}
            </XStack>
            
            {/* Progress bar */}
            <XStack alignItems="center" gap={spacing.sm} marginTop={spacing.xs}>
              <YStack 
                flex={1} 
                height={3} 
                borderRadius={2} 
                backgroundColor={isDark ? hexColors.dark.border : hexColors.light.border}
              >
                <YStack 
                  height={3} 
                  borderRadius={2} 
                  backgroundColor={isComplete ? successColor : primaryColor}
                  width={`${progress}%`}
                />
              </YStack>
              <Text.Caption color={secondaryTextColor}>
                {category.mastered}/{category.total}
              </Text.Caption>
            </XStack>
          </YStack>
          
          {!isComplete && (
            <ChevronRight size={iconSizes.md} color={secondaryTextColor} />
          )}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

