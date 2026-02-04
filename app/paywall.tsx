import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

import { Ban, Check, Crown, Infinity, Lightbulb, Sparkles, X } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorCode, useIAP } from 'expo-iap';
import { XStack, YStack } from 'tamagui';

import { Text } from '../src/components';
import { FONT_FAMILIES } from '../src/components/Typography';
import { SUBSCRIPTION } from '../src/config/app';
import { usePremium } from '../src/contexts';
import { useTranslation } from '../src/i18n';
import { trackPaywallDismissed, trackPaywallViewed } from '../src/services/analytics';
import { PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
import { openInAppBrowser } from '../src/utils/browser';
import { useResponsive } from '../src/utils/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PaywallScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useTranslation();
  const { spacing, radius, iconSizes, media, borderWidths } = useResponsive();
  const tc = paywallThemeColors[theme];
  const { isPremium, subscriptions, restorePurchases } = usePremium();
  const { requestPurchase } = useIAP();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    trackPaywallViewed('settings');
  }, []);

  useEffect(() => {
    if (subscriptions.length > 0 && !selectedPlan) {
      const monthly = subscriptions.find((s) => s.id.includes('monthly'));
      setSelectedPlan(monthly?.id || subscriptions[0].id);
    }
  }, [subscriptions, selectedPlan]);

  useEffect(() => {
    if (isPremium) {
      router.back();
    }
  }, [isPremium, router]);

  const handleClose = () => {
    trackPaywallDismissed('settings');
    router.back();
  };

  const handlePurchase = async () => {
    if (isPurchasing || !selectedPlan) return;

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
        console.log('No active subscription found to restore');
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
    return sub?.displayPrice || '---';
  };

  const isWeekly = (productId: string) => productId.includes('weekly');
  const isMonthly = (productId: string) => productId.includes('monthly');

  // Derived responsive sizes
  const closeBtnSize = iconSizes.lg + spacing.sm;
  const closeBtnRadius = closeBtnSize / 2;
  const crownCircleSize = iconSizes.heroLg + radius.md;
  const crownCircleRadius = crownCircleSize / 2;
  const crownGlowSize = crownCircleSize + spacing.xxl + spacing.xs;
  const crownGlowRadius = crownGlowSize / 2;
  const featureIconSize = iconSizes.xl + spacing.sm;
  const featureIconRadius = featureIconSize / 2;
  const checkCircleSize = iconSizes.md;
  const checkCircleRadius = checkCircleSize / 2;

  const featureIconColor = '#78350F'; // Dark amber for better contrast on gold gradients

  const features = [
    {
      icon: <Ban size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeatureNoAds'),
      description: t('paywallFeatureNoAdsDesc'),
      gradient: [PAYWALL_GOLD.dark, PAYWALL_GOLD.primary] as const,
    },
    {
      icon: <Infinity size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeatureUnlimitedCategories'),
      description: t('paywallFeatureUnlimitedCategoriesDesc'),
      gradient: [PAYWALL_GOLD.primary, PAYWALL_GOLD.light] as const,
    },
    {
      icon: <Lightbulb size={iconSizes.md} color={featureIconColor} />,
      title: t('paywallFeatureHints'),
      description: t('paywallFeatureHintsDesc'),
      gradient: ['#FF8C00', PAYWALL_GOLD.badge] as const,
    },
  ];

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
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        featureGlow: {
          position: 'absolute',
          top: -spacing.xs,
          left: -spacing.xs,
          right: -spacing.xs,
          bottom: -spacing.xs,
          borderRadius: radius.lg + spacing.xs,
          opacity: 0.15,
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
          minHeight: 185,
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

  return (
    <View style={dynamicStyles.container}>
      <StatusBar style={tc.statusBar} />

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
          <YStack alignItems="center" gap={spacing.sm} marginBottom={spacing.lg}>
            <View style={dynamicStyles.crownContainer}>
              <View style={dynamicStyles.crownGlowRing} />
              <LinearGradient
                colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={dynamicStyles.crownCircle}
              >
                <Crown size={iconSizes.hero - spacing.sm} color="#FFFFFF" fill="#FFFFFF" />
              </LinearGradient>
            </View>

            <Text.Display textAlign="center" color={tc.title}>
              {t('paywallTitle')}
            </Text.Display>
            <Text.Body textAlign="center" color={tc.subtitle}>
              {t('paywallSubtitle')}
            </Text.Body>
          </YStack>
        </Animated.View>

        {/* Features */}
        <YStack gap={spacing.md} marginBottom={spacing.xl} marginHorizontal={spacing.lg}>
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
            {SUBSCRIPTION.PRODUCT_IDS.map((productId) => {
              const selected = selectedPlan === productId;
              const monthly = isMonthly(productId);
              const weekly = isWeekly(productId);

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
                      <View style={dynamicStyles.bestValueBadge}>
                        <LinearGradient
                          colors={[PAYWALL_GOLD.badge, PAYWALL_GOLD.dark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={dynamicStyles.bestValueGradient}
                        >
                          <Text.Tiny color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                            {t('paywallBestValue')}
                          </Text.Tiny>
                        </LinearGradient>
                      </View>
                    )}

                    {/* Plan Icon */}
                    <View style={dynamicStyles.planIconContainer}>
                      {monthly ? (
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
                        {weekly ? t('paywallWeekly') : t('paywallMonthly')}
                      </Text.Label>
                    </View>

                    {/* Price */}
                    <Text.Display color={tc.planPrice}>{getDisplayPrice(productId)}</Text.Display>

                    {/* Period */}
                    <Text.Caption color={tc.planPeriod}>
                      {weekly ? t('paywallPerWeek') : t('paywallPerMonth')}
                    </Text.Caption>

                    {/* Savings Badge for Monthly / Flexible Badge for Weekly */}
                    <View
                      style={[dynamicStyles.savingsBadge, !monthly && dynamicStyles.flexibleBadge]}
                    >
                      <Text.Tiny
                        color={monthly ? PAYWALL_GOLD.badge : tc.planPeriod}
                        fontFamily={FONT_FAMILIES.semibold}
                      >
                        {monthly ? t('paywallSavePercent') : t('paywallFlexible')}
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
              disabled={!selectedPlan || isPurchasing}
              style={({ pressed }) => [
                dynamicStyles.ctaButton,
                (!selectedPlan || isPurchasing) && dynamicStyles.ctaButtonDisabled,
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
