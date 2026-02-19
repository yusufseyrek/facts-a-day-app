import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ArrowLeft, BookOpen, Crown, Flame, Gamepad2, Trophy } from '@tamagui/lucide-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { BadgeCard } from '../src/components/badges/BadgeCard';
import { BadgeDetailSheet } from '../src/components/badges/BadgeDetailSheet';
import { ContentContainer, ScreenContainer } from '../src/components/ScreenLayout';
import { FONT_FAMILIES, Text } from '../src/components/Typography';
import { useTranslation } from '../src/i18n';
import {
  type BadgeWithStatus,
  getAllBadgesWithStatus,
  getBestReadingStreak,
  getReadingStreak,
} from '../src/services/badges';
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
    <XStack alignItems="center" justifyContent="space-between">
      <XStack alignItems="center" gap={spacing.sm}>
        {icon}
        <Text.Headline color={colors.text}>{label}</Text.Headline>
      </XStack>
      <Text.Body color={colors.textSecondary} fontFamily={FONT_FAMILIES.semibold}>
        {count}
      </Text.Body>
    </XStack>
  );
}

export default function BadgesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getAllBadgesWithStatus()
        .then(setBadges)
        .catch(() => {});
      getReadingStreak()
        .then(setStreak)
        .catch(() => {});
      getBestReadingStreak()
        .then(setBestStreak)
        .catch(() => {});
    }, [])
  );

  const readingBadges = badges.filter((b) => b.definition.category === 'reading');
  const quizBadges = badges.filter((b) => b.definition.category === 'quiz');
  const readingEarned = readingBadges.reduce((s, b) => s + b.earnedTiers.length, 0);
  const quizEarned = quizBadges.reduce((s, b) => s + b.earnedTiers.length, 0);

  const handleBadgePress = (badge: BadgeWithStatus) => {
    setSelectedBadge(badge);
    setDetailVisible(true);
  };

  const renderBadgeList = (items: BadgeWithStatus[], sectionIndex: number) => (
    <YStack gap={spacing.sm}>
      {items.map((badge, index) => (
        <Animated.View
          key={badge.definition.id}
          entering={FadeInDown.delay((sectionIndex * 4 + index) * 40).duration(300)}
        >
          <BadgeCard badge={badge} onPress={() => handleBadgePress(badge)} />
        </Animated.View>
      ))}
    </YStack>
  );

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <Animated.View entering={FadeIn.duration(300)}>
        <XStack
          padding={spacing.lg}
          paddingBottom={spacing.md}
          alignItems="center"
          gap={spacing.sm}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <ArrowLeft size={iconSizes.lg} color={colors.text} />
          </Pressable>
          <Trophy size={iconSizes.lg} color={colors.primary} />
          <Text.Headline flex={1}>{t('achievements')}</Text.Headline>
        </XStack>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      >
        <ContentContainer>
          {/* Streak panel */}
          <Animated.View entering={FadeInDown.delay(50).duration(300)}>
            <XStack
              backgroundColor={colors.cardBackground}
              borderRadius={radius.lg}
              padding={spacing.md}
              marginBottom={spacing.lg}
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
              gap={spacing.md}
            >
              {/* Current streak */}
              <XStack flex={1} alignItems="center" justifyContent="center" gap={spacing.sm}>
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
                <YStack gap={spacing.xs}>
                  <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                    {t('currentStreak')}
                  </Text.Tiny>
                  <XStack alignItems="baseline" gap={spacing.xs}>
                    <Text.Title
                      color={streak > 0 ? '#FF6B35' : colors.textMuted}
                      fontFamily={FONT_FAMILIES.bold}
                    >
                      {streak}
                    </Text.Title>
                    <Text.Caption color={colors.textMuted}>
                      {t('dayStreak').toLowerCase()}
                    </Text.Caption>
                  </XStack>
                </YStack>
              </XStack>

              {/* Divider */}
              <View style={{ width: 1, height: iconSizes.xl, backgroundColor: `${colors.border}60` }} />

              {/* Best streak */}
              <XStack flex={1} alignItems="center" justifyContent="center" gap={spacing.sm}>
                <View
                  style={{
                    width: iconSizes.hero,
                    height: iconSizes.hero,
                    borderRadius: iconSizes.hero / 2,
                    backgroundColor: bestStreak > 0 ? '#FFD70015' : `${colors.border}20`,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Crown
                    size={iconSizes.lg}
                    color={bestStreak > 0 ? '#FFD700' : colors.textMuted}
                  />
                </View>
                <YStack gap={spacing.xs}>
                  <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                    {t('bestStreak')}
                  </Text.Tiny>
                  <XStack alignItems="baseline" gap={spacing.xs}>
                    <Text.Title
                      color={bestStreak > 0 ? colors.text : colors.textMuted}
                      fontFamily={FONT_FAMILIES.bold}
                    >
                      {bestStreak}
                    </Text.Title>
                    <Text.Caption color={colors.textMuted}>
                      {t('dayStreak').toLowerCase()}
                    </Text.Caption>
                  </XStack>
                </YStack>
              </XStack>
            </XStack>
          </Animated.View>

          {/* Reading Section */}
          {readingBadges.length > 0 && (
            <YStack marginBottom={spacing.xl}>
              <Animated.View entering={FadeInDown.delay(100).duration(300)}>
                <YStack marginBottom={spacing.md}>
                  <SectionLabel
                    icon={<BookOpen size={iconSizes.sm} color={colors.primary} />}
                    label={t('badgeSectionReading')}
                    count={`${readingEarned}/${readingBadges.length * 3}`}
                  />
                </YStack>
              </Animated.View>
              {renderBadgeList(readingBadges, 0)}
            </YStack>
          )}

          {/* Quiz Section */}
          {quizBadges.length > 0 && (
            <YStack marginBottom={spacing.xl}>
              <Animated.View entering={FadeInDown.delay(200).duration(300)}>
                <YStack marginBottom={spacing.md}>
                  <SectionLabel
                    icon={<Gamepad2 size={iconSizes.sm} color={colors.primary} />}
                    label={t('badgeSectionQuiz')}
                    count={`${quizEarned}/${quizBadges.length * 3}`}
                  />
                </YStack>
              </Animated.View>
              {renderBadgeList(quizBadges, 1)}
            </YStack>
          )}
        </ContentContainer>
      </ScrollView>

      <BadgeDetailSheet
        badge={selectedBadge}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
      />
    </ScreenContainer>
  );
}
