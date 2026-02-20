import React, { useCallback, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookOpen, ChevronLeft, Flame, Gamepad2, Trophy } from '@tamagui/lucide-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { BadgeCard } from '../src/components/badges/BadgeCard';
import { BadgeDetailSheet } from '../src/components/badges/BadgeDetailSheet';
import { BadgesScreenSkeleton } from '../src/components/badges/BadgesScreenSkeleton';
import { ContentContainer } from '../src/components/ScreenLayout';
import { FONT_FAMILIES, Text } from '../src/components/Typography';
import { useTranslation } from '../src/i18n';
import {
  type BadgeWithStatus,
  getAllBadgesWithStatus,
  getQuizStreak,
  getReadingStreak,
} from '../src/services/badges';
import { Screens, trackBadgeDetailView, trackScreenView } from '../src/services/analytics';
import { getCachedBadgeData, setCachedBadgeData } from '../src/services/badgeCache';
import { hexColors, useTheme } from '../src/theme';
import { useResponsive } from '../src/utils/useResponsive';

function SectionLabel({
  icon,
  label,
  count,
}: {
  icon: React.ReactElement;
  label: string;
  count: string;
}) {
  const { spacing } = useResponsive();
  const { theme } = useTheme();
  const colors = hexColors[theme];

  return (
    <XStack alignItems="center" justifyContent="space-between" paddingTop={spacing.md}>
      <XStack alignItems="center" gap={spacing.md}>
        {icon}
        <Text.Headline color={colors.text}>{label}</Text.Headline>
      </XStack>
      <Text.Body color={colors.textSecondary} fontFamily={FONT_FAMILIES.semibold}>
        {count}
      </Text.Body>
    </XStack>
  );
}

// Back Button with press animation
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

