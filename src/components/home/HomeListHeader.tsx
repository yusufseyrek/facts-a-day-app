import React from 'react';

import { FlashListRef } from '@shopify/flash-list';
import { BookOpen } from '@tamagui/lucide-icons';
import { YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { CategoryStoryButtons, CategoryStoryButtonsRef } from '../CategoryStoryButtons';

import { LatestCarousel } from './LatestCarousel';
import { OnThisDayCarousel } from './OnThisDayCarousel';
import { SectionHeader } from './SectionHeader';

import type { FactViewSource } from '../../services/analytics';
import type { FactWithRelations } from '../../services/database';

interface HomeListHeaderProps {
  latestFacts: FactWithRelations[];
  latestFactIds: number[];
  onThisDayFacts: FactWithRelations[];
  onThisDayIsWeekFallback: boolean;
  keepReadingCount: number;
  isPremium: boolean;
  onFactPress: (
    fact: FactWithRelations,
    source: FactViewSource,
    factIds: number[],
    index: number
  ) => void;
  storyButtonsRef: React.RefObject<CategoryStoryButtonsRef | null>;
  latestListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
  onThisDayListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
}

export const HomeListHeader = React.memo(function HomeListHeader({
  latestFacts,
  latestFactIds,
  onThisDayFacts,
  onThisDayIsWeekFallback,
  keepReadingCount,
  isPremium,
  onFactPress,
  storyButtonsRef,
  latestListRef,
  onThisDayListRef,
}: HomeListHeaderProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  return (
    <>
      <YStack paddingBottom={spacing.lg}>
        <CategoryStoryButtons ref={storyButtonsRef} />
      </YStack>

      <LatestCarousel
        facts={latestFacts}
        factIds={latestFactIds}
        onFactPress={onFactPress}
        listRef={latestListRef}
        isPremium={isPremium}
      />

      <OnThisDayCarousel
        facts={onThisDayFacts}
        isWeekFallback={onThisDayIsWeekFallback}
        onFactPress={onFactPress}
        listRef={onThisDayListRef}
      />

      {keepReadingCount > 0 && (
        <SectionHeader
          icon={<BookOpen size={iconSizes.sm} color={colors.primary} />}
          title={t('keepReading')}
          paddingTop={spacing.md}
        />
      )}
    </>
  );
});
