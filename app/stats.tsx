import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';

import { ChevronLeft, Share2 } from '@tamagui/lucide-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { ContentContainer, EmptyState } from '../src/components';
import { ActivityBarChart } from '../src/components/stats/ActivityBarChart';
import { CategoryBreakdown } from '../src/components/stats/CategoryBreakdown';
import { HabitsCard } from '../src/components/stats/HabitsCard';
import { HeatmapGrid } from '../src/components/stats/HeatmapGrid';
import { ReadingBadgesStrip } from '../src/components/stats/ReadingBadgesStrip';
import { ShareableStatsCard } from '../src/components/stats/ShareableStatsCard';
import { StatsHero } from '../src/components/stats/StatsHero';
import { FONT_FAMILIES, Text } from '../src/components/Typography';
import { queryClient } from '../src/config/queryClient';
import { statsKeys } from '../src/hooks/queryKeys';
import {
  useDailyReadingActivity,
  useReadingHabits,
  useReadingOverview,
  useTopCategoriesRead,
} from '../src/hooks/useReadingStats';
import { useTranslation } from '../src/i18n';
import { Screens, trackScreenView } from '../src/services/analytics';
import { getEarnedBadges } from '../src/services/badges';
import { hexColors, useTheme } from '../src/theme';
import { useResponsive } from '../src/utils/useResponsive';

export default function StatsScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { iconSizes, spacing, radius, media } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;

  const overview = useReadingOverview();
  const dailyActivity = useDailyReadingActivity(90);
  const habits = useReadingHabits();
  const topCategories = useTopCategoriesRead(5);

  const [earnedBadgeIds, setEarnedBadgeIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  const loadEarnedBadges = useCallback(async () => {
    try {
      const badges = await getEarnedBadges();
      setEarnedBadgeIds(new Set(badges.map((b) => b.badge_id)));
    } catch {
      // Badge progress is non-critical; fall back to an empty set.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.READING_STATS);
    }, [])
  );

  useEffect(() => {
    loadEarnedBadges();
  }, [loadEarnedBadges]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: statsKeys.all });
    await loadEarnedBadges();
    setRefreshing(false);
  }, [loadEarnedBadges]);

  const handleShare = useCallback(async () => {
    if (isSharing) return;
    const current = viewShotRef.current;
    if (!current || typeof current.capture !== 'function') return;
    try {
      setIsSharing(true);
      const uri = await current.capture();
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          dialogTitle: t('statsShareTitle'),
          mimeType: 'image/png',
          UTI: 'public.png',
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('Stats share failed', error);
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, t]);

  const isInitialLoading = !overview.data && (overview.isLoading || dailyActivity.isLoading);
  const overviewData = overview.data;
  const activityData = dailyActivity.data ?? [];
  const hasAnyActivity =
    !!overviewData &&
    (overviewData.storiesViewed > 0 ||
      overviewData.factsDeepRead > 0 ||
      overviewData.currentStreak > 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Animated.View
        entering={FadeInUp.duration(400).springify()}
        needsOffscreenAlphaCompositing={Platform.OS === 'android'}
      >
        <XStack
          paddingTop={insets.top + spacing.sm}
          paddingBottom={spacing.md}
          paddingHorizontal={spacing.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={colors.primary} />
          <Text.Title color={textColor}>{t('readingStatsTitle')}</Text.Title>
          <View style={{ width: media.topicCardSize * 0.45, height: media.topicCardSize * 0.45 }} />
        </XStack>
      </Animated.View>

      {isInitialLoading ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={colors.primary} />
        </YStack>
      ) : !hasAnyActivity || !overviewData ? (
        <EmptyState title={t('statsNoData')} description={t('statsNoDataDescription')} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
        >
          <ContentContainer>
            <YStack marginVertical={spacing.lg} gap={spacing.xl}>
              <Section delay={50}>
                <StatsHero
                  storiesViewed={overviewData.storiesViewed}
                  factsDeepRead={overviewData.factsDeepRead}
                  totalSeconds={overviewData.totalSeconds}
                  currentStreak={overviewData.currentStreak}
                  longestStreak={overviewData.longestStreak}
                />
              </Section>

              {activityData.length > 0 ? (
                <Section delay={100}>
                  <HeatmapGrid activity={activityData} locale={locale} />
                </Section>
              ) : null}

              {activityData.length > 0 ? (
                <Section delay={150}>
                  <ActivityBarChart activity={activityData} locale={locale} />
                </Section>
              ) : null}

              {habits.data?.hasData ? (
                <Section delay={200}>
                  <HabitsCard habits={habits.data} locale={locale} />
                </Section>
              ) : null}

              {topCategories.data && topCategories.data.length > 0 ? (
                <Section delay={250}>
                  <CategoryBreakdown categories={topCategories.data} />
                </Section>
              ) : null}

              <Section delay={300}>
                <ReadingBadgesStrip earnedBadgeIds={earnedBadgeIds} />
              </Section>

              <Section delay={350}>
                <Pressable
                  onPress={handleShare}
                  disabled={isSharing}
                  style={({ pressed }) => ({
                    opacity: pressed || isSharing ? 0.7 : 1,
                  })}
                >
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius={radius.lg}
                    paddingVertical={spacing.md}
                    alignItems="center"
                    justifyContent="center"
                    gap={spacing.sm}
                  >
                    {isSharing ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Share2 size={iconSizes.sm} color="#FFFFFF" />
                    )}
                    <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                      {t('statsShareButton')}
                    </Text.Label>
                  </XStack>
                </Pressable>
              </Section>
            </YStack>
          </ContentContainer>
        </ScrollView>
      )}

      {overviewData ? (
        <ShareableStatsCard
          ref={viewShotRef}
          theme={theme}
          storiesViewed={overviewData.storiesViewed}
          factsDeepRead={overviewData.factsDeepRead}
          totalSeconds={overviewData.totalSeconds}
          currentStreak={overviewData.currentStreak}
          longestStreak={overviewData.longestStreak}
          heatmapCounts={activityData.map((d) => d.count)}
          topCategoryName={topCategories.data?.[0]?.name ?? null}
          t={t}
        />
      ) : null}
    </View>
  );
}

/** Staggered fade-in wrapper used by every section on this screen. */
function Section({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(400).springify()}
      needsOffscreenAlphaCompositing={Platform.OS === 'android'}
    >
      {children}
    </Animated.View>
  );
}

function BackButton({ onPress, primaryColor }: { onPress: () => void; primaryColor: string }) {
  const { iconSizes, media } = useResponsive();
  const scale = useRef(new RNAnimated.Value(1)).current;
  const buttonSize = media.topicCardSize * 0.45;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <RNAnimated.View
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: `${primaryColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
          transform: [{ scale }],
        }}
      >
        <ChevronLeft size={iconSizes.lg} color={primaryColor} />
      </RNAnimated.View>
    </Pressable>
  );
}
