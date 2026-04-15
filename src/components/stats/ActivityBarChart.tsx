import { useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import { formatShortDate } from './formatDuration';

import type { DailyActivity } from '../../services/stats';

interface ActivityBarChartProps {
  activity: DailyActivity[]; // oldest → newest
  locale: string;
}

const DAYS = 30;

/** 30-day bar chart of facts-per-day. Renders only the tail 30. */
export function ActivityBarChart({ activity, locale }: ActivityBarChartProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, typography, borderWidths, isTablet } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const secondary = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  // Responsive chart geometry.
  const MIN_SPACING = borderWidths.medium; // 2 → 3 on tablet
  const CHART_HEIGHT = isTablet ? 180 : 120;
  const BAR_BORDER_RADIUS = isTablet ? 3 : 2;
  const LABEL_ROW_HEIGHT = typography.fontSize.tiny + spacing.xs;
  const LABEL_WIDTH = Math.round(typography.fontSize.tiny * 5 + spacing.sm);
  const LABEL_MARGIN_TOP = spacing.xs;

  const [innerWidth, setInnerWidth] = useState(0);

  const days = activity.slice(-DAYS);
  const maxValue = Math.max(1, ...days.map((d) => d.count));

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - innerWidth) > 1) setInnerWidth(w);
  };

  // Use an integer bar width (crisp pixel bars) but a fractional spacing that
  // absorbs the truncation remainder — so the chart fills innerWidth precisely
  // and the last bar sits flush with the right edge of the card content area.
  const { barWidth, spacing: barSpacing } = useMemo(() => {
    if (innerWidth <= 0) return { barWidth: 6, spacing: MIN_SPACING };
    const rawBarWidth = (innerWidth - (DAYS - 1) * MIN_SPACING) / DAYS;
    const bw = Math.max(3, Math.floor(rawBarWidth));
    const sp = DAYS > 1 ? (innerWidth - bw * DAYS) / (DAYS - 1) : 0;
    return { barWidth: bw, spacing: Math.max(MIN_SPACING, sp) };
  }, [innerWidth, MIN_SPACING]);

  const chartWidth = barWidth * DAYS + barSpacing * (DAYS - 1);

  // Date markers rendered as a separate row so they never clip at the edges.
  // Pick indexes that keep ~even spacing and always show the first and last day.
  const markerIndexes = useMemo(() => [0, 7, 14, 21, DAYS - 1], []);
  const markerLabels = markerIndexes
    .map((idx) => (days[idx] ? { idx, label: formatShortDate(days[idx].date, locale) } : null))
    .filter((m): m is { idx: number; label: string } => !!m);

  const data = useMemo(
    () =>
      days.map((d) => ({
        value: d.count,
        frontColor: d.count > 0 ? colors.primary : `${colors.primary}25`,
      })),
    [days, colors.primary]
  );

  return (
    <YStack gap={spacing.sm}>
      <YStack gap={spacing.xs}>
        <Text.Title color={isDark ? '#FFFFFF' : hexColors.light.text}>
          {t('statsActivity')}
        </Text.Title>
        <Text.Caption color={secondary}>{t('statsActivitySubtitle')}</Text.Caption>
      </YStack>

      <YStack backgroundColor={colors.cardBackground} borderRadius={radius.lg} padding={spacing.lg}>
        <View onLayout={handleLayout} style={{ width: '100%' }}>
          {innerWidth > 0 ? (
            <>
              <View pointerEvents="none" style={{ width: chartWidth, alignSelf: 'flex-start' }}>
                <BarChart
                  key={`${theme}-${innerWidth}`}
                  data={data}
                  barWidth={barWidth}
                  spacing={barSpacing}
                  initialSpacing={0}
                  endSpacing={0}
                  barBorderRadius={BAR_BORDER_RADIUS}
                  hideRules
                  hideYAxisText
                  xAxisColor={isDark ? hexColors.dark.border : hexColors.light.border}
                  yAxisColor="transparent"
                  yAxisThickness={0}
                  yAxisLabelWidth={0}
                  maxValue={Math.max(4, maxValue)}
                  noOfSections={4}
                  height={CHART_HEIGHT}
                  disableScroll
                  isAnimated
                  animationDuration={600}
                />
              </View>

              {/* Date markers aligned to bar centers — sidesteps gifted-charts' label clipping. */}
              <View
                style={{
                  width: chartWidth,
                  height: LABEL_ROW_HEIGHT,
                  marginTop: LABEL_MARGIN_TOP,
                  position: 'relative',
                }}
              >
                {markerLabels.map(({ idx, label }) => {
                  const centerX = idx * (barWidth + barSpacing) + barWidth / 2;
                  const minLeft = 0;
                  const maxLeft = chartWidth - LABEL_WIDTH;
                  const rawLeft = centerX - LABEL_WIDTH / 2;
                  const left = Math.max(minLeft, Math.min(maxLeft, rawLeft));
                  // Pick text alignment so the label visually centers on the bar when possible,
                  // but hugs the edge when it's been clamped inside the chart bounds.
                  const textAlign: 'left' | 'center' | 'right' =
                    rawLeft <= minLeft ? 'left' : rawLeft >= maxLeft ? 'right' : 'center';
                  return (
                    <Text.Tiny
                      key={idx}
                      color={secondary}
                      fontFamily={FONT_FAMILIES.medium}
                      numberOfLines={1}
                      style={{
                        position: 'absolute',
                        left,
                        width: LABEL_WIDTH,
                        textAlign,
                      }}
                    >
                      {label}
                    </Text.Tiny>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={{ height: CHART_HEIGHT + LABEL_ROW_HEIGHT + LABEL_MARGIN_TOP }} />
          )}
        </View>
      </YStack>
    </YStack>
  );
}