export default function BadgesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, iconSizes, media } = useResponsive();
  const colors = hexColors[theme];
  const insets = useSafeAreaInsets();

  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [streak, setStreak] = useState(0);
  const [quizStreakCount, setQuizStreakCount] = useState(0);
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBadgeData = useCallback(async (cancelled: { current: boolean }, silent: boolean) => {
    try {
      const [badgesResult, streakResult, quizStreakResult] = await Promise.all([
        getAllBadgesWithStatus(),
        getReadingStreak(),
        getQuizStreak(),
      ]);
      if (cancelled.current) return;
      setBadges(badgesResult);
      setStreak(streakResult);
      setQuizStreakCount(quizStreakResult);
      setCachedBadgeData({
        badges: badgesResult,
        readingStreak: streakResult,
        quizStreak: quizStreakResult,
      });
    } catch {
      // If cached data is already shown, fail silently
    } finally {
      if (!cancelled.current && !silent) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.BADGES);
      const cancelled = { current: false };
      const cached = getCachedBadgeData();

      if (cached) {
        setBadges(cached.badges);
        setStreak(cached.readingStreak);
        setQuizStreakCount(cached.quizStreak);
        setLoading(false);
        // Refresh silently in background
        fetchBadgeData(cancelled, true);
      } else {
        setLoading(true);
        const task = InteractionManager.runAfterInteractions(() => {
          fetchBadgeData(cancelled, false);
        });
        return () => {
          cancelled.current = true;
          task.cancel();
        };
      }

      return () => {
        cancelled.current = true;
      };
    }, [fetchBadgeData])
  );

  const sortByProgress = (a: BadgeWithStatus, b: BadgeWithStatus) => {
    const progressScore = (badge: BadgeWithStatus) => {
      const earned = badge.earnedStars.length;
      const fraction =
        badge.nextThreshold && badge.nextThreshold > 0
          ? Math.min(badge.currentProgress / badge.nextThreshold, 1)
          : 0;
      return earned + fraction;
    };
    return progressScore(b) - progressScore(a);
  };

  const readingBadges = badges
    .filter((b) => b.definition.category === 'reading')
    .sort(sortByProgress);
  const quizBadges = badges.filter((b) => b.definition.category === 'quiz').sort(sortByProgress);
  const readingEarned = readingBadges.reduce((s, b) => s + b.earnedStars.length, 0);
  const quizEarned = quizBadges.reduce((s, b) => s + b.earnedStars.length, 0);
  const totalEarned = readingEarned + quizEarned;

  const handleBadgePress = (badge: BadgeWithStatus) => {
    trackBadgeDetailView({
      badgeId: badge.definition.id,
      category: badge.definition.category,
      earnedStars: badge.earnedStars.length,
    });
    setSelectedBadge(badge);
    setDetailVisible(true);
  };

  const renderBadgeList = (items: BadgeWithStatus[]) => (
    <YStack gap={spacing.sm}>
      {items.map((badge) => (
        <BadgeCard key={badge.definition.id} badge={badge} onPress={() => handleBadgePress(badge)} />
      ))}
    </YStack>
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <XStack
        paddingTop={spacing.sm}
        paddingBottom={spacing.md}
        paddingHorizontal={spacing.lg}
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <BackButton onPress={() => router.back()} primaryColor={colors.primary} />

        <Text.Title color={colors.text}>{t('achievements')}</Text.Title>

        {/* Empty spacer to balance the header */}
        <View style={{ width: media.topicCardSize * 0.45, height: media.topicCardSize * 0.45 }} />
      </XStack>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
      >
        {loading ? (
          <BadgesScreenSkeleton />
        ) : (
          <ContentContainer>
            {/* Streak panel */}
            <XStack
              backgroundColor={colors.cardBackground}
              borderRadius={radius.lg}
              padding={spacing.md}
              marginBottom={spacing.lg}
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              {/* Current streak */}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                <View style={panelStyles.iconShadow}>
                  <View
                    style={{
                      width: iconSizes.hero,
                      height: iconSizes.hero,
                      borderRadius: iconSizes.hero / 2,
                      backgroundColor: streak > 0 ? '#FF6B3515' : `${colors.border}20`,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Flame size={iconSizes.lg} color={streak > 0 ? '#FF6B35' : colors.textMuted} />
                  </View>
                </View>
                <Text.Title
                  color={streak > 0 ? '#FF6B35' : colors.textMuted}
                  fontFamily={FONT_FAMILIES.bold}
                >
                  {streak}
                </Text.Title>
                <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                  {t('readingStreak')}
                </Text.Tiny>
              </YStack>

              {/* Divider */}
              <View
                style={{ width: 1, height: iconSizes.xl, backgroundColor: `${colors.border}60` }}
              />

              {/* Quiz streak */}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                <View style={panelStyles.iconShadow}>
                  <View
                    style={{
                      width: iconSizes.hero,
                      height: iconSizes.hero,
                      borderRadius: iconSizes.hero / 2,
                      backgroundColor: quizStreakCount > 0 ? '#8B5CF615' : `${colors.border}20`,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Gamepad2
                      size={iconSizes.lg}
                      color={quizStreakCount > 0 ? '#8B5CF6' : colors.textMuted}
                    />
                  </View>
                </View>
                <Text.Title
                  color={quizStreakCount > 0 ? '#8B5CF6' : colors.textMuted}
                  fontFamily={FONT_FAMILIES.bold}
                >
                  {quizStreakCount}
                </Text.Title>
                <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                  {t('quizStreak')}
                </Text.Tiny>
              </YStack>

              {/* Divider */}
              <View
                style={{ width: 1, height: iconSizes.xl, backgroundColor: `${colors.border}60` }}
              />

              {/* Total earned badges */}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                <View style={panelStyles.iconShadow}>
                  <View
                    style={{
                      width: iconSizes.hero,
                      height: iconSizes.hero,
                      borderRadius: iconSizes.hero / 2,
                      backgroundColor:
                        totalEarned > 0 ? `${colors.primary}15` : `${colors.border}20`,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Trophy
                      size={iconSizes.lg}
                      color={totalEarned > 0 ? colors.primary : colors.textMuted}
                    />
                  </View>
                </View>
                <Text.Title
                  color={totalEarned > 0 ? colors.primary : colors.textMuted}
                  fontFamily={FONT_FAMILIES.bold}
                >
                  {totalEarned}
                </Text.Title>
                <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                  {t('badgesEarned')}
                </Text.Tiny>
              </YStack>
            </XStack>

            {/* Reading Section */}
            {readingBadges.length > 0 && (
              <YStack marginBottom={spacing.xl}>
                <YStack marginBottom={spacing.md}>
                  <SectionLabel
                    icon={<BookOpen size={iconSizes.md} color={colors.primary} />}
                    label={t('badgeSectionReading')}
                    count={`${readingEarned}/${readingBadges.length * 3}`}
                  />
                </YStack>
                {renderBadgeList(readingBadges)}
              </YStack>
            )}

            {/* Quiz Section */}
            {quizBadges.length > 0 && (
              <YStack marginBottom={spacing.xl}>
                <YStack marginBottom={spacing.md}>
                  <SectionLabel
                    icon={<Gamepad2 size={iconSizes.md} color={colors.primary} />}
                    label={t('badgeSectionQuiz')}
                    count={`${quizEarned}/${quizBadges.length * 3}`}
                  />
                </YStack>
                {renderBadgeList(quizBadges)}
              </YStack>
            )}
          </ContentContainer>
        )}
      </ScrollView>

      <BadgeDetailSheet
        badge={selectedBadge}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
      />
    </View>
  );
}

const panelStyles = StyleSheet.create({
  iconShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
});
