import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Ban,
  BookOpen,
  Check,
  Crown,
  Flame,
  Lightbulb,
  PartyPopper,
  WifiOff,
  X,
} from '@tamagui/lucide-icons';
import { ErrorCode, useIAP } from 'expo-iap';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { SuccessToast, Text } from '../src/components';
import { FONT_FAMILIES } from '../src/components/Typography';
import { SUBSCRIPTION } from '../src/config/app';

const { PAYWALL_PRODUCT_IDS } = SUBSCRIPTION;
import { usePremium } from '../src/contexts';
import { useTranslation } from '../src/i18n';
import { trackPaywallDismissed, trackPaywallViewed } from '../src/services/analytics';
import { getReadingStreak } from '../src/services/badges';
import { openDatabase } from '../src/services/database';
import { markPaywallShown } from '../src/services/paywallTiming';
import { hexColors, PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
import { openInAppBrowser } from '../src/utils/browser';
import { useResponsive } from '../src/utils/useResponsive';

const WEEKS_PER_MONTH = 52 / 12;

/**
 * Wrapper around useIAP that suppresses init connection failures.
 * During onboarding or on simulators, IAP is unavailable — this prevents crashes.
 */
function useSafeIAP() {
  const iap = useIAP({
    onError: (error) => {
      if (__DEV__) console.warn('IAP error (non-fatal):', error.message);
    },
  });
  return iap;
}

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

/**
 * Format a numeric per-week value back into the same currency shape as the source price.
 * "$4.99" + 1.15 → "$1.15"; "14,99 €" + 3.46 → "3,46 €"; "￥1,580" + 365 → "￥365".
 */
function formatPriceLike(sourceDisplay: string, value: number): string {
  const numericMatch = sourceDisplay.match(/[\d.,]+/);
  if (!numericMatch) return value.toFixed(2);
  const numeric = numericMatch[0];
  const startsWith = sourceDisplay.slice(0, numericMatch.index);
  const endsWith = sourceDisplay.slice((numericMatch.index ?? 0) + numeric.length);

  const usesCommaDecimal = /^[\d.]*,\d{1,2}$/.test(numeric);
  const fixed = value.toFixed(2);
  const formatted = usesCommaDecimal ? fixed.replace('.', ',') : fixed;
  return `${startsWith}${formatted}${endsWith}`;
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
  const { isPremium, subscriptions, cachedPrices, restorePurchases, devSetPremium } = usePremium();
  const { requestPurchase } = useSafeIAP();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

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

  useEffect(() => {
    if (selectedPlan) return;
    if (subscriptions.length > 0) {
      const monthly = subscriptions.find((s) => s.id.includes('monthly'));
      setSelectedPlan(monthly?.id || subscriptions[0].id);
    } else if (cachedPrices.length > 0) {
      const monthly = cachedPrices.find((c) => c.id.includes('monthly'));
      setSelectedPlan(monthly?.id || cachedPrices[0].id);
    }
  }, [subscriptions, cachedPrices, selectedPlan]);

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

  const handlePurchase = async () => {
    if (isPurchasing) return;

    // In dev mode, skip real IAP and just activate premium
    if (__DEV__) {
      setIsPurchasing(true);
      try {
        await devSetPremium(true);
      } finally {
        setIsPurchasing(false);
      }
      return;
    }

    if (!selectedPlan) return;

    setIsPurchasing(true);
    try {
      const sub = subscriptions.find((s) => s.id === selectedPlan);
      if (!sub) return;

      const offerToken =
        Platform.OS === 'android' && sub.subscriptionOffers?.[0]?.offerTokenAndroid
          ? sub.subscriptionOffers[0].offerTokenAndroid
          : '';

      await requestPurchase({
        request: {
          apple: { sku: selectedPlan, andDangerouslyFinishTransactionAutomatically: false },
          google: {
            skus: [selectedPlan],
            subscriptionOffers: [{ sku: selectedPlan, offerToken: offerToken || '' }],
          },
        },
        type: 'subs',
      });
    } catch (error: any) {
      if (error?.code !== ErrorCode.UserCancelled) {
        console.error('Purchase error:', error);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const restored = await restorePurchases();
      if (!restored) {
        if (__DEV__) console.log('No active subscription found to restore');
      }
    } catch (error) {
      console.error('Restore error:', error);
    } finally {
      setIsRestoring(false);
    }
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

  const getDisplayPrice = (productId: string): string => {
    const sub = subscriptions.find((s) => s.id === productId);
    if (sub?.displayPrice) return sub.displayPrice;
    const cached = cachedPrices.find((c) => c.id === productId);
    return cached?.displayPrice || '---';
  };

  /**
   * Parse a localized price string like "$14.99", "14,99 €", "￥1,580" into a number.
   * Handles both comma-decimal (14,99) and comma-thousand (1,580.00) formats.
   */
  const parseDisplayPrice = (displayPrice: string): number | null => {
    const digits = displayPrice.replace(/[^\d.,]/g, '');
    // If last separator is a comma with ≤2 digits after it, treat comma as decimal
    const commaDecimal = digits.match(/^([\d.]*),(\d{1,2})$/);
    if (commaDecimal) {
      const parsed = parseFloat(commaDecimal[1].replace(/\./g, '') + '.' + commaDecimal[2]);
      return isNaN(parsed) ? null : parsed;
    }
    // Otherwise treat dots/commas as thousand separators except the last dot
    const parsed = parseFloat(digits.replace(/,/g, ''));
    return isNaN(parsed) ? null : parsed;
  };

  /**
   * Get numeric price for a product from live subscriptions or cached prices.
   * Checks sub.price, subscriptionOffers, then parses displayPrice as fallback.
   */
  const getNumericPrice = (productId: string): number | null => {
    const sub = subscriptions.find((s) => s.id === productId);
    if (sub) {
      if (sub.price != null) return sub.price;
      const offerPrice = sub.subscriptionOffers?.[0]?.price;
      if (offerPrice != null) return offerPrice;
      return parseDisplayPrice(sub.displayPrice);
    }
    const cached = cachedPrices.find((c) => c.id === productId);
    if (cached) {
      if (cached.price != null) return cached.price;
      return parseDisplayPrice(cached.displayPrice);
    }
    return null;
  };

  /**
   * Dynamically calculate monthly savings percentage compared to weekly.
   * Weekly price x ~4.3 weeks vs monthly price.
   * Returns null if prices are unavailable.
   */
  const monthlySavingsPercent = useMemo(() => {
    const weeklyPrice = getNumericPrice('factsaday_premium_weekly');
    const monthlyPrice = getNumericPrice('factsaday_premium_monthly');
    if (weeklyPrice == null || monthlyPrice == null || weeklyPrice <= 0) return null;
    const monthlyAtWeeklyRate = weeklyPrice * WEEKS_PER_MONTH;
    const savings = Math.round(((monthlyAtWeeklyRate - monthlyPrice) / monthlyAtWeeklyRate) * 100);
    return savings > 0 ? savings : null;
  }, [subscriptions, cachedPrices]);

  /**
   * Effective per-week price for the monthly plan: monthly / 4.33 in source currency shape.
   * Renders "$1.15 / week" style sub-line to make the value visceral.
   */
  const monthlyPerWeekDisplay = useMemo(() => {
    const monthlyPrice = getNumericPrice('factsaday_premium_monthly');
    const monthlyDisplay = getDisplayPrice('factsaday_premium_monthly');
    if (monthlyPrice == null || monthlyDisplay === '---') return null;
    const perWeek = monthlyPrice / WEEKS_PER_MONTH;
    return formatPriceLike(monthlyDisplay, perWeek);
  }, [subscriptions, cachedPrices]);

  const showStats = (streak ?? 0) > 0 || (factsRead ?? 0) > 0;

  // Derived responsive sizes
  const closeBtnSize = iconSizes.lg + spacing.sm;
  const closeBtnRadius = closeBtnSize / 2;
  const wordmarkCrownSize = iconSizes.xs + 2;
  const statIconCircleSize = iconSizes.xxl;
  const statIconCircleRadius = statIconCircleSize / 2;
  const benefitIconCircleSize = iconSizes.xl + spacing.xs;
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
        closeButtonInner: {
          width: closeBtnSize,
          height: closeBtnSize,
          borderRadius: closeBtnRadius,
          backgroundColor: tc.closeBtn,
          alignItems: 'center',
          justifyContent: 'center',
        },
        scrollContent: {
          flexGrow: 1,
          paddingBottom: spacing.md,
          paddingTop: spacing.md,
        },
        centerGroup: {
          flex: 1,
          justifyContent: 'space-around',
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
        statsRow: {
          marginHorizontal: spacing.xl,
          marginBottom: spacing.xl,
        },
        statCard: {
          flex: 1,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
        },
        statStreakCard: {
          backgroundColor: tc.featureBg,
          borderColor: tc.featureBorder,
        },
        statNeutralCard: {
          backgroundColor: tc.planBg,
          borderColor: tc.planBorder,
        },
        statStreakIcon: {
          width: statIconCircleSize,
          height: statIconCircleSize,
          borderRadius: statIconCircleRadius,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: PAYWALL_GOLD.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isDark ? 0.4 : 0.3,
          shadowRadius: 12,
          elevation: 6,
        },
        statNeutralIcon: {
          width: statIconCircleSize,
          height: statIconCircleSize,
          borderRadius: statIconCircleRadius,
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          borderWidth: 1,
          borderColor: tc.planBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headlineWrap: {
          marginHorizontal: spacing.xl,
          marginBottom: spacing.xxl,
        },
        headlineAccentText: {
          color: PAYWALL_GOLD.primary,
          textShadowColor: isDark ? 'rgba(255,184,0,0.35)' : 'transparent',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: isDark ? 24 : 0,
        },
        benefitCard: {
          backgroundColor: tc.featureBg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
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
          borderColor: tc.planBorder,
          backgroundColor: tc.planBg,
          minHeight: media.buttonHeight + spacing.lg,
        },
        planCardSelected: {
          borderColor: tc.planSelectedBorder,
          backgroundColor: tc.planSelectedBg,
          // iOS-only soft glow. Android `elevation` renders an opaque drop-shadow
          // that looks like a thick inner shadow on the translucent gold fill.
          ...Platform.select({
            ios: {
              shadowColor: PAYWALL_GOLD.primary,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: isDark ? 0.18 : 0.12,
              shadowRadius: 24,
            },
          }),
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
      spacing,
      radius,
      iconSizes,
      media,
      insets,
      borderWidths,
      closeBtnSize,
      closeBtnRadius,
      statIconCircleSize,
      statIconCircleRadius,
      benefitIconCircleSize,
      benefitIconCircleRadius,
    ]
  );
  /* eslint-enable react-native/no-unused-styles */

  const benefits = [
    {
      icon: <Ban size={iconSizes.sm} color={PAYWALL_GOLD.primary} />,
      title: t('paywallFeatureNoAds'),
      description: t('paywallFeatureNoAdsDesc'),
    },
    {
      icon: <WifiOff size={iconSizes.sm} color={PAYWALL_GOLD.primary} />,
      title: t('paywallFeatureOfflineSupport'),
      description: t('paywallFeatureOfflineCombinedDesc'),
    },
    {
      icon: <Lightbulb size={iconSizes.sm} color={PAYWALL_GOLD.primary} />,
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
      <Pressable onPress={handleClose} hitSlop={spacing.lg} style={dynamicStyles.closeButton}>
        <View style={dynamicStyles.closeButtonInner}>
          <X size={iconSizes.sm} color={tc.closeIcon} />
        </View>
      </Pressable>

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
        entering={FadeIn.duration(300)}
        contentContainerStyle={dynamicStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Group 2 — Stats + headline, vertically centered in the leftover area */}
        <View style={dynamicStyles.centerGroup}>
          {showStats && (
            <Animated.View entering={FadeInDown.delay(80).duration(400)}>
              <XStack gap={spacing.sm + 2} style={dynamicStyles.statsRow}>
                <View style={[dynamicStyles.statCard, dynamicStyles.statStreakCard]}>
                  <XStack alignItems="center" gap={spacing.sm + 3}>
                    <LinearGradient
                      colors={[PAYWALL_GOLD.light, PAYWALL_GOLD.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={dynamicStyles.statStreakIcon}
                    >
                      <Flame size={iconSizes.md} color="#78350F" fill="#78350F" />
                    </LinearGradient>
                    <YStack>
                      <Text
                        fontFamily={FONT_FAMILIES.extrabold}
                        fontSize={24}
                        lineHeight={26}
                        letterSpacing={-0.5}
                        color={tc.title}
                      >
                        {streak ?? 0}
                      </Text>
                      <Text.Tiny
                        fontFamily={FONT_FAMILIES.bold}
                        color={tc.featureDesc}
                        letterSpacing={0.6}
                        marginTop={spacing.xs}
                      >
                        {t('paywallStreakLabel')}
                      </Text.Tiny>
                    </YStack>
                  </XStack>
                </View>

                <View style={[dynamicStyles.statCard, dynamicStyles.statNeutralCard]}>
                  <XStack alignItems="center" gap={spacing.sm + 3}>
                    <View style={dynamicStyles.statNeutralIcon}>
                      <BookOpen size={iconSizes.sm} color={tc.featureDesc} />
                    </View>
                    <YStack>
                      <Text
                        fontFamily={FONT_FAMILIES.extrabold}
                        fontSize={24}
                        lineHeight={26}
                        letterSpacing={-0.5}
                        color={tc.title}
                      >
                        {factsRead ?? 0}
                      </Text>
                      <Text.Tiny
                        fontFamily={FONT_FAMILIES.bold}
                        color={tc.featureDesc}
                        letterSpacing={0.6}
                        marginTop={spacing.xs}
                      >
                        {t('paywallFactsReadLabel')}
                      </Text.Tiny>
                    </YStack>
                  </XStack>
                </View>
              </XStack>
            </Animated.View>
          )}

          {/* Headline + subtitle */}
          <Animated.View entering={FadeInDown.delay(140).duration(400)}>
            <YStack gap={spacing.sm} style={dynamicStyles.headlineWrap}>
              <Text
                fontFamily={FONT_FAMILIES.extrabold}
                fontSize={28}
                lineHeight={32}
                letterSpacing={-0.5}
                color={tc.title}
              >
                {showStats ? t('paywallHubHeadline') : t('paywallHubHeadlineNew')}
                {'\n'}
                <Text
                  fontFamily={FONT_FAMILIES.extrabold}
                  fontSize={28}
                  lineHeight={32}
                  letterSpacing={-0.5}
                  style={dynamicStyles.headlineAccentText}
                >
                  {showStats ? t('paywallHubHeadlineAccent') : t('paywallHubHeadlineNewAccent')}
                </Text>
              </Text>
              <Text.Caption color={tc.subtitle}>
                {showStats ? t('paywallHubSubtitle') : t('paywallHubSubtitleNew')}
              </Text.Caption>
            </YStack>
          </Animated.View>
        </View>

        {/* Group 3 — Benefits + plans + CTA + footer, anchored to the bottom */}
        <YStack gap={spacing.sm} marginHorizontal={spacing.xl} marginBottom={spacing.xl}>
          {benefits.map((b, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(200 + i * 70).duration(400)}>
              <View style={dynamicStyles.benefitCard}>
                <XStack alignItems="center" gap={spacing.md}>
                  <View style={dynamicStyles.benefitIcon}>{b.icon}</View>
                  <YStack flex={1} gap={1}>
                    <Text.Label color={tc.featureTitle}>{b.title}</Text.Label>
                    <Text.Caption color={tc.featureDesc}>{b.description}</Text.Caption>
                  </YStack>
                  <Check size={iconSizes.xs - 2} color={tc.featureDesc} strokeWidth={2.4} />
                </XStack>
              </View>
            </Animated.View>
          ))}
        </YStack>

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
                  onPress={() => setSelectedPlan(productId)}
                  style={dynamicStyles.planPressable}
                >
                  <View
                    style={[dynamicStyles.planCard, selected && dynamicStyles.planCardSelected]}
                  >
                    {monthly && (
                      <View style={dynamicStyles.savingsBadge}>
                        <LinearGradient
                          colors={[PAYWALL_GOLD.badge, PAYWALL_GOLD.dark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <Text.Tiny
                          color="#FFFFFF"
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

                    <Text
                      fontFamily={FONT_FAMILIES.extrabold}
                      fontSize={22}
                      lineHeight={26}
                      letterSpacing={-0.5}
                      color={tc.planPrice}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {getDisplayPrice(productId)}
                    </Text>

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
      </Animated.ScrollView>
    </View>
  );
}
