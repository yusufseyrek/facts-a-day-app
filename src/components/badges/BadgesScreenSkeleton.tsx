import React from 'react';
import { View } from 'react-native';

import { XStack, YStack } from 'tamagui';

import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { ContentContainer } from '../ScreenLayout';
import { ShimmerPlaceholder } from '../ShimmerPlaceholder';

function BadgeCardSkeleton() {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const iconSize = iconSizes.heroLg * 1.5;

  return (
    <XStack
      backgroundColor={colors.cardBackground}
      borderRadius={radius.lg}
      borderWidth={1}
      borderColor={colors.border}
      padding={spacing.md}
      alignItems="center"
      gap={spacing.md}
    >
      <ShimmerPlaceholder width={iconSize} height={iconSize} borderRadius={iconSize / 2} />
      <YStack flex={1} gap={spacing.xs}>
        <ShimmerPlaceholder width="65%" height={16} borderRadius={4} />
        <ShimmerPlaceholder width="85%" height={12} borderRadius={4} />
        <XStack gap={spacing.xs} marginTop={spacing.xs}>
          {[0, 1, 2].map((i) => (
            <ShimmerPlaceholder key={i} width={iconSizes.xs} height={iconSizes.xs} borderRadius={2} />
          ))}
        </XStack>
      </YStack>
    </XStack>
  );
}

function SectionSkeleton({ cardCount }: { cardCount: number }) {
  const { spacing, iconSizes } = useResponsive();

  return (
    <YStack marginBottom={spacing.xl}>
      <XStack alignItems="center" gap={spacing.md} paddingTop={spacing.md} marginBottom={spacing.md}>
        <ShimmerPlaceholder width={iconSizes.md} height={iconSizes.md} borderRadius={4} />
        <ShimmerPlaceholder width={120} height={18} borderRadius={4} />
      </XStack>
      <YStack gap={spacing.sm}>
        {Array.from({ length: cardCount }, (_, i) => (
          <BadgeCardSkeleton key={i} />
        ))}
      </YStack>
    </YStack>
  );
}

export function BadgesScreenSkeleton() {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = hexColors[theme];

  return (
    <ContentContainer>
        {/* Streak panel skeleton */}
        <XStack
          backgroundColor={colors.cardBackground}
          borderRadius={radius.lg}
          padding={spacing.md}
          marginBottom={spacing.lg}
          borderWidth={1}
          borderColor={colors.border}
          alignItems="center"
        >
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <View
                  style={{
                    width: 1,
                    height: iconSizes.xl,
                    backgroundColor: `${colors.border}60`,
                  }}
                />
              )}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                <ShimmerPlaceholder
                  width={iconSizes.hero}
                  height={iconSizes.hero}
                  borderRadius={iconSizes.hero / 2}
                />
                <ShimmerPlaceholder width={30} height={typography.lineHeight.title} borderRadius={4} />
                <ShimmerPlaceholder width={60} height={typography.lineHeight.tiny} borderRadius={4} />
              </YStack>
            </React.Fragment>
          ))}
        </XStack>

        {/* Reading section skeleton */}
        <SectionSkeleton cardCount={4} />

        {/* Quiz section skeleton */}
        <SectionSkeleton cardCount={4} />
      </ContentContainer>
  );
}
