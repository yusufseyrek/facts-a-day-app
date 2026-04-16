import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Ban,
  Check,
  Crown,
  Lightbulb,
  Lock,
  PartyPopper,
  Sparkles,
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
import { getPremiumCategorySlugs } from '../src/services/database';
import { markPaywallShown } from '../src/services/paywallTiming';
import { hexColors, PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
import { openInAppBrowser } from '../src/utils/browser';
import { useResponsive } from '../src/utils/useResponsive';

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

export default function PaywallScreen() {
  const router = useRouter();
  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const source = sourceParam || 'settings';
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useTranslation();
  const { spacing, radius, iconSizes, media, borderWidths } = useResponsive();
  const tc = paywallThemeColors[theme];
  const { isPremium, subscriptions, cachedPrices, restorePurchases, devSetPremium } = usePremium();
  const { requestPurchase } = useSafeIAP();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [premiumCategoryCount, setPremiumCategoryCount] = useState(0);

  useEffect(() => {
    trackPaywallViewed(source);
    markPaywallShown();
    getPremiumCategorySlugs()
      .then((slugs) => setPremiumCategoryCount(slugs.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedPlan) return;
    if (subscriptions.length > 0) {
      const annual = subscriptions.find((s) => s.id.includes('annual'));
      setSelectedPlan(annual?.id || subscriptions[0].id);
    } else if (cachedPrices.length > 0) {
      const annual = cachedPrices.find((c) => c.id.includes('annual'));
      setSelectedPlan(annual?.id || cachedPrices[0].id);
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

  const isAnnual = (productId: string) => productId.includes('annual');

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
   * Dynamically calculate annual savings percentage compared to monthly.
   * Returns null if prices are unavailable.
   */
  const annualSavingsPercent = useMemo(() => {
    const monthlyPrice = getNumericPrice('factsaday_premium_monthly');
    const annualPrice = getNumericPrice('factsaday_premium_annually');
    if (monthlyPrice == null || annualPrice == null || monthlyPrice <= 0) return null;
    const yearlyAtMonthlyRate = monthlyPrice * 12;
    const savings = Math.round(((yearlyAtMonthlyRate - annualPrice) / yearlyAtMonthlyRate) * 100);
    return savings > 0 ? savings : null;
  }, [subscriptions, cachedPrices]);

  // Derived responsive sizes
  const closeBtnSize = iconSizes.lg + spacing.sm;
  const closeBtnRadius = closeBtnSize / 2;
  const crownCircleSize = iconSizes.hero;
  const crownCircleRadius = crownCircleSize / 2;
  const crownGlowSize = crownCircleSize + spacing.xl;
  const crownGlowRadius = crownGlowSize / 2;
  const checkCircleSize = iconSizes.md;
  const checkCircleRadius = checkCircleSize / 2;

  const featureIconColor = '#78350F';
  const featureIconSize = iconSizes.xl + spacing.sm;
  const featureIconRadius = featureIconSize / 2;

  const features = [
    {
      icon: <Lock size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeaturePremiumCategories'),
      description: t('paywallFeaturePremiumCategoriesDesc', { count: premiumCategoryCount }),
      gradient: [PAYWALL_GOLD.primary, PAYWALL_GOLD.light] as const,
    },
    {
      icon: <Ban size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeatureNoAds'),
      description: t('paywallFeatureNoAdsDesc'),
      gradient: [PAYWALL_GOLD.dark, PAYWALL_GOLD.primary] as const,
    },
{
      icon: <WifiOff size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeatureOfflineSupport'),
      description: t('paywallFeatureOfflineCombinedDesc'),
      gradient: [PAYWALL_GOLD.dark, PAYWALL_GOLD.badge] as const,
    },
    {
      icon: <Lightbulb size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeatureHints'),
      description: t('paywallFeatureHintsDesc'),
      gradient: ['#FF8C00', PAYWALL_GOLD.badge] as const,
    },
  ];

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
          paddingBottom: spacing.md,
          paddingTop: Platform.OS === 'ios' ? spacing.xl * 2 : insets.top + spacing.xl,
        },
        crownContainer: {
          width: crownCircleSize + radius.md,
          height: crownCircleSize + radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        crownGlowRing: {
          position: 'absolute',
          width: crownGlowSize,
          height: crownGlowSize,
          borderRadius: crownGlowRadius,
          backgroundColor: tc.crownGlow,
        },
        crownCircle: {
          width: crownCircleSize,
          height: crownCircleSize,
          borderRadius: crownCircleRadius,
          alignItems: 'center',
          justifyContent: 'center',
        },
        featureIcon: {
          width: featureIconSize,
          height: featureIconSize,
          borderRadius: featureIconRadius,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: PAYWALL_GOLD.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        },
        featureCard: {
          backgroundColor: tc.featureBg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        planCard: {
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.lg + borderWidths.medium,
          borderWidth: borderWidths.medium,
          borderColor: tc.planBorder,
          backgroundColor: tc.planBg,
          gap: 2,
        },
        planCardSelected: {
          borderColor: tc.planSelectedBorder,
          backgroundColor: tc.planSelectedBg,
        },
        planIconContainer: {
          width: iconSizes.xl + spacing.xs,
          height: iconSizes.xl + spacing.xs,
          borderRadius: (iconSizes.xl + spacing.xs) / 2,
          backgroundColor: tc.featureIconBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        },
        planTitle: {
          marginBottom: 2,
        },
        savingsBadge: {
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.sm,
          backgroundColor: tc.savingsBadgeBg,
          marginTop: 2,
        },
        flexibleBadge: {
          backgroundColor: tc.planBorder,
        },
        bestValueBadge: {
          position: 'absolute',
          top: -radius.md,
          alignSelf: 'center',
          zIndex: 1,
        },
        bestValueGradient: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs + borderWidths.hairline,
          borderRadius: radius.md,
        },
        checkCircle: {
          width: checkCircleSize,
          height: checkCircleSize,
          borderRadius: checkCircleRadius,
          borderWidth: borderWidths.medium,
          borderColor: tc.checkBorder,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: spacing.xs,
        },
        checkCircleSelected: {
          borderColor: PAYWALL_GOLD.primary,
          backgroundColor: PAYWALL_GOLD.primary,
        },
        ctaButton: {
          borderRadius: radius.xl + spacing.xs,
          overflow: 'hidden' as const,
          shadowColor: PAYWALL_GOLD.primary,
          shadowOffset: { width: 0, height: spacing.sm - borderWidths.medium },
          shadowOpacity: 0.45,
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
      spacing,
      radius,
      iconSizes,
      media,
      insets,
      borderWidths,
      closeBtnSize,
      closeBtnRadius,
      crownCircleSize,
      crownGlowSize,
      crownGlowRadius,
      crownCircleRadius,
      featureIconSize,
      featureIconRadius,
      checkCircleSize,
      checkCircleRadius,
    ]
  );
  /* eslint-enable react-native/no-unused-styles */

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

      {/* Ambient golden glow behind crown */}
      <View style={dynamicStyles.ambientGlow}>
        <LinearGradient colors={[...tc.ambientGlow]} style={StyleSheet.absoluteFill} />
      </View>

      {/* Close button */}
      <Pressable onPress={handleClose} hitSlop={spacing.lg} style={dynamicStyles.closeButton}>
        <View style={dynamicStyles.closeButtonInner}>
          <X size={iconSizes.sm} color={tc.closeIcon} />
        </View>
      </Pressable>

      {/* Content */}
      <Animated.ScrollView
        entering={FadeIn.duration(300)}
        contentContainerStyle={dynamicStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Crown + Title */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <YStack alignItems="center" gap={spacing.xs} marginBottom={spacing.md}>
            <View style={dynamicStyles.crownContainer}>
              <View style={dynamicStyles.crownGlowRing} />
              <LinearGradient
                colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={dynamicStyles.crownCircle}
              >
                <Crown size={iconSizes.lg} color="#FFFFFF" fill="#FFFFFF" />
              </LinearGradient>
            </View>

            <Text.Headline textAlign="center" color={tc.title}>
              {t('paywallTitle')}
            </Text.Headline>
            <Text.Caption textAlign="center" color={tc.subtitle}>
              {t('paywallSubtitle')}
            </Text.Caption>
          </YStack>
        </Animated.View>

        {/* Features */}
        <YStack gap={spacing.sm} marginBottom={spacing.lg} marginHorizontal={spacing.lg}>
          {features.map((feature, index) => (
            <Animated.View key={index} entering={FadeInDown.delay(120 + index * 80).duration(500)}>
              <View style={dynamicStyles.featureCard}>
                <XStack alignItems="center" gap={spacing.md}>
                  <LinearGradient
                    colors={[...feature.gradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={dynamicStyles.featureIcon}
                  >
                    {feature.icon}
                  </LinearGradient>
                  <YStack flex={1} gap={2}>
                    <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle}>
                      {feature.title}
                    </Text.Body>
                    <Text.Caption color={tc.featureDesc}>{feature.description}</Text.Caption>
                  </YStack>
                </XStack>
              </View>
            </Animated.View>
          ))}
        </YStack>

        {/* Plan selector */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)}>
          <XStack gap={spacing.sm} marginBottom={spacing.lg} marginHorizontal={spacing.lg}>
            {PAYWALL_PRODUCT_IDS.map((productId) => {
              const selected = selectedPlan === productId;
              const annual = isAnnual(productId);

              return (
                <Pressable
                  key={productId}
                  onPress={() => setSelectedPlan(productId)}
                  style={dynamicStyles.planPressable}
                >
                  <View
                    style={[dynamicStyles.planCard, selected && dynamicStyles.planCardSelected]}
                  >
                    {annual && (
                      <View style={dynamicStyles.bestValueBadge}>
                        <LinearGradient
                          colors={[PAYWALL_GOLD.badge, PAYWALL_GOLD.dark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={dynamicStyles.bestValueGradient}
                        >
                          <Text.Tiny color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                            {annualSavingsPercent
                              ? t('paywallSavePercent', { percent: annualSavingsPercent })
                              : t('paywallBestValue')}
                          </Text.Tiny>
                        </LinearGradient>
                      </View>
                    )}

                    {/* Plan Icon */}
                    <View style={dynamicStyles.planIconContainer}>
                      {annual ? (
                        <Crown
                          size={iconSizes.sm}
                          color={PAYWALL_GOLD.primary}
                          fill={PAYWALL_GOLD.primary}
                        />
                      ) : (
                        <Sparkles size={iconSizes.sm} color={PAYWALL_GOLD.primary} />
                      )}
                    </View>

                    {/* Plan Title */}
                    <View style={dynamicStyles.planTitle}>
                      <Text.Label
                        fontFamily={FONT_FAMILIES.semibold}
                        color={selected ? tc.planSelectedTitle : tc.planPeriod}
                      >
                        {annual ? t('paywallAnnual') : t('paywallMonthly')}
                      </Text.Label>
                    </View>

                    {/* Price */}
                    <Text.Display color={tc.planPrice} numberOfLines={1} adjustsFontSizeToFit>
                      {getDisplayPrice(productId)}
                    </Text.Display>

                    {/* Period */}
                    <Text.Caption
                      color={tc.planPeriod}
                      numberOfLines={1}
                      alignSelf="stretch"
                      textAlign="center"
                    >
                      {annual ? t('paywallPerYear') : t('paywallPerMonth')}
                    </Text.Caption>

                    {/* Flexible Badge for Monthly / Free Trial for Annual */}
                    <View
                      style={[dynamicStyles.savingsBadge, !annual && dynamicStyles.flexibleBadge]}
                    >
                      <Text.Tiny
                        color={annual ? PAYWALL_GOLD.badge : tc.planPeriod}
                        fontFamily={FONT_FAMILIES.semibold}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        {annual ? t('paywallFreeTrial') : t('paywallFlexible')}
                      </Text.Tiny>
                    </View>

                    {/* Check Circle */}
                    <View
                      style={[
                        dynamicStyles.checkCircle,
                        selected && dynamicStyles.checkCircleSelected,
                      ]}
                    >
                      {selected && (
                        <Check
                          size={iconSizes.xs - borderWidths.medium}
                          color="#FFFFFF"
                          strokeWidth={3}
                        />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </XStack>
        </Animated.View>

        {/* CTA + Footer */}
        <Animated.View entering={FadeInUp.delay(360).duration(500)}>
          <YStack gap={spacing.sm} marginHorizontal={spacing.lg} paddingBottom={spacing.lg}>
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
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text.Body fontFamily={FONT_FAMILIES.semibold} color="#000000">
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
