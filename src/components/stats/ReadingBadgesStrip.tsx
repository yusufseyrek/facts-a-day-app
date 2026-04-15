import { Pressable, ScrollView } from 'react-native';

import { ChevronRight, Trophy } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { XStack, YStack } from 'tamagui';

import { BADGE_DEFINITIONS } from '../../config/badges';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { BadgeIcon } from '../badges/BadgeIcon';
import { FONT_FAMILIES, Text } from '../Typography';

interface ReadingBadgesStripProps {
  earnedBadgeIds: Set<string>;
}

export function ReadingBadgesStrip({ earnedBadgeIds }: ReadingBadgesStripProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  const readingBadges = BADGE_DEFINITIONS.filter((b) => b.category === 'reading');
  const earnedCount = readingBadges.filter((b) => earnedBadgeIds.has(b.id)).length;

  return (
    <Pressable
      onPress={() => router.push('/badges')}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <YStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        padding={spacing.lg}
        gap={spacing.md}
      >
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap={spacing.sm}>
            <Trophy size={iconSizes.sm} color={colors.accent} />
            <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor}>
              {t('statsReadingBadges')}
            </Text.Label>
          </XStack>
          <XStack alignItems="center" gap={spacing.xs}>
            <Text.Caption color={secondaryColor}>
              {earnedCount} / {readingBadges.length}
            </Text.Caption>
            <ChevronRight size={iconSizes.sm} color={secondaryColor} />
          </XStack>
        </XStack>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          overScrollMode="never"
          contentContainerStyle={{ gap: spacing.xs }}
        >
          {readingBadges
            .sort((a, b) => {
              const ae = earnedBadgeIds.has(a.id);
              const be = earnedBadgeIds.has(b.id);
              if (ae && !be) return -1;
              if (!ae && be) return 1;
              return 0;
            })
            .map((badge) => (
              <BadgeIcon
                key={badge.id}
                badgeId={badge.id}
                size={iconSizes.xl}
                isUnlocked={earnedBadgeIds.has(badge.id)}
              />
            ))}
        </ScrollView>
      </YStack>
    </Pressable>
  );
}
