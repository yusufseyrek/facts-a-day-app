import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ContentContainer } from '../../../src/components';
import { AvatarDisc } from '../../../src/components/AvatarDisc';
import { BadgeIcon } from '../../../src/components/badges/BadgeIcon';
import { StarRating } from '../../../src/components/badges/StarRating';
import { Award, Flame, Gamepad2, Target, Trophy } from '../../../src/components/icons';
import { XStack, YStack } from '../../../src/components/Stacks';
import { FONT_FAMILIES, Text } from '../../../src/components/Typography';
import { BADGE_DEFINITIONS } from '../../../src/config/badges';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { getEarnedBadges } from '../../../src/services/badges';
import { useTabBarBannerInset } from '../../../src/services/tabBarBannerInset';
import * as userService from '../../../src/services/user';
import { hexColors, useTheme } from '../../../src/theme';
import { avatarColor, darkenColor, getContrastColor } from '../../../src/utils/colors';
import { countryFlagEmoji } from '../../../src/utils/countryFlag';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { TriviaProfileResponse, TriviaProfileStats } from '../../../src/services/api';

/**
 * Public/own trivia profile. Everything visible here is server-computed from
 * submitted results, so any claimed screen name resolves — including your own.
 * Badges for OTHER players are derived from the server aggregates through the
 * same thresholds the local badge system uses (BADGE_DEFINITIONS); your own
 * profile shows the locally-earned stars instead (they include master_scholar,
 * which needs per-question attempt history that never syncs).
 */

/** Server aggregate feeding each quiz badge (public profiles). master_scholar
 * is deliberately absent — no server analogue. */
const PUBLIC_BADGE_METRICS: Record<string, (s: TriviaProfileStats) => number> = {
  quiz_starter: (s) => s.games,
  sharp_mind: (s) => s.correct,
  perfectionist: (s) => s.perfect_games,
  quick_thinker: (s) => s.quick_games,
  category_ace: (s) => s.ace_categories,
  endurance: (s) => s.answered,
  streak_champion: (s) => s.best_streak,
};

/** Stars a metric value earns for a badge (0-3), by its config thresholds. */
function earnedStarsFor(badgeId: string, value: number): number {
  const def = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  if (!def) return 0;
  return def.stars.filter((s) => value >= s.threshold).length;
}

