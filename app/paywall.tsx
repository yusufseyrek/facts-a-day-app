import { type ReactNode,useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, type ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { CloseButton, GlassSurface, SuccessToast, Text } from '../src/components';
import {
  Ban,
  BookOpen,
  Check,
  Crown,
  Flame,
  Lightbulb,
  PartyPopper,
} from '../src/components/icons';
import { XStack, YStack } from '../src/components/Stacks';
import { FONT_FAMILIES } from '../src/components/Typography';
import { SUBSCRIPTION } from '../src/config/app';

const { PAYWALL_PRODUCT_IDS } = SUBSCRIPTION;
import { usePaywallPurchase } from '../src/hooks/usePaywallPurchase';
import { useTranslation } from '../src/i18n';
import { trackPaywallDismissed, trackPaywallViewed } from '../src/services/analytics';
import { getReadingStreak } from '../src/services/badges';
import { openDatabase } from '../src/services/database';
import { markPaywallShown } from '../src/services/paywallTiming';
import { hexColors, PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
import { openInAppBrowser } from '../src/utils/browser';
import { hexToRgba } from '../src/utils/colors';
import { useResponsive } from '../src/utils/useResponsive';

/**
 * Count of facts the user has touched (story views OR detail opens), unique by fact_id.
 * Used to anchor the paywall headline ("X facts read"). Returns 0 on any error.
 */
async function getReadCount(): Promise<number> {
  try {
    const db = await openDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(DISTINCT fact_id) as count
       FROM fact_interactions
       WHERE story_viewed_at IS NOT NULL OR detail_opened_at IS NOT NULL`
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/** Warm near-black used for every glyph/number ON the gold crest and the CTA
 *  label — ~9.8:1 on PAYWALL_GOLD.primary, tonally softer than pure #000. */
const CREST_INK = '#1A1A2E';

/**
 * The "crest" — the user's momentum is the hero. A small gold "PREMIUM" crown
 * kicker sits above oversized stat numerals (streak / facts-read), each lifted
 * by a gold-gradient icon disc (the app's lit signature) and split by a thin
 * divider. The numerals use the theme title color (AA-safe in both themes);
 * gold is reserved for the kicker and the small icon discs. New users (no
 * stats) see just the crown kicker — the headline below carries the value.
 */
function PaywallCrest({
  streak,
  factsRead,
  tc,
  isDark,
}: {
  streak: number;
  factsRead: number;
  tc: (typeof paywallThemeColors)[keyof typeof paywallThemeColors];
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const { spacing, iconSizes } = useResponsive();

  const discSize = iconSizes.xxl; // 40

  // Only non-zero stats render. Two → side-by-side with a divider; one → a
  // single centered column; new user → none (the headline carries it).
  const stats: { key: string; icon: ReactNode; value: number; label: string }[] = [];
  if (streak > 0) {
    stats.push({
      key: 'streak',
      icon: <Flame size={iconSizes.md} color="#78350F" fill="#78350F" />,
      value: streak,
      label: t('paywallStreakLabel'),
    });
  }
  if (factsRead > 0) {
    stats.push({
      key: 'facts',
      icon: <BookOpen size={iconSizes.md} color="#78350F" />,
      value: factsRead,
      label: t('paywallFactsReadLabel'),
    });
  }

  const a11yLabel =
    stats.length > 0
      ? `${t('paywallPremiumTag')}. ${stats.map((s) => `${s.value} ${s.label}`).join(', ')}`
      : t('paywallPremiumTag');

  const renderStat = (s: (typeof stats)[number]) => (
    <YStack key={s.key} alignItems="center" gap={spacing.xs}>
      <LinearGradient
        colors={[PAYWALL_GOLD.light, PAYWALL_GOLD.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          width: discSize,
          height: discSize,
          borderRadius: discSize / 2,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: PAYWALL_GOLD.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isDark ? 0.4 : 0.3,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        {s.icon}
      </LinearGradient>
      <Text.Display fontFamily={FONT_FAMILIES.extrabold} color={tc.title} letterSpacing={-1}>
        {s.value}
      </Text.Display>
      <Text.Tiny
        fontFamily={FONT_FAMILIES.bold}
        color={tc.featureDesc}
        letterSpacing={0.8}
        numberOfLines={1}
      >
        {s.label}
      </Text.Tiny>
    </YStack>
  );

  // New users have no stats → the crest renders nothing and the headline below
  // becomes the hero (no empty spacer left behind).
  if (stats.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(80).duration(400)}
      accessible
      accessibilityLabel={a11yLabel}
    >
      {/* Stats hero — oversized numerals, the emotional anchor. */}
      {stats.length === 2 ? (
        <XStack alignItems="center" alignSelf="stretch">
          <View style={{ flex: 1, alignItems: 'center' }}>{renderStat(stats[0])}</View>
          <View
            style={{
              width: 1,
              height: iconSizes.xxl,
              alignSelf: 'center',
              backgroundColor: tc.planBorder,
            }}
          />
          <View style={{ flex: 1, alignItems: 'center' }}>{renderStat(stats[1])}</View>
        </XStack>
      ) : (
        renderStat(stats[0])
      )}
    </Animated.View>
  );
}

export default function PaywallScreen() {
  const router = useRouter();
  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const source = sourceParam || 'settings';
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useTranslation();
  const { spacing, radius, iconSizes, media, borderWidths } = useResponsive();
  const tc = paywallThemeColors[theme];
  const isDark = theme === 'dark';

  // iOS 26 Liquid Glass: the paywall tiles/controls go transparent and a glass
  // material (tinted with the same token that used to be their fill) shows
  // through, matching the trivia cards / FactActions treatment. On Android,
  // iOS < 26 and reduce-transparency the GlassSurface is simply not mounted,
  // so the current opaque look is untouched.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  // GlassView tints must be LOW-alpha for the refraction to show through.
  // Dark-theme tokens are already low-alpha rgba (pass through); light-theme
  // fills are opaque hex (#FFFFFF) and get softened here.
  const glassTintOf = (color: string) => (color.startsWith('#') ? hexToRgba(color, 0.65) : color);
  const {
    isPremium,
    selectedPlan,
    selectPlan,
    isPurchasing,
    isRestoring,
    handlePurchase,
    handleRestore,
    getDisplayPrice,
    monthlySavingsPercent,
    monthlyPerWeekDisplay,
  } = usePaywallPurchase(source);

  // Personal stats — drive both the streak/facts-read tiles and the headline copy
  // (returning vs. new user). null = still loading; show neither tiles nor "on a roll" copy.
  const [streak, setStreak] = useState<number | null>(null);
  const [factsRead, setFactsRead] = useState<number | null>(null);

  useEffect(() => {
    trackPaywallViewed(source);
    markPaywallShown();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getReadingStreak(), getReadCount()]).then(([s, f]) => {
      if (cancelled) return;
      setStreak(s);
      setFactsRead(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The paywall opens with the offer (plans + CTA) in focus rather than the
  // emotional opener. Until the user drags, we keep the view pinned to the
  // bottom so the prices/buttons stay framed as the stats load in and grow the
  // content. On screens where everything fits, scrollToEnd is a no-op — the
  // flex-spacer layout is unchanged. animated:false so it's already at rest
  // under the entering fade, with no visible jump.
  const scrollRef = useRef<ScrollView>(null);
  const userScrolled = useRef(false);
  const pinToBottom = () => {
    if (!userScrolled.current) scrollRef.current?.scrollToEnd({ animated: false });
  };

  const [showPremiumToast, setShowPremiumToast] = useState(false);

  useEffect(() => {
    if (isPremium) {
      setShowPremiumToast(true);
    }
  }, [isPremium]);

  const handleClose = () => {
    trackPaywallDismissed(source);
    router.back();
  };

  const handleTermsPress = async () => {
    try {
      await openInAppBrowser(`https://factsaday.com/${locale}/terms`, { theme });
    } catch (error) {
      console.error('Error opening terms:', error);
    }
  };

  const handlePrivacyPress = async () => {
    try {
      await openInAppBrowser(`https://factsaday.com/${locale}/privacy`, { theme });
    } catch (error) {
      console.error('Error opening privacy policy:', error);
    }
  };

  const showStats = (streak ?? 0) > 0 || (factsRead ?? 0) > 0;

  // Derived responsive sizes
  // CloseButton's diameter — the wordmark row reserves space so it never
  // underlaps the floating close.
  const closeBtnSize = iconSizes.xl + spacing.md;
  const wordmarkCrownSize = iconSizes.xs + 2;
  const benefitIconCircleSize = iconSizes.xl + spacing.md;
  const benefitIconCircleRadius = benefitIconCircleSize / 2;

  /* eslint-disable react-native/no-unused-styles -- styles used via dynamicStyles.* */
  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: tc.containerBg,
        },
        ambientGlow: {
          position: 'absolute',
          top: -spacing.xxl - spacing.lg,
          left: 0,
          right: 0,
          height: 380,
        },
        closeButton: {
          position: 'absolute',
          right: spacing.xl,
          top: Platform.OS === 'ios' ? spacing.xxl : insets.top,
          zIndex: 10,
        },
        scrollContent: {
          flexGrow: 1,
          // Top-aligned: the stats/headline/benefits sit just under the wordmark
          // and the offer (plans + CTA + footer) is anchored to the bottom by a
          // flex spacer, so the slack falls into ONE comfortable middle gap
          // rather than a large margin above the stats.
          paddingBottom: spacing.md,
          paddingTop: spacing.xs,
        },
        centerGroup: {
          gap: spacing.lg,
        },
        wordmarkRow: {
          paddingHorizontal: spacing.xl,
          paddingRight: spacing.xxxl + closeBtnSize,
          paddingTop: Platform.OS === 'ios' ? spacing.xxl + spacing.xl : insets.top + spacing.lg,
          marginBottom: spacing.lg,
        },
        wordmarkDivider: {
          width: 1,
          height: spacing.md,
          backgroundColor: tc.planBorder,
          marginHorizontal: spacing.sm,
        },
        hairline: {
          height: borderWidths.thin,
          marginHorizontal: spacing.xl,
          marginVertical: spacing.lg,
          overflow: 'hidden',
        },
        headlineWrap: {
          marginHorizontal: spacing.xl,
        },
        headlineAccentText: {
          color: PAYWALL_GOLD.primary,
          textShadowColor: isDark ? 'rgba(255,184,0,0.35)' : 'transparent',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: isDark ? 24 : 0,
        },
        benefitCard: {
          backgroundColor: useGlass ? 'transparent' : tc.featureBg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          paddingVertical: spacing.md + 2,
          paddingHorizontal: spacing.md + 2,
          ...(useGlass && { overflow: 'hidden' as const }),
        },
        benefitIcon: {
          width: benefitIconCircleSize,
          height: benefitIconCircleSize,
          borderRadius: benefitIconCircleRadius,
          backgroundColor: tc.featureIconBg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        planCard: {
          flex: 1,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radius.lg,
          borderWidth: borderWidths.thin,
          borderColor: useGlass ? 'transparent' : tc.planBorder,
          backgroundColor: useGlass ? 'transparent' : tc.planBg,
          minHeight: media.buttonHeight + spacing.lg,
          // NO overflow:'hidden' here — the SAVE badge hangs over the top edge.
          // The glass layer rounds itself via its borderRadius prop instead.
        },
        planCardSelected: {
          borderColor: tc.planSelectedBorder,
          backgroundColor: useGlass ? 'transparent' : tc.planSelectedBg,
          // iOS-only soft glow. Android `elevation` renders an opaque drop-shadow
          // that looks like a thick inner shadow on the translucent gold fill.
          // Skipped under glass: a shadow on a transparent-bg view casts from
          // child pixels, not the native glass material, and renders artifacts —
          // the gold border + gold glass tint carry the selection emphasis there.
          ...(!useGlass &&
            Platform.select({
              ios: {
                shadowColor: PAYWALL_GOLD.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: isDark ? 0.18 : 0.12,
                shadowRadius: 24,
              },
            })),
        },
        savingsBadge: {
          position: 'absolute',
          top: -spacing.sm - 2,
          right: spacing.md,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.sm - 2,
          overflow: 'hidden',
        },
        ctaButton: {
          borderRadius: radius.xl + spacing.xs,
          overflow: 'hidden' as const,
          shadowColor: PAYWALL_GOLD.primary,
          shadowOffset: { width: 0, height: spacing.sm - borderWidths.medium },
          shadowOpacity: isDark ? 0.45 : 0.3,
          shadowRadius: spacing.lg,
          elevation: 10,
        },
        ctaButtonDisabled: {
          opacity: 0.5,
        },
        ctaButtonPressed: {
          opacity: 0.85,
          transform: [{ scale: 0.98 }],
        },
        ctaGradient: {
          height: media.buttonHeight,
          alignItems: 'center',
          justifyContent: 'center',
        },
        footerLink: {
          alignItems: 'center',
          paddingVertical: spacing.sm,
        },
        planPressable: {
          flex: 1,
        },
      }),
    [
      tc,
      isDark,
      useGlass,
      spacing,
      radius,
      iconSizes,
      media,
      insets,
      borderWidths,
      closeBtnSize,
      benefitIconCircleSize,
      benefitIconCircleRadius,
    ]
  );
  /* eslint-enable react-native/no-unused-styles */

  const benefits = [
    {
      icon: <Ban size={iconSizes.md} color={PAYWALL_GOLD.primary} />,
      title: t('paywallFeatureNoAds'),
      description: t('paywallFeatureNoAdsDesc'),
    },
    {
      icon: <Lightbulb size={iconSizes.md} color={PAYWALL_GOLD.primary} />,
      title: t('paywallFeatureHints'),
      description: t('paywallFeatureHintsDesc'),
    },
  ];

  return (
    <View style={dynamicStyles.container}>
      <StatusBar style={tc.statusBar} />
      <SuccessToast
        visible={showPremiumToast}
        message={t('premiumActivated')}
        icon={<PartyPopper size={iconSizes.xl} color={hexColors[theme].success} />}
        onHide={() => {
          setShowPremiumToast(false);
          router.back();
        }}
      />

      {/* Full-screen gradient background */}
      <LinearGradient colors={[...tc.bg]} style={StyleSheet.absoluteFill} />

      {/* Ambient golden glow */}
      <View style={dynamicStyles.ambientGlow}>
        <LinearGradient colors={[...tc.ambientGlow]} style={StyleSheet.absoluteFill} />
      </View>

      {/* Close button */}
      <CloseButton onPress={handleClose} style={dynamicStyles.closeButton} />

      {/* Group 1 — Wordmark, pinned at the top */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <XStack alignItems="center" gap={spacing.xs + 4} style={dynamicStyles.wordmarkRow}>
          <Crown
            size={wordmarkCrownSize}
            color={PAYWALL_GOLD.primary}
            fill={PAYWALL_GOLD.primary}
          />
          <Text.Label color={tc.title}>{t('appName')}</Text.Label>
          <View style={dynamicStyles.wordmarkDivider} />
          <Text.Tiny
            fontFamily={FONT_FAMILIES.extrabold}
            color={PAYWALL_GOLD.primary}
            letterSpacing={1.6}
          >
            {t('paywallPremiumTag')}
          </Text.Tiny>
        </XStack>
      </Animated.View>

      {/* Groups 2 & 3 — center group fills the leftover area between title and the
          bottom group; the bottom group (benefits + plans + CTA + footer) anchors to
          the bottom. When content overflows the viewport, everything scrolls naturally. */}
      <Animated.ScrollView
        ref={scrollRef}
        entering={FadeIn.duration(300)}
        contentContainerStyle={dynamicStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={pinToBottom}
        onScrollBeginDrag={() => {
          userScrolled.current = true;
        }}
      >
        {/* Vertical slack is split top:middle:bottom = 3:3:3 — the stats get a
            bit more top margin (1/3 of the slack) while the features↔price gap
            and the bottom margin stay equal to each other, so it reads balanced. */}
        <View style={{ flex: 3 }} />

        {/* Group 2 — Crest + headline (the emotional opener) */}
        <View style={dynamicStyles.centerGroup}>
          <PaywallCrest streak={streak ?? 0} factsRead={factsRead ?? 0} tc={tc} isDark={isDark} />

          {/* Headline + subtitle */}
          <Animated.View entering={FadeInDown.delay(140).duration(400)}>
            <YStack gap={spacing.sm} style={dynamicStyles.headlineWrap}>
              <Text.Headline
                fontFamily={FONT_FAMILIES.extrabold}
                letterSpacing={-0.5}
                color={tc.title}
              >
                {showStats ? t('paywallHubHeadline') : t('paywallHubHeadlineNew')}
                {'\n'}
                <Text.Headline
                  fontFamily={FONT_FAMILIES.extrabold}
                  letterSpacing={-0.5}
                  style={dynamicStyles.headlineAccentText}
                >
                  {showStats ? t('paywallHubHeadlineAccent') : t('paywallHubHeadlineNewAccent')}
                </Text.Headline>
              </Text.Headline>
              <Text.Caption color={tc.subtitle}>
                {showStats ? t('paywallHubSubtitle') : t('paywallHubSubtitleNew')}
              </Text.Caption>
            </YStack>
          </Animated.View>
        </View>

        {/* Gold hairline — the single structural divider between the emotional
            opener (crest + headline) and the rational benefit proof. */}
        <Animated.View entering={FadeIn.delay(180)} style={dynamicStyles.hairline} pointerEvents="none">
          <LinearGradient
            colors={['transparent', hexToRgba(PAYWALL_GOLD.primary, 0.5), 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Group 3 — Benefits + plans + CTA + footer, anchored to the bottom */}
        <YStack gap={spacing.md} marginHorizontal={spacing.xl} marginBottom={spacing.xl}>
          {benefits.map((b, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(200 + i * 70).duration(400)}>
              <View style={dynamicStyles.benefitCard}>
                {useGlass && (
                  <GlassSurface
                    variant="glass"
                    isDark={isDark}
                    tint={tc.featureBg}
                    glassTint={glassTintOf(tc.featureBg)}
                    borderRadius={radius.lg}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <XStack alignItems="center" gap={spacing.md}>
                  <View style={dynamicStyles.benefitIcon}>{b.icon}</View>
                  <YStack flex={1} gap={2}>
                    <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle}>
                      {b.title}
                    </Text.Body>
                    <Text.Caption color={tc.featureDesc}>{b.description}</Text.Caption>
                  </YStack>
                  <Check size={iconSizes.sm} color={tc.featureDesc} strokeWidth={2.4} />
                </XStack>
              </View>
            </Animated.View>
          ))}
        </YStack>

        {/* Features↔price gap — 1/3 of the slack (matches the bottom spacer). */}
        <View style={{ flex: 3, minHeight: spacing.md }} />

        {/* Plans — compact, left-aligned. Crown inline on Monthly, SAVE badge top-right */}
        <Animated.View entering={FadeInDown.delay(420).duration(400)}>
          <XStack gap={spacing.sm + 2} marginHorizontal={spacing.xl} marginBottom={spacing.lg}>
            {PAYWALL_PRODUCT_IDS.map((productId) => {
              const selected = selectedPlan === productId;
              const monthly = productId.includes('monthly');
              const weekly = productId.includes('weekly');

              return (
                <Pressable
                  key={productId}
                  onPress={() => selectPlan(productId)}
                  style={dynamicStyles.planPressable}
                >
                  <View
                    style={[dynamicStyles.planCard, selected && dynamicStyles.planCardSelected]}
                  >
                    {useGlass && (
                      <GlassSurface
                        variant="glass"
                        isDark={isDark}
                        tint={selected ? tc.planSelectedBg : tc.planBg}
                        glassTint={glassTintOf(selected ? tc.planSelectedBg : tc.planBg)}
                        isInteractive
                        borderRadius={radius.lg}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    {monthly && (
                      <View style={dynamicStyles.savingsBadge}>
                        <LinearGradient
                          colors={[PAYWALL_GOLD.badge, PAYWALL_GOLD.dark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <Text.Tiny
                          color={CREST_INK}
                          fontFamily={FONT_FAMILIES.extrabold}
                          letterSpacing={0.5}
                        >
                          {monthlySavingsPercent
                            ? t('paywallSavePercent', { percent: monthlySavingsPercent })
                            : t('paywallBestValue')}
                        </Text.Tiny>
                      </View>
                    )}

                    <XStack alignItems="center" gap={spacing.xs + 2} marginBottom={spacing.xs}>
                      {monthly && (
                        <Crown
                          size={iconSizes.xs - 2}
                          color={selected ? tc.planSelectedTitle : tc.planPeriod}
                          fill={selected ? tc.planSelectedTitle : tc.planPeriod}
                        />
                      )}
                      <Text.Tiny
                        fontFamily={FONT_FAMILIES.extrabold}
                        letterSpacing={0.8}
                        color={selected && monthly ? tc.planSelectedTitle : tc.planPeriod}
                      >
                        {weekly ? t('paywallWeekly') : t('paywallMonthly')}
                      </Text.Tiny>
                    </XStack>

                    <Text.Title
                      fontFamily={FONT_FAMILIES.extrabold}
                      letterSpacing={-0.5}
                      color={tc.planPrice}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {getDisplayPrice(productId)}
                    </Text.Title>

                    {weekly && (
                      <Text.Tiny color={tc.cancelText} marginTop={2}>
                        {t('paywallPerWeek').replace(/^\//, '')}
                      </Text.Tiny>
                    )}

                    {monthly && (
                      <Text.Tiny
                        color={selected ? tc.planSelectedTitle : tc.planPeriod}
                        fontFamily={FONT_FAMILIES.semibold}
                        marginTop={2}
                      >
                        {monthlyPerWeekDisplay
                          ? t('paywallPerWeekValue', { price: monthlyPerWeekDisplay })
                          : t('paywallPerMonth').replace(/^\//, '')}
                      </Text.Tiny>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </XStack>
        </Animated.View>

        {/* CTA + Footer */}
        <Animated.View entering={FadeInUp.delay(500).duration(400)}>
          <YStack gap={spacing.sm} marginHorizontal={spacing.xl} paddingBottom={spacing.lg}>
            <Pressable
              onPress={handlePurchase}
              disabled={(!selectedPlan && !__DEV__) || isPurchasing}
              style={({ pressed }) => [
                dynamicStyles.ctaButton,
                ((!selectedPlan && !__DEV__) || isPurchasing) && dynamicStyles.ctaButtonDisabled,
                pressed && dynamicStyles.ctaButtonPressed,
              ]}
            >
              <LinearGradient
                colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={dynamicStyles.ctaGradient}
              >
                {isPurchasing ? (
                  <ActivityIndicator size="small" color="#1A1A2E" />
                ) : (
                  <Text.Body fontFamily={FONT_FAMILIES.extrabold} color="#1A1A2E">
                    {t('paywallStartPremium')}
                  </Text.Body>
                )}
              </LinearGradient>
            </Pressable>

            <YStack alignItems="center" gap={2}>
              <Text.Caption color={tc.cancelText}>{t('paywallCancelAnytime')}</Text.Caption>
              <XStack flexWrap="wrap" justifyContent="center" alignItems="center">
                <Text.Caption color={tc.legalText}>{t('paywallLegalAgree')} </Text.Caption>
                <Pressable onPress={handleTermsPress} hitSlop={spacing.xs}>
                  <Text.Caption color={tc.legalText} textDecorationLine="underline">
                    {t('paywallTerms')}
                  </Text.Caption>
                </Pressable>
                <Text.Caption color={tc.legalText}> {t('paywallLegalAnd')} </Text.Caption>
                <Pressable onPress={handlePrivacyPress} hitSlop={spacing.xs}>
                  <Text.Caption color={tc.legalText} textDecorationLine="underline">
                    {t('paywallPrivacy')}
                  </Text.Caption>
                </Pressable>
              </XStack>
            </YStack>

            <Pressable
              onPress={handleRestore}
              disabled={isRestoring}
              hitSlop={spacing.md}
              style={dynamicStyles.footerLink}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={tc.restoreLoader} />
              ) : (
                <Text.Label color={tc.restoreText}>{t('paywallRestore')}</Text.Label>
              )}
            </Pressable>
          </YStack>
        </Animated.View>

        {/* Bottom spacer — 1/3 of the slack, matching the features↔price gap so
            the offer floats off the very bottom rather than hugging it. */}
        <View style={{ flex: 3, minHeight: spacing.md }} />
      </Animated.ScrollView>
    </View>
  );
}
