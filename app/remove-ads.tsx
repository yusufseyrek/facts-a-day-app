import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '../src/components';
import { Ban, Check, Crown, Lightbulb } from '../src/components/icons';
import { XStack, YStack } from '../src/components/Stacks';
import { FONT_FAMILIES } from '../src/components/Typography';
import { usePaywallPurchase } from '../src/hooks/usePaywallPurchase';
import { useTranslation } from '../src/i18n';
import { trackPaywallDismissed, trackPaywallViewed } from '../src/services/analytics';
import { PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
import { openInAppBrowser } from '../src/utils/browser';
import { useResponsive } from '../src/utils/useResponsive';

/** Warm near-black for glyphs/labels on the gold gradient (matches paywall.tsx). */
const CREST_INK = '#1A1A2E';

/**
 * The compact "remove ads" upsell, shown when the user taps a banner's close
 * [X]. A native form-sheet (fitToContents + grabber, configured in
 * app/_layout.tsx) presenting a real, working paywall — benefits, the two
 * plans with live prices, and a purchase CTA — reusing the same IAP layer and
 * tested pricing as the full paywall via usePaywallPurchase(). Dismiss is the
 * native swipe-down / grabber; an actual upgrade flips premium and the banner
 * (and this sheet) goes away on its own.
 */
export default function RemoveAdsScreen() {
  const router = useRouter();
  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const source = sourceParam || 'ad_close';
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useTranslation();
  const { spacing, radius, iconSizes, media, borderWidths } = useResponsive();
  const tc = paywallThemeColors[theme];
  const isDark = theme === 'dark';

  const {
    isPremium,
    productIds,
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

  // Distinguishes a successful upgrade (premium flip → we dismiss) from a user
  // swipe/back dismiss, so the unmount handler only logs genuine abandonments.
  const purchasedRef = useRef(false);

  useEffect(() => {
    trackPaywallViewed(source);
    // The only dismissal paths are the native grabber/swipe and hardware back;
    // neither gives a callback, so attribute a dismiss on unmount — unless the
    // user upgraded (then it's a success, not an abandonment).
    return () => {
      if (!purchasedRef.current) trackPaywallDismissed(source);
    };
  }, [source]);

  // Upgrade succeeded → premium flips, ads stop globally; close the sheet.
  useEffect(() => {
    if (isPremium) {
      purchasedRef.current = true;
      router.back();
    }
  }, [isPremium, router]);

  const handleTermsPress = () => {
    openInAppBrowser(`https://factsaday.com/${locale}/terms`, { theme }).catch((error) =>
      console.error('Error opening terms:', error)
    );
  };

  const handlePrivacyPress = () => {
    openInAppBrowser(`https://factsaday.com/${locale}/privacy`, { theme }).catch((error) =>
      console.error('Error opening privacy policy:', error)
    );
  };

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

  const benefitIconSize = iconSizes.xl + spacing.md;

  /* eslint-disable react-native/no-unused-styles -- styles used via styles.* */
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: spacing.xl,
          // headerShown is false, so iOS adds no top safe-area inset; give the
          // content clear breathing room below the native grabber.
          paddingTop: spacing.xl,
          // The grabber sits above; pad the bottom past the home indicator.
          paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md,
          gap: spacing.lg,
        },
        ambientGlow: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 220,
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
          width: benefitIconSize,
          height: benefitIconSize,
          borderRadius: benefitIconSize / 2,
          backgroundColor: tc.featureIconBg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        planPressable: {
          flex: 1,
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
          overflow: 'hidden',
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
          paddingVertical: spacing.xs,
        },
      }),
    [tc, isDark, spacing, radius, media, borderWidths, insets, benefitIconSize]
  );
  /* eslint-enable react-native/no-unused-styles */

  return (
    <View style={styles.container}>
      {/* Premium gradient backdrop + a soft gold glow up top, so the sheet
          reads as part of the paywall family rather than a plain dialog. */}
      <LinearGradient colors={[...tc.bg]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientGlow} pointerEvents="none">
        <LinearGradient colors={[...tc.ambientGlow]} style={StyleSheet.absoluteFill} />
      </View>

      {/* Header — crown + title. No subtitle: it would echo the first benefit's
          "no banners, no interruptions" copy verbatim immediately below it. */}
      <XStack alignItems="center" gap={spacing.xs + 2}>
        <Crown size={iconSizes.sm} color={PAYWALL_GOLD.primary} fill={PAYWALL_GOLD.primary} />
        <Text.Title fontFamily={FONT_FAMILIES.extrabold} color={tc.title} letterSpacing={-0.5}>
          {t('settingsRemoveAds')}
        </Text.Title>
      </XStack>

      {/* Benefits — same grammar as the full paywall, compact. */}
      <YStack gap={spacing.sm}>
        {benefits.map((b, i) => (
          <View key={i} style={styles.benefitCard}>
            <XStack alignItems="center" gap={spacing.md}>
              <View style={styles.benefitIcon}>{b.icon}</View>
              <YStack flex={1} gap={2}>
                <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle}>
                  {b.title}
                </Text.Body>
                <Text.Caption color={tc.featureDesc}>{b.description}</Text.Caption>
              </YStack>
              <Check size={iconSizes.sm} color={tc.featureDesc} strokeWidth={2.4} />
            </XStack>
          </View>
        ))}
      </YStack>

      {/* Plans — weekly | monthly, SAVE badge + per-week sub-line on monthly. */}
      <XStack gap={spacing.sm + 2}>
        {productIds.map((productId) => {
          const selected = selectedPlan === productId;
          const monthly = productId.includes('monthly');
          const weekly = productId.includes('weekly');

          return (
            <Pressable
              key={productId}
              onPress={() => selectPlan(productId)}
              style={styles.planPressable}
            >
              <View style={[styles.planCard, selected && styles.planCardSelected]}>
                {monthly && (
                  <View style={styles.savingsBadge}>
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

      {/* CTA + footer. */}
      <YStack gap={spacing.sm}>
        <Pressable
          onPress={handlePurchase}
          disabled={(!selectedPlan && !__DEV__) || isPurchasing}
          style={({ pressed }) => [
            styles.ctaButton,
            ((!selectedPlan && !__DEV__) || isPurchasing) && styles.ctaButtonDisabled,
            pressed && styles.ctaButtonPressed,
          ]}
        >
          <LinearGradient
            colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color={CREST_INK} />
            ) : (
              <Text.Body fontFamily={FONT_FAMILIES.extrabold} color={CREST_INK}>
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
          onPress={() => handleRestore()}
          disabled={isRestoring}
          hitSlop={spacing.md}
          style={styles.footerLink}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={tc.restoreLoader} />
          ) : (
            <Text.Label color={tc.restoreText}>{t('paywallRestore')}</Text.Label>
          )}
        </Pressable>
      </YStack>
    </View>
  );
}