function formatScore(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function TriviaProfileScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ name?: string }>();
  const isDark = theme === 'dark';
  const { spacing, radius, iconSizes, borderWidths, media, typography, config } = useResponsive();
  const bannerInset = useTabBarBannerInset();
  const colors = hexColors[theme];

  const screenName = (params.name ?? '').trim();

  const [profile, setProfile] = useState<TriviaProfileResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSelf, setIsSelf] = useState(false);
  // Own profile: locally-earned stars per quiz badge (includes master_scholar).
  const [localStars, setLocalStars] = useState<Map<string, number> | null>(null);
  const [categoryMeta, setCategoryMeta] = useState<
    Map<string, { name: string; icon: string | null; color_hex: string | null }>
  >(new Map());

  useEffect(() => {
    trackScreenView(Screens.TRIVIA_PROFILE);
  }, []);

  const load = useCallback(async () => {
    if (!screenName) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const [data, identity] = await Promise.all([
        api.getTriviaProfile(screenName),
        userService.getProfile().catch(() => null),
      ]);
      setProfile(data);
      const self =
        !!identity && identity.screenName.toLowerCase() === data.screen_name.toLowerCase();
      setIsSelf(self);

      if (self) {
        const earned = await getEarnedBadges().catch(() => []);
        const stars = new Map<string, number>();
        for (const e of earned) {
          stars.set(e.badge_id, (stars.get(e.badge_id) ?? 0) + 1);
        }
        setLocalStars(stars);
      } else {
        setLocalStars(null);
      }

      // Localized names/icons for the top-category slugs (cached metadata).
      if (data.top_categories.length > 0) {
        const metadata = await api.getMetadata(locale).catch(() => null);
        if (metadata) {
          setCategoryMeta(
            new Map(
              metadata.categories.map((c) => [
                c.slug,
                { name: c.name, icon: c.icon ?? null, color_hex: c.color_hex ?? null },
              ])
            )
          );
        }
      }
    } catch (error) {
      if ((error as { status?: number })?.status === 404) {
        setNotFound(true);
      } else {
        console.error('Error loading trivia profile:', error);
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [screenName, locale]);

  useEffect(() => {
    load();
  }, [load]);

  // Retitle the native header with the player's handle once known.
  useEffect(() => {
    navigation.setOptions({
      title: profile ? profile.screen_name : t('playerProfile'),
    });
  }, [navigation, profile, t]);

  const accent = avatarColor(profile?.screen_name || screenName || '?', colors);
  const contrastColor = getContrastColor(accent);
  const plateBg = contrastColor === '#000000' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
  const discSize = media.topicCardSize * 0.72;

  // Quiz badges to display: public = the server-derivable subset; self = all.
  const quizBadges = useMemo(() => {
    const all = BADGE_DEFINITIONS.filter((b) => b.category === 'quiz');
    if (isSelf) return all;
    return all.filter((b) => PUBLIC_BADGE_METRICS[b.id] !== undefined);
  }, [isSelf]);

  const starsForBadge = useCallback(
    (badgeId: string): number => {
      if (isSelf && localStars) return localStars.get(badgeId) ?? 0;
      if (!profile) return 0;
      const metric = PUBLIC_BADGE_METRICS[badgeId];
      return metric ? earnedStarsFor(badgeId, metric(profile.stats)) : 0;
    },
    [isSelf, localStars, profile]
  );

  const windowRows: { key: 'today' | 'week' | 'all'; label: string }[] = [
    { key: 'today', label: t('today') },
    { key: 'week', label: t('leaderboardWeek') },
    { key: 'all', label: t('leaderboardAllTime') },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={colors.primary} />
        </YStack>
      </View>
    );
  }

  if (notFound || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center" gap={spacing.md}>
          <Trophy size={iconSizes.hero} color={colors.textMuted} opacity={0.5} />
          <Text.Label color="$textMuted">{t('profileNotFound')}</Text.Label>
        </YStack>
      </View>
    );
  }

  const { stats } = profile;
  const flag = countryFlagEmoji(profile.country_code);

  const overviewRows = [
    {
      icon: <Target size={iconSizes.xs} color={colors.primary} />,
      color: colors.primary,
      label: t('accuracy'),
      value: `${stats.accuracy}%`,
      micro: `${formatScore(stats.correct)} / ${formatScore(stats.answered)}`,
    },
    {
      icon: <Gamepad2 size={iconSizes.xs} color={colors.neonPurple} />,
      color: colors.neonPurple,
      label: t('quizzes'),
      value: formatScore(stats.games),
      micro: null,
    },
    {
      icon: <Award size={iconSizes.xs} color={colors.warning} />,
      color: colors.warning,
      label: t('perfectGames'),
      value: formatScore(stats.perfect_games),
      micro: null,
    },
    {
      icon: <Flame size={iconSizes.xs} color={colors.neonOrange} />,
      color: colors.neonOrange,
      label: t('dayStreak'),
      value: String(stats.current_streak),
      micro: t('best', { count: stats.best_streak }),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: bannerInset + spacing.xl }}
      >
        <ContentContainer>
          <YStack marginVertical={spacing.lg} gap={spacing.xl}>
            {/* Identity hero — the player's accent hue in the trivia gradient
                signature. */}
            <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
              <View style={[profileShadow.card, { borderRadius: radius.xl, shadowColor: accent }]}>
                <LinearGradient
                  colors={[accent, darkenColor(accent, 0.22)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: radius.xl, overflow: 'hidden' }}
                >
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -discSize * 0.7,
                      right: -discSize * 0.5,
                      width: discSize * 2,
                      height: discSize * 2,
                      borderRadius: discSize,
                      backgroundColor:
                        contrastColor === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)',
                    }}
                  />
                  <YStack padding={spacing.xl} alignItems="center" gap={spacing.md}>
                    <AvatarDisc
                      name={profile.screen_name}
                      avatar={profile.avatar}
                      color={accent}
                      size={discSize}
                      borderColor={plateBg}
                    />
                    <YStack alignItems="center" gap={2}>
                      <XStack alignItems="center" gap={spacing.xs}>
                        <Text.Title
                          color={contrastColor}
                          fontFamily={FONT_FAMILIES.bold}
                          numberOfLines={1}
                        >
                          {`${flag ? `${flag} ` : ''}${profile.screen_name}`}
                        </Text.Title>
                      </XStack>
                      <Text.Caption color={contrastColor} opacity={0.8}>
                        {t('memberSince', { date: profile.member_since })}
                      </Text.Caption>
                      {isSelf && (
                        <XStack
                          marginTop={spacing.xs}
                          paddingHorizontal={spacing.sm}
                          paddingVertical={2}
                          borderRadius={radius.full}
                          backgroundColor={plateBg}
                        >
                          <Text.Tiny
                            color={contrastColor}
                            fontFamily={FONT_FAMILIES.semibold}
                          >
                            {t('leaderboardYou')}
                          </Text.Tiny>
                        </XStack>
                      )}
                    </YStack>
                  </YStack>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Lifetime overview */}
            <Animated.View entering={FadeIn.delay(100).duration(400).springify()}>
              <View style={[profileShadow.card, { borderRadius: radius.lg }]}>
                <YStack
                  backgroundColor={colors.cardBackground}
                  borderRadius={radius.lg}
                  padding={spacing.lg}
                  gap={spacing.md}
                >
                  {overviewRows.map((row, index) => (
                    <XStack key={index} alignItems="center" gap={spacing.sm}>
                      <YStack
                        width={iconSizes.xl}
                        height={iconSizes.xl}
                        borderRadius={radius.sm}
                        backgroundColor={`${row.color}20`}
                        justifyContent="center"
                        alignItems="center"
                      >
                        {row.icon}
                      </YStack>
                      <Text.Label
                        flex={1}
                        color={colors.text}
                        fontFamily={FONT_FAMILIES.medium}
                        numberOfLines={1}
                      >
                        {row.label}
                      </Text.Label>
                      <YStack alignItems="flex-end">
                        <Text.Label color={colors.text} fontFamily={FONT_FAMILIES.bold}>
                          {row.value}
                        </Text.Label>
                        {row.micro ? (
                          <Text.Caption
                            color={colors.textMuted}
                            fontSize={typography.fontSize.tiny}
                          >
                            {row.micro}
                          </Text.Caption>
                        ) : null}
                      </YStack>
                    </XStack>
                  ))}
                </YStack>
              </View>
            </Animated.View>

            {/* Standing per leaderboard window */}
            <Animated.View entering={FadeIn.delay(150).duration(400).springify()}>
              <YStack gap={spacing.md}>
                <Text.Title color={colors.text}>{t('leaderboard')}</Text.Title>
                <View style={[profileShadow.card, { borderRadius: radius.lg }]}>
                  <YStack
                    backgroundColor={colors.cardBackground}
                    borderRadius={radius.lg}
                    paddingVertical={spacing.xs}
                  >
                    {windowRows.map(({ key, label }, index) => {
                      const standing = profile.windows[key];
                      return (
                        <React.Fragment key={key}>
                          {index > 0 && (
                            <View
                              style={{
                                height: borderWidths.hairline,
                                backgroundColor: colors.border,
                                marginHorizontal: spacing.md,
                              }}
                            />
                          )}
                          <XStack
                            alignItems="center"
                            gap={spacing.sm}
                            paddingVertical={spacing.sm}
                            paddingHorizontal={spacing.md}
                          >
                            <Trophy
                              size={iconSizes.sm}
                              color={standing ? colors.warning : colors.textMuted}
                              opacity={standing ? 1 : 0.5}
                            />
                            <Text.Label
                              flex={1}
                              color={colors.text}
                              fontFamily={FONT_FAMILIES.medium}
                            >
                              {label}
                            </Text.Label>
                            {standing ? (
                              <YStack alignItems="flex-end">
                                <Text.Label
                                  color={colors.text}
                                  fontFamily={FONT_FAMILIES.bold}
                                >
                                  {`#${standing.rank}`}
                                </Text.Label>
                                <Text.Caption
                                  color={colors.textMuted}
                                  fontSize={typography.fontSize.tiny}
                                >
                                  {`${formatScore(standing.score)} / ${formatScore(standing.total_questions)}`}
                                </Text.Caption>
                              </YStack>
                            ) : (
                              <Text.Label color={colors.textMuted}>—</Text.Label>
                            )}
                          </XStack>
                        </React.Fragment>
                      );
                    })}
                  </YStack>
                </View>
              </YStack>
            </Animated.View>

            {/* Most-played categories */}
            {profile.top_categories.length > 0 && (
              <Animated.View entering={FadeIn.delay(200).duration(400).springify()}>
                <YStack gap={spacing.md}>
                  <Text.Title color={colors.text}>{t('profileTopCategories')}</Text.Title>
                  <View style={[profileShadow.card, { borderRadius: radius.lg }]}>
                    <YStack
                      backgroundColor={colors.cardBackground}
                      borderRadius={radius.lg}
                      padding={spacing.lg}
                      gap={spacing.md}
                    >
                      {profile.top_categories.map((cat) => {
                        const meta = categoryMeta.get(cat.category_slug);
                        const catColor = meta?.color_hex || colors.primary;
                        const accuracy =
                          cat.answered > 0
                            ? Math.round((cat.correct / cat.answered) * 100)
                            : 0;
                        return (
                          <XStack key={cat.category_slug} alignItems="center" gap={spacing.sm}>
                            <YStack
                              width={iconSizes.xl}
                              height={iconSizes.xl}
                              borderRadius={radius.sm}
                              backgroundColor={`${catColor}20`}
                              justifyContent="center"
                              alignItems="center"
                            >
                              {getLucideIcon(meta?.icon ?? undefined, iconSizes.xs, catColor)}
                            </YStack>
                            <YStack flex={1}>
                              <Text.Label
                                color={colors.text}
                                fontFamily={FONT_FAMILIES.medium}
                                numberOfLines={1}
                              >
                                {meta?.name ?? cat.category_slug}
                              </Text.Label>
                              <Text.Caption color={colors.textMuted}>
                                {t('leaderboardGamesCount', { count: String(cat.games) })}
                              </Text.Caption>
                            </YStack>
                            <Text.Label color={catColor} fontFamily={FONT_FAMILIES.bold}>
                              {`${accuracy}%`}
                            </Text.Label>
                          </XStack>
                        );
                      })}
                    </YStack>
                  </View>
                </YStack>
              </Animated.View>
            )}

            {/* Quiz achievements */}
            <Animated.View entering={FadeIn.delay(250).duration(400).springify()}>
              <YStack gap={spacing.md}>
                <Text.Title color={colors.text}>{t('achievements')}</Text.Title>
                <View style={[profileShadow.card, { borderRadius: radius.lg }]}>
                  <YStack
                    backgroundColor={colors.cardBackground}
                    borderRadius={radius.lg}
                    padding={spacing.lg}
                  >
                    <XStack flexWrap="wrap" justifyContent="space-between" rowGap={spacing.lg}>
                      {quizBadges.map((badge) => {
                        const stars = starsForBadge(badge.id);
                        return (
                          <YStack
                            key={badge.id}
                            alignItems="center"
                            gap={spacing.xs}
                            width={`${Math.floor(100 / Math.min(4, config.triviaCategoriesPerRow * 2)) - 2}%`}
                          >
                            <BadgeIcon
                              badgeId={badge.id}
                              size={iconSizes.xxl}
                              isUnlocked={stars > 0}
                            />
                            <StarRating earnedCount={stars} size={typography.fontSize.tiny} />
                          </YStack>
                        );
                      })}
                    </XStack>
                  </YStack>
                </View>
              </YStack>
            </Animated.View>
          </YStack>
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

const profileShadow = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
