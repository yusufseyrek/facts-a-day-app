import { View } from 'react-native';

import { CalendarDays, Clock4, Hourglass } from '@tamagui/lucide-icons';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import { formatDuration, formatHour, formatWeekday } from './formatDuration';

import type { ReadingHabits } from '../../services/stats';

interface HabitsCardProps {
  habits: ReadingHabits;
  locale: string;
}

export function HabitsCard({ habits, locale }: HabitsCardProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;

  const rows: Array<{
    key: string;
    icon: React.ReactNode;
    color: string;
    text: string;
  }> = [];

  if (habits.topWeekday !== null) {
    rows.push({
      key: 'day',
      icon: <CalendarDays size={iconSizes.sm} color={colors.neonPurple} />,
      color: colors.neonPurple,
      text: t('statsHabitTopDay', { day: formatWeekday(habits.topWeekday, locale) }),
    });
  }

  if (habits.topHour !== null) {
    rows.push({
      key: 'hour',
      icon: <Clock4 size={iconSizes.sm} color={colors.neonYellow} />,
      color: colors.neonYellow,
      text: t('statsHabitPeakHour', { hour: formatHour(habits.topHour, locale) }),
    });
  }

  if (habits.avgSecondsPerFact > 0) {
    rows.push({
      key: 'avg',
      icon: <Hourglass size={iconSizes.sm} color={colors.neonGreen} />,
      color: colors.neonGreen,
      text: t('statsHabitAvgTime', { duration: formatDuration(habits.avgSecondsPerFact, t) }),
    });
  }

  if (rows.length === 0) return null;

  return (
    <YStack gap={spacing.sm}>
      <Text.Title color={textColor}>{t('statsHabits')}</Text.Title>
      <YStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        padding={spacing.lg}
        gap={spacing.md}
      >
        {rows.map((row) => (
          <XStack key={row.key} alignItems="center" gap={spacing.md}>
            <View
              style={{
                width: iconSizes.lg,
                height: iconSizes.lg,
                borderRadius: radius.sm * 0.75,
                backgroundColor: `${row.color}20`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {row.icon}
            </View>
            <Text.Body color={textColor} fontFamily={FONT_FAMILIES.medium} flex={1}>
              {row.text}
            </Text.Body>
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}
