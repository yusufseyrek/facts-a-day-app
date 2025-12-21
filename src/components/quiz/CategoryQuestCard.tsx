import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Check, ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import { getLucideIcon } from '../../utils/iconMapper';
import type { CategoryWithProgress } from '../../services/quiz';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

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
  const progress = category.total > 0
    ? Math.round((category.mastered / category.total) * 100)
    : 0;
  
  const isComplete = category.isComplete;
  
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  
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
          padding={tokens.space.lg}
          borderRadius={tokens.radius.md}
          alignItems="center"
          gap={tokens.space.md}
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
            {getLucideIcon(category.icon, 20, '#FFFFFF')}
          </YStack>
          
          {/* Content */}
          <YStack flex={1}>
            <XStack alignItems="center" gap={tokens.space.sm}>
              <Text
                fontSize={15}
                fontWeight="600"
                color={textColor}
                fontFamily={FONT_FAMILIES.semibold}
              >
                {category.name}
              </Text>
              {isComplete && (
                <Check size={14} color={successColor} />
              )}
            </XStack>
            
            {/* Progress bar */}
            <XStack alignItems="center" gap={tokens.space.sm} marginTop={tokens.space.xs}>
              <YStack 
                flex={1} 
                height={3} 
                borderRadius={2} 
                backgroundColor={isDark ? tokens.color.dark.border : tokens.color.light.border}
              >
                <YStack 
                  height={3} 
                  borderRadius={2} 
                  backgroundColor={isComplete ? successColor : primaryColor}
                  width={`${progress}%`}
                />
              </YStack>
              <Text fontSize={12} color={secondaryTextColor}>
                {category.mastered}/{category.total}
              </Text>
            </XStack>
          </YStack>
          
          {!isComplete && (
            <ChevronRight size={18} color={secondaryTextColor} />
          )}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}
