import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';

import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import { formatShortDate } from './formatDuration';

import type { DailyActivity } from '../../services/stats';

interface HeatmapGridProps {
  activity: DailyActivity[]; // oldest → newest
  locale: string;
}

const COLS = 14; // ~14 weeks
const ROWS = 7;

/**
 * GitHub-contribution-style grid. Columns are weeks (oldest on the left).
 * Rows are weekdays — row 0 = Sunday, row 6 = Saturday. Today is always in
 * the last column at its true weekday row.
 */
export const HeatmapGrid = React.memo(function HeatmapGrid({ activity, locale }: HeatmapGridProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, typography, borderWidths, isTablet } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const secondary = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  // Responsive sizing — tablet gets a looser grid with bigger legends.
  const cellGap = isTablet ? 5 : 3;
  const axisWidth = isTablet ? 64 : 42;
  const monthAxisHeight = typography.fontSize.tiny + spacing.xs;
  const legendSquareSize = isTablet ? 14 : 10;
  const legendSquareRadius = isTablet ? 3 : 2;
  const cellBorderRadius = isTablet ? 5 : 3;
  const selectionBorderWidth = borderWidths.thin;

  const [selected, setSelected] = useState<DailyActivity | null>(null);
  const [cellSize, setCellSize] = useState(0);

  const cardPadding = spacing.lg;
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const outer = e.nativeEvent.layout.width;
      const contentWidth = outer - cardPadding * 2;
      const gridWidth = contentWidth - axisWidth;
      const size = Math.floor((gridWidth - (COLS - 1) * cellGap) / COLS);
      if (size > 0) setCellSize((prev) => (prev === size ? prev : size));
    },
    [cardPadding, axisWidth, cellGap]
  );

  const maxCount = useMemo(() => Math.max(1, ...activity.map((a) => a.count)), [activity]);

  const bucketFor = useCallback(
    (count: number): 0 | 1 | 2 | 3 | 4 => {
      if (count <= 0) return 0;
      const ratio = count / maxCount;
      if (ratio <= 0.25) return 1;
      if (ratio <= 0.5) return 2;
      if (ratio <= 0.75) return 3;
      return 4;
    },
    [maxCount]
  );

  const bucketColors = useMemo<Record<0 | 1 | 2 | 3 | 4, string>>(
    () => ({
      0: isDark ? '#1A2E4A' : '#E3EDF8',
      1: `${colors.primary}35`,
      2: `${colors.primary}65`,
      3: `${colors.primary}A0`,
      4: colors.primary,
    }),
    [isDark, colors.primary]
  );

  // Weekday-aligned grid data — only recomputes when activity changes.
  const weeks = useMemo(() => {
    const todayWeekday = new Date().getDay();
    const endPad = 6 - todayWeekday;
    const totalCells = COLS * ROWS;
    const trimmed = activity.slice(-(totalCells - endPad));
    const startPad = Math.max(0, totalCells - endPad - trimmed.length);
    const padded: (DailyActivity | null)[] = [
      ...Array(startPad).fill(null),
      ...trimmed,
      ...Array(endPad).fill(null),
    ];
    const cols: (DailyActivity | null)[][] = [];
    for (let c = 0; c < COLS; c++) {
      cols.push(padded.slice(c * ROWS, (c + 1) * ROWS));
    }
    return cols;
  }, [activity]);

  const monthLabels = useMemo<(string | null)[]>(() => {
    const out: (string | null)[] = Array(COLS).fill(null);
    let lastMonth: number | null = null;
    for (let c = 0; c < COLS; c++) {
      const firstDay = weeks[c].find((d) => d) ?? null;
      if (!firstDay) continue;
      const month = Number(firstDay.date.split('-')[1]) - 1;
      if (month !== lastMonth) {
        const labelDate = new Date(firstDay.date + 'T12:00:00');
        out[c] = labelDate.toLocaleDateString(locale, { month: 'short' });
        lastMonth = month;
      }
    }
    return out;
  }, [weeks, locale]);

  const weekdayLabels = useMemo<(string | null)[]>(() => {
    const anchor = new Date(Date.UTC(2024, 0, 7)); // Sunday
    const labels: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(anchor);
      date.setUTCDate(anchor.getUTCDate() + d);
      if (d === 1 || d === 3 || d === 5) {
        labels.push(date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }));
      } else {
        labels.push(null);
      }
    }
    return labels;
  }, [locale]);

  const handleSelect = useCallback((day: DailyActivity | null) => {
    if (!day) return;
    setSelected(day);
  }, []);

  const caption = selected
    ? selected.count === 0
      ? t('statsNoActivityOn', { date: formatShortDate(selected.date, locale) })
      : selected.count === 1
        ? t('statsOneFactOn', { count: 1, date: formatShortDate(selected.date, locale) })
        : t('statsManyFactsOn', {
            count: selected.count,
            date: formatShortDate(selected.date, locale),
          })
    : t('statsHeatmapSubtitle');

  const columnWidth = cellSize > 0 ? cellSize : 0;
  const gridMinHeight =
    cellSize > 0 ? cellSize * ROWS + cellGap * (ROWS - 1) : isTablet ? 200 : 140;

  const selectedDate = selected?.date ?? null;

  return (
    <YStack gap={spacing.sm}>
      <YStack gap={spacing.xs}>
        <Text.Title color={isDark ? '#FFFFFF' : hexColors.light.text}>
          {t('statsHeatmap')}
        </Text.Title>
        <Text.Caption color={secondary}>{caption}</Text.Caption>
      </YStack>

      <YStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        padding={spacing.lg}
        onLayout={handleLayout}
      >
        {/* Month axis */}
        <XStack paddingLeft={axisWidth} height={monthAxisHeight} alignItems="flex-end">
          {cellSize > 0
            ? monthLabels.map((label, ci) => (
                <View
                  key={ci}
                  style={{
                    width: columnWidth,
                    marginRight: ci < COLS - 1 ? cellGap : 0,
                    justifyContent: 'flex-end',
                  }}
                >
                  {label ? (
                    <Text.Tiny
                      color={secondary}
                      fontFamily={FONT_FAMILIES.medium}
                      numberOfLines={1}
                      style={{ width: columnWidth * 2 }}
                    >
                      {label}
                    </Text.Tiny>
                  ) : null}
                </View>
              ))
            : null}
        </XStack>

        {/* Grid + weekday axis */}
        <XStack minHeight={gridMinHeight} marginTop={spacing.xs}>
          <YStack width={axisWidth} paddingRight={spacing.xs}>
            {weekdayLabels.map((label, i) => (
              <View
                key={i}
                style={{
                  height: cellSize > 0 ? cellSize : 0,
                  marginBottom: i < ROWS - 1 ? cellGap : 0,
                  justifyContent: 'center',
                }}
              >
                {label ? (
                  <Text.Tiny color={secondary} fontFamily={FONT_FAMILIES.medium} numberOfLines={1}>
                    {label}
                  </Text.Tiny>
                ) : null}
              </View>
            ))}
          </YStack>

          <XStack flex={1}>
            {cellSize > 0
              ? weeks.map((week, ci) => (
                  <YStack key={ci} width={columnWidth} marginRight={ci < COLS - 1 ? cellGap : 0}>
                    {week.map((day, ri) => {
                      const bucket = day ? bucketFor(day.count) : 0;
                      const fill = day ? bucketColors[bucket] : 'transparent';
                      return (
                        <HeatmapCell
                          key={ri}
                          day={day}
                          size={cellSize}
                          gap={ri < ROWS - 1 ? cellGap : 0}
                          borderRadius={cellBorderRadius}
                          fill={fill}
                          isSelected={!!day && day.date === selectedDate}
                          selectionBorderWidth={selectionBorderWidth}
                          selectionColor={colors.primary}
                          onSelect={handleSelect}
                        />
                      );
                    })}
                  </YStack>
                ))
              : null}
          </XStack>
        </XStack>

        {/* Intensity legend */}
        <XStack
          justifyContent="flex-end"
          alignItems="center"
          gap={spacing.xs}
          marginTop={spacing.md}
        >
          <Text.Tiny color={secondary}>{t('statsHeatmapLess')}</Text.Tiny>
          {([0, 1, 2, 3, 4] as const).map((b) => (
            <View
              key={b}
              style={{
                width: legendSquareSize,
                height: legendSquareSize,
                borderRadius: legendSquareRadius,
                backgroundColor: bucketColors[b],
              }}
            />
          ))}
          <Text.Tiny color={secondary}>{t('statsHeatmapMore')}</Text.Tiny>
        </XStack>
      </YStack>
    </YStack>
  );
});

/** Individual heatmap cell — memoized so tapping one cell doesn't re-render the other 97. */
const HeatmapCell = React.memo(function HeatmapCell({
  day,
  size,
  gap,
  borderRadius,
  fill,
  isSelected,
  selectionBorderWidth,
  selectionColor,
  onSelect,
}: {
  day: DailyActivity | null;
  size: number;
  gap: number;
  borderRadius: number;
  fill: string;
  isSelected: boolean;
  selectionBorderWidth: number;
  selectionColor: string;
  onSelect: (day: DailyActivity | null) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(day)}
      hitSlop={2}
      style={{
        width: size,
        height: size,
        marginBottom: gap,
        borderRadius,
        backgroundColor: fill,
        borderWidth: isSelected ? selectionBorderWidth : 0,
        borderColor: selectionColor,
      }}
    />
  );
});
