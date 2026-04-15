import { View } from 'react-native';

import { BookOpen, Clock, Eye, Flame } from '@tamagui/lucide-icons';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import { formatDuration } from './formatDuration';

interface StatsHeroProps {
  storiesViewed: number;
  factsDeepRead: number;
  totalSeconds: number;
  currentStreak: number;
  longestStreak: number;
}

export function StatsHero({
  storiesViewed,
  factsDeepRead,
  totalSeconds,
  currentStreak,
  longestStreak,
}: StatsHeroProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const primary = colors.primary;
  const cyan = colors.neonCyan;
  const orange = colors.neonOrange;
  const green = colors.neonGreen;

  const tiles: Array<{
    key: string;
    label: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    subtitle?: string;
  }> = [
    {
      key: 'streak',
      label: t('statsCurrentStreak'),
      value: String(currentStreak),
      icon: <Flame size={iconSizes.md} color={orange} />,
      color: orange,
      subtitle: longestStreak > 0 ? t('statsLongestStreak', { count: longestStreak }) : undefined,
    },
    {
      key: 'time',
      label: t('statsTimeSpent'),
      value: formatDuration(totalSeconds, t),
      icon: <Clock size={iconSizes.md} color={green} />,
      color: green,
    },
    {
      key: 'stories',
      label: t('statsFactsViewed'),
      value: String(storiesViewed),
      icon: <Eye size={iconSizes.md} color={primary} />,
      color: primary,
    },
    {
      key: 'deep',
      label: t('statsFactsRead'),
      value: String(factsDeepRead),
      icon: <BookOpen size={iconSizes.md} color={cyan} />,
      color: cyan,
    },
  ];

  return (
    <YStack gap={spacing.md}>
      <XStack gap={spacing.md}>
        {tiles.slice(0, 2).map((tile) => (
          <HeroTile key={tile.key} tile={tile} isDark={isDark} />
        ))}
      </XStack>
      <XStack gap={spacing.md}>
        {tiles.slice(2).map((tile) => (
          <HeroTile key={tile.key} tile={tile} isDark={isDark} />
        ))}
      </XStack>
    </YStack>
  );
}

function HeroTile({
  tile,
  isDark,
}: {
  tile: {
    label: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    subtitle?: string;
  };
  isDark: boolean;
}) {
  const { spacing, radius, iconSizes, borderWidths } = useResponsive();
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  return (
    <YStack
      flex={1}
      backgroundColor={cardBg}
      borderRadius={radius.lg}
      padding={spacing.md}
      gap={spacing.xs}
      borderWidth={borderWidths.hairline}
      borderColor={`${tile.color}30`}
    >
      <XStack alignItems="center" gap={spacing.sm}>
        <View
          style={{
            width: iconSizes.xl,
            height: iconSizes.xl,
            borderRadius: radius.sm,
            backgroundColor: `${tile.color}20`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {tile.icon}
        </View>
        <Text.Label color={secondaryColor} fontFamily={FONT_FAMILIES.medium} flexShrink={1}>
          {tile.label}
        </Text.Label>
      </XStack>
      <Text.Headline color={textColor} fontFamily={FONT_FAMILIES.bold}>
        {tile.value}
      </Text.Headline>
      {tile.subtitle ? (
        <Text.Tiny color={secondaryColor} fontFamily={FONT_FAMILIES.medium}>
          {tile.subtitle}
        </Text.Tiny>
      ) : null}
    </YStack>
  );
}
