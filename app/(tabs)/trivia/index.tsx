import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useFocusEffect, useNavigation } from 'expo-router';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ContentContainer, ScreenContainer } from '../../../src/components';
import { ArrowRight, Sparkles, Trophy } from '../../../src/components/icons';
import { XStack, YStack } from '../../../src/components/Stacks';
import { TriviaGridCard, TriviaIntroModal, TriviaStatsHero } from '../../../src/components/trivia';
import { FONT_FAMILIES, Text } from '../../../src/components/Typography';
import { useScrollToTopHandler } from '../../../src/contexts';
import { useHeaderContentGap } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { onPreferenceFeedRefresh } from '../../../src/services/preferences';
import { consumePendingQuizSessionId } from '../../../src/services/quizSession';
import * as triviaService from '../../../src/services/trivia';
import { hexColors, useTheme } from '../../../src/theme';
import { hexToHue } from '../../../src/utils/colors';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { CategoryWithProgress } from '../../../src/services/trivia';

export default function TriviaScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const isDark = theme === 'dark';
  const { isTablet, typography, config, iconSizes, spacing, radius } = useResponsive();
  const headerGap = useHeaderContentGap();

  // Per-section loading instead of one full-screen gate. Four independent
  // tracks so each region settles the moment ITS data is ready and never waits
  // on an unrelated slower call:
  //   statsLoading      — hero: pure-local SQLite stats (lands first)
  //   categoriesLoading — modes grid: local selection + cached metadata
  //   countsLoading      — daily/mixed cards: the two availability fetches
  //   allTimeRank        — leaderboard standing: decorative, gates nothing
  const [statsLoading, setStatsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Scroll to top handler
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);
  useScrollToTopHandler('trivia', scrollToTop);

  // Trivia stats
  const [dailyQuestionsCount, setDailyQuestionsCount] = useState(0);
  const [isDailyCompleted, setIsDailyCompleted] = useState(false);
  const [mixedQuestionsCount, setMixedQuestionsCount] = useState(0);
  const [overallStats, setOverallStats] = useState<triviaService.TriviaStats | null>(null);
  const [allTimeRank, setAllTimeRank] = useState<number | null>(null);
  const [categoriesWithProgress, setCategoriesWithProgress] = useState<CategoryWithProgress[]>([]);

  // Pending trivia modal state
  const [pendingTrivia, setPendingTrivia] = useState<{
    type: 'daily' | 'mixed' | 'category';
    categorySlug?: string;
    categoryName?: string;
    categoryDescription?: string;
    categoryIcon?: string;
    categoryColor?: string;
    questionCount: number;
    // Progress fields below are daily/mixed-only; category sessions omit them.
    masteredCount?: number;
    totalQuestions?: number;
    answeredCount?: number;
    correctCount?: number;
  } | null>(null);

  // Keep last valid data for smooth close animation
  const lastPendingTriviaRef = useRef(pendingTrivia);
  if (pendingTrivia !== null) {
    lastPendingTriviaRef.current = pendingTrivia;
  }
  const modalData = pendingTrivia ?? lastPendingTriviaRef.current;

  const loadTriviaData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);

      // Hero stats — pure-local SQLite (stats/streak/completion). No network,
      // so the hero never waits on metadata or the leaderboard.
      const statsLoad = (async () => {
        try {
          const [dailyCompleted, stats] = await Promise.all([
            triviaService.isDailyTriviaCompleted(),
            triviaService.getOverallStats(),
          ]);
          setIsDailyCompleted(dailyCompleted);
          setOverallStats(stats);
        } catch (error) {
          console.error('Error loading trivia stats:', error);
        } finally {
          setStatsLoading(false);
        }
      })();

      // Category grid — local selection joined with React-Query-cached
      // metadata. Gates the modes section so daily/mixed + category rows mount
      // in the same frame.
      const categoriesLoad = (async () => {
        try {
          const categories = await triviaService.getCategoriesWithProgress(locale);
          // Sort by color hue, but push categories with 0 questions to the end.
          const sorted = [...categories].sort((a, b) => {
            if (a.total > 0 !== b.total > 0) return b.total > 0 ? 1 : -1;
            return hexToHue(a.color_hex) - hexToHue(b.color_hex);
          });
          setCategoriesWithProgress(sorted);
        } catch (error) {
          console.error('Error loading trivia categories:', error);
        } finally {
          setCategoriesLoading(false);
        }
      })();

      // Availability counts — the two network fetches that gate the daily/mixed
      // cards, grouped on their own so the leaderboard can't hold them up.
      const countsLoad = (async () => {
        try {
          const [dailyCount, mixedCount] = await Promise.all([
            triviaService.getDailyTriviaQuestionsCount(locale),
            triviaService.getMixedTriviaQuestionsCount(locale),
          ]);
          setDailyQuestionsCount(dailyCount);
          setMixedQuestionsCount(mixedCount);
        } catch (error) {
          console.error('Error loading trivia question counts:', error);
        } finally {
          setCountsLoading(false);
        }
      })();

      // All-time standing — decorative (hero row + header trophy). Independent
      // of every card; absent (anonymous, no results, offline) just hides it.
      const rankLoad = (async () => {
        try {
          const board = await api.getTriviaLeaderboard('all', 1);
          setAllTimeRank(board?.me?.rank ?? null);
        } catch {
          // leave the rank hidden
        }
      })();

      await Promise.all([statsLoad, categoriesLoad, countsLoad, rankLoad]);
      setRefreshing(false);
    },
    [locale]
  );

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.TRIVIA || 'Trivia');
      loadTriviaData();

      // Check if we need to open a quick quiz session result
      const pendingSessionId = consumePendingQuizSessionId();
      if (pendingSessionId !== null) {
        router.push(`/trivia/performance?sessionId=${pendingSessionId}`);
      }
    }, [loadTriviaData, router])
  );

  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      loadTriviaData();
    });

    return () => unsubscribe();
  }, [loadTriviaData]);

  // Leaderboard entry lives in the native header (replaced the achievements
  // streak badge); shows the viewer's all-time rank when they have one.
  useEffect(() => {
    const secondaryTextColor = isDark
      ? hexColors.dark.textSecondary
      : hexColors.light.textSecondary;
    const rankedColor = isDark ? hexColors.dark.warning : hexColors.light.warning;
    const trophyColor = allTimeRank !== null ? rankedColor : secondaryTextColor;

    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push('/(tabs)/trivia/leaderboard')}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {/* Bare icon + rank: no chip background — inside the iOS 26 glass
              header a filled pill reads as a stray box. Padding kept for the
              touch target. */}
          <XStack
            alignItems="center"
            gap={spacing.xs}
            paddingHorizontal={spacing.sm}
            paddingVertical={spacing.xs}
          >
            <Trophy size={iconSizes.sm} color={trophyColor} />
            {allTimeRank !== null && (
              <Text.Label fontFamily={FONT_FAMILIES.semibold} color={trophyColor}>
                {`#${allTimeRank}`}
              </Text.Label>
            )}
          </XStack>
        </Pressable>
      ),
    });
  }, [navigation, allTimeRank, isDark, router, spacing, iconSizes]);

  // Show intro modal before starting trivia
  const showDailyTriviaIntro = () => {
    setPendingTrivia({
      type: 'daily',
      questionCount: Math.min(dailyQuestionsCount, triviaService.DAILY_TRIVIA_QUESTIONS),
      masteredCount: 0,
      totalQuestions: dailyQuestionsCount,
      answeredCount: 0,
      correctCount: 0,
    });
  };

  const showMixedTriviaIntro = () => {
    setPendingTrivia({
      type: 'mixed',
      questionCount: Math.min(mixedQuestionsCount, triviaService.MIXED_TRIVIA_QUESTIONS),
      masteredCount: overallStats?.totalMastered || 0,
      totalQuestions: mixedQuestionsCount,
      answeredCount: overallStats?.totalAnswered || 0,
      correctCount: overallStats?.totalCorrect || 0,
    });
  };

  const showCategoryTriviaIntro = (category: CategoryWithProgress) => {
    // Category sessions fetch a fixed number of questions from the API on start;
    // there's no local pool to subtract a "mastered" count from. Show the
    // session size (clamped at fetch time if a category has fewer available).
    setPendingTrivia({
      type: 'category',
      categorySlug: category.slug,
      categoryName: category.name,
      categoryDescription: category.description || undefined,
      categoryIcon: category.icon || undefined,
      categoryColor: category.color_hex || undefined,
      questionCount: triviaService.CATEGORY_TRIVIA_QUESTIONS,
    });
  };

  const handleCloseIntroModal = () => {
    setPendingTrivia(null);
  };

  const handleStartFromIntroModal = () => {
    if (!pendingTrivia) return;

    const triviaInfo = pendingTrivia;
    setPendingTrivia(null);

    // Navigate to the new trivia game screen
    if (triviaInfo.type === 'daily') {
      router.push('/trivia/game?type=daily');
    } else if (triviaInfo.type === 'mixed') {
      router.push('/trivia/game?type=mixed');
    } else if (triviaInfo.type === 'category' && triviaInfo.categorySlug) {
      router.push(
        `/trivia/game?type=category&categorySlug=${triviaInfo.categorySlug}&categoryName=${encodeURIComponent(triviaInfo.categoryName || '')}`
      );
    }
  };

  // Hub view (main trivia screen)
  // Check if there are any questions available (daily, mixed, or any category with questions)
  const hasCategoryQuestions = categoriesWithProgress.some((cat) => cat.total > 0);
  const hasQuestions = dailyQuestionsCount > 0 || mixedQuestionsCount > 0 || hasCategoryQuestions;
  // Show categories section if user has selected categories (even if no questions yet)
  const hasCategories = categoriesWithProgress.length > 0;
  // While the counts are still in flight we can't tell "no content" from
  // "still checking", so keep the modes grid up (cards show their own pending
  // state) and only fall back to the empty state once the counts have loaded.
  const showModes = hasQuestions || hasCategories || countsLoading;

  // Colors for empty state
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const primaryLightColor = isDark ? hexColors.dark.primaryLight : hexColors.light.primaryLight;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;

  // Helper to chunk categories into rows
  const chunkCategories = (categories: CategoryWithProgress[], size: number) => {
    const chunks: CategoryWithProgress[][] = [];
    for (let i = 0; i < categories.length; i += size) {
      chunks.push(categories.slice(i, i + size));
    }
    return chunks;
  };

  // On tablets, show 4 categories per row; on phones, show 2
  const categoriesPerRow = config.triviaCategoriesPerRow;
  const categoryRows = chunkCategories(categoriesWithProgress, categoriesPerRow);

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <YStack flex={1}>
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadTriviaData(true)} />
          }
        >
          <ContentContainer paddingTop={headerGap + spacing.sm} paddingBottom={spacing.xl}>
            {/* Always show Stats */}
            <Animated.View
              entering={FadeInDown.delay(50).duration(300)}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <TriviaStatsHero
                stats={overallStats}
                categories={categoriesWithProgress}
                isDark={isDark}
                loading={statsLoading}
                allTimeRank={allTimeRank}
                t={t}
                onPress={() => router.push('/(tabs)/trivia/performance')}
              />
            </Animated.View>

            {/* Hold the whole modes section until the category load lands so
                the daily/mixed row and the category rows mount in the same
                frame — their staggered entering delays then play as one
                sequence instead of daily/mixed popping in ahead of the grid.
                categoriesLoading only starts true on first mount, so re-focus
                loads never hide an already-visible grid. */}
            {categoriesLoading ? null : showModes ? (
              <>
                {/* Section title */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(300)}
                  needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                >
                  <Text.Body
                    color={textColor}
                    fontFamily={FONT_FAMILIES.semibold}
                    marginTop={spacing.xxl}
                    marginBottom={spacing.md}
                    marginLeft={spacing.sm}
                  >
                    {t('triviaGameModes')}
                  </Text.Body>
                </Animated.View>
                <View style={{ gap: spacing.lg }}>
                  {/* First row: Daily Trivia + Mixed Trivia */}
                  <Animated.View
                    entering={FadeInDown.delay(150).duration(300)}
                    needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                  >
                    <XStack gap={spacing.lg}>
                      <TriviaGridCard
                        type="daily"
                        title={t('dailyTrivia')}
                        subtitle={
                          isDailyCompleted
                            ? t('dailyTriviaCompleted')
                            : dailyQuestionsCount > 0
                              ? t('triviaQuestionsCount', {
                                  count: Math.min(
                                    dailyQuestionsCount,
                                    triviaService.DAILY_TRIVIA_QUESTIONS
                                  ),
                                })
                              : t('noQuestionsYet')
                        }
                        isCompleted={isDailyCompleted}
                        isDisabled={!countsLoading && dailyQuestionsCount === 0}
                        isLoading={countsLoading}
                        isDark={isDark}
                        onPress={showDailyTriviaIntro}
                        centerContent={isTablet}
                      />
                      <TriviaGridCard
                        type="mixed"
                        title={t('mixedTrivia')}
                        subtitle={t('mixedTriviaDescription')}
                        isDisabled={!countsLoading && mixedQuestionsCount === 0}
                        isLoading={countsLoading}
                        isDark={isDark}
                        onPress={showMixedTriviaIntro}
                        centerContent={isTablet}
                      />
                    </XStack>
                  </Animated.View>

                  {/* Category rows */}
                  {categoryRows.map((row, rowIndex) => (
                    <Animated.View
                      key={`row-${rowIndex}`}
                      entering={FadeInDown.delay(200 + rowIndex * 50).duration(300)}
                      needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                    >
                      <XStack gap={spacing.lg}>
                        {row.map((category) => (
                          <TriviaGridCard
                            key={category.slug}
                            type="category"
                            title={category.name}
                            icon={category.icon || undefined}
                            colorHex={category.color_hex || undefined}
                            // Category questions are fetched from the API on tap
                            // (getCategoryTriviaQuestions), so cards are never
                            // disabled or annotated with a local question count.
                            isDisabled={false}
                            isDark={isDark}
                            onPress={() => showCategoryTriviaIntro(category)}
                          />
                        ))}
                        {/* Add empty spacers if the row is not full */}
                        {row.length < categoriesPerRow &&
                          Array.from({ length: categoriesPerRow - row.length }).map((_, i) => (
                            <View key={`spacer-${i}`} style={{ flex: 1 }} />
                          ))}
                      </XStack>
                    </Animated.View>
                  ))}
                </View>
              </>
            ) : (
              /* Engaging Empty State */
              <Animated.View
                entering={FadeInDown.duration(400).delay(200)}
                needsOffscreenAlphaCompositing={Platform.OS === 'android'}
              >
                <YStack
                  backgroundColor={cardBg}
                  borderRadius={radius.lg}
                  padding={spacing.xl}
                  alignItems="center"
                  gap={spacing.lg}
                >
                  {/* Animated Icon */}
                  <YStack
                    width={iconSizes.heroLg}
                    height={iconSizes.heroLg}
                    borderRadius={iconSizes.heroLg / 2}
                    backgroundColor={primaryLightColor}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Sparkles size={iconSizes.hero} color={purpleColor} />
                  </YStack>

                  {/* Title & Description */}
                  <YStack alignItems="center" gap={spacing.sm}>
                    <Text.Title color={textColor} textAlign="center">
                      {t('triviaEmptyTitle')}
                    </Text.Title>
                    <Text.Body color={secondaryTextColor} textAlign="center">
                      {t('triviaEmptyDescription')}
                    </Text.Body>
                  </YStack>

                  {/* CTA Button */}
                  <Pressable
                    onPress={() => router.push('/(tabs)/')}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.8 : 1,
                      width: '100%',
                    })}
                  >
                    <XStack
                      backgroundColor={primaryColor}
                      paddingVertical={spacing.md}
                      paddingHorizontal={spacing.xl}
                      borderRadius={radius.md}
                      justifyContent="center"
                      alignItems="center"
                      gap={spacing.sm}
                    >
                      <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                        {t('startExploring')}
                      </Text.Label>
                      <ArrowRight size={typography.fontSize.title} color="#FFFFFF" />
                    </XStack>
                  </Pressable>
                </YStack>
              </Animated.View>
            )}
          </ContentContainer>
        </ScrollView>
      </YStack>

      {/* Trivia Intro Modal */}
      <TriviaIntroModal
        visible={pendingTrivia !== null}
        onStart={handleStartFromIntroModal}
        onClose={handleCloseIntroModal}
        type={modalData?.type || 'daily'}
        categoryName={modalData?.categoryName}
        categoryDescription={modalData?.categoryDescription}
        categoryIcon={modalData?.categoryIcon}
        categoryColor={modalData?.categoryColor}
        questionCount={modalData?.questionCount || 0}
        masteredCount={modalData?.masteredCount}
        totalQuestions={modalData?.totalQuestions}
        answeredCount={modalData?.answeredCount}
        correctCount={modalData?.correctCount}
      />
    </ScreenContainer>
  );
}
