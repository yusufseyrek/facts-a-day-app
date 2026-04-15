import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

import { LinearGradient } from 'expo-linear-gradient';
import { XStack, YStack } from 'tamagui';

import { FONT_FAMILIES, Text } from '../Typography';

import { formatDuration } from './formatDuration';

import type { TranslationKeys } from '../../i18n/translations';

// Square 1:1 so the share image looks good on most platforms.
const CARD_SIZE = 1024;
const PADDING = 56;

type ThemeMode = 'light' | 'dark';

interface ShareableStatsCardProps {
  theme: ThemeMode;
  storiesViewed: number;
  factsDeepRead: number;
  totalSeconds: number;
  currentStreak: number;
  longestStreak: number;
  heatmapCounts: number[]; // last 84 days (12 cols × 7 rows)
  topCategoryName: string | null;
  t: (key: TranslationKeys, options?: Record<string, string | number>) => string;
}

interface Palette {
  gradient: readonly [string, string, string];
  title: string;
  subtitle: string;
  tileBg: string;
  tileLabel: string;
  heatmapEmpty: string;
  statAccents: {
    streak: string;
    time: string;
    views: string;
    best: string;
    heatmap: string;
  };
  streakPillBg: string;
  streakPillBorder: string;
}

const PALETTES: Record<ThemeMode, Palette> = {
  dark: {
    gradient: ['#0F1E36', '#0A1628', '#050B14'],
    title: '#FFFFFF',
    subtitle: 'rgba(255,255,255,0.6)',
    tileBg: 'rgba(255,255,255,0.05)',
    tileLabel: 'rgba(255,255,255,0.65)',
    heatmapEmpty: 'rgba(0, 212, 255, 0.10)',
    statAccents: {
      streak: '#FF8C00',
      time: '#00FF88',
      views: '#A855F7',
      best: '#FACC15',
      heatmap: '#00D4FF',
    },
    streakPillBg: 'rgba(255, 140, 0, 0.15)',
    streakPillBorder: 'rgba(255, 140, 0, 0.4)',
  },
  light: {
    gradient: ['#F0F7FF', '#E0ECFA', '#D0E4F5'],
    title: '#0A1628',
    subtitle: 'rgba(10, 22, 40, 0.55)',
    tileBg: 'rgba(255, 255, 255, 0.7)',
    tileLabel: 'rgba(10, 22, 40, 0.55)',
    heatmapEmpty: 'rgba(0, 119, 168, 0.10)',
    statAccents: {
      streak: '#CC5500',
      time: '#059669',
      views: '#7C3AED',
      best: '#B45309',
      heatmap: '#0077A8',
    },
    streakPillBg: 'rgba(204, 85, 0, 0.12)',
    streakPillBorder: 'rgba(204, 85, 0, 0.35)',
  },
};

/**
 * Off-screen composition captured via react-native-view-shot for the
 * "Share my stats" button.
 */
export const ShareableStatsCard = forwardRef<ViewShot, ShareableStatsCardProps>(
  function ShareableStatsCard(
    {
      theme,
      storiesViewed,
      factsDeepRead,
      totalSeconds,
      currentStreak,
      longestStreak,
      heatmapCounts,
      topCategoryName,
      t,
    },
    ref
  ) {
    const palette = PALETTES[theme];
    const heatmapBase = palette.statAccents.heatmap;
    const maxCount = Math.max(1, ...heatmapCounts);
    const hexWithAlpha = (hex: string, alpha: number) => {
      const a = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0');
      return `${hex}${a}`;
    };
    const cellBg = (count: number) => {
      if (count <= 0) return palette.heatmapEmpty;
      const ratio = count / maxCount;
      if (ratio <= 0.25) return hexWithAlpha(heatmapBase, 0.3);
      if (ratio <= 0.5) return hexWithAlpha(heatmapBase, 0.55);
      if (ratio <= 0.75) return hexWithAlpha(heatmapBase, 0.8);
      return heatmapBase;
    };

    // 12 cols × 7 rows = 84 cells
    const cols = 12;
    const rows = 7;
    const padded: number[] = [
      ...Array(Math.max(0, cols * rows - heatmapCounts.length)).fill(0),
      ...heatmapCounts.slice(-cols * rows),
    ];
    const weeks: number[][] = [];
    for (let c = 0; c < cols; c++) weeks.push(padded.slice(c * rows, (c + 1) * rows));

    return (
      <View style={styles.offscreenWrapper} pointerEvents="none">
        <ViewShot
          ref={ref}
          options={{ format: 'png', quality: 0.95, width: CARD_SIZE, height: CARD_SIZE }}
        >
          <View style={styles.card}>
            <LinearGradient
              colors={palette.gradient}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <YStack padding={PADDING} gap={28} flex={1}>
              <XStack justifyContent="space-between" alignItems="flex-end">
                <YStack>
                  <Text
                    fontFamily={FONT_FAMILIES.bold}
                    fontSize={44}
                    color={palette.title}
                    letterSpacing={0.5}
                  >
                    {t('statsShareTitle')}
                  </Text>
                  <Text
                    fontFamily={FONT_FAMILIES.medium}
                    fontSize={22}
                    color={palette.subtitle}
                    marginTop={4}
                  >
                    factsaday.com
                  </Text>
                </YStack>
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: palette.streakPillBg,
                    borderWidth: 1,
                    borderColor: palette.streakPillBorder,
                  }}
                >
                  <Text
                    fontFamily={FONT_FAMILIES.bold}
                    fontSize={28}
                    color={palette.statAccents.streak}
                  >
                    🔥 {currentStreak}
                  </Text>
                </View>
              </XStack>

              <XStack gap={20}>
                <BigStat
                  label={t('statsFactsRead')}
                  value={String(factsDeepRead)}
                  accent={palette.statAccents.heatmap}
                  palette={palette}
                />
                <BigStat
                  label={t('statsTimeSpent')}
                  value={formatDuration(totalSeconds, t)}
                  accent={palette.statAccents.time}
                  palette={palette}
                />
              </XStack>

              <XStack gap={20}>
                <BigStat
                  label={t('statsFactsViewed')}
                  value={String(storiesViewed)}
                  accent={palette.statAccents.views}
                  palette={palette}
                />
                <BigStat
                  label={t('statsLongestStreak', { count: longestStreak })}
                  value={String(longestStreak)}
                  accent={palette.statAccents.best}
                  palette={palette}
                />
              </XStack>

              <YStack gap={12} marginTop={8}>
                <Text fontFamily={FONT_FAMILIES.semibold} fontSize={26} color={palette.title}>
                  {t('statsHeatmap')}
                </Text>
                <XStack gap={6}>
                  {weeks.map((week, ci) => (
                    <YStack key={ci} gap={6} flex={1}>
                      {week.map((c, ri) => (
                        <View
                          key={ri}
                          style={{
                            aspectRatio: 1,
                            borderRadius: 4,
                            backgroundColor: cellBg(c),
                          }}
                        />
                      ))}
                    </YStack>
                  ))}
                </XStack>
              </YStack>

              {topCategoryName ? (
                <YStack gap={4} marginTop={4}>
                  <Text fontFamily={FONT_FAMILIES.medium} fontSize={20} color={palette.tileLabel}>
                    {t('statsTopCategories')}
                  </Text>
                  <Text fontFamily={FONT_FAMILIES.bold} fontSize={32} color={palette.title}>
                    {topCategoryName}
                  </Text>
                </YStack>
              ) : null}
            </YStack>
          </View>
        </ViewShot>
      </View>
    );
  }
);

function BigStat({
  label,
  value,
  accent,
  palette,
}: {
  label: string;
  value: string;
  accent: string;
  palette: Palette;
}) {
  return (
    <YStack
      flex={1}
      padding={24}
      borderRadius={20}
      backgroundColor={palette.tileBg}
      borderWidth={1}
      borderColor={`${accent}40`}
      gap={6}
    >
      <Text fontFamily={FONT_FAMILIES.medium} fontSize={18} color={palette.tileLabel}>
        {label}
      </Text>
      <Text fontFamily={FONT_FAMILIES.bold} fontSize={54} color={accent}>
        {value}
      </Text>
    </YStack>
  );
}

const styles = StyleSheet.create({
  offscreenWrapper: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    overflow: 'hidden',
  },
});
