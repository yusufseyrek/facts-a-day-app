/* eslint-disable react-native/no-unused-styles */
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ban, Crown, Lightbulb, WifiOff } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../i18n/useTranslation';
import { PAYWALL_GOLD, paywallThemeColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

/**
 * Non-dismissible bottom sheet shown over dimmed app content when offline + free user.
 * Shows premium features with a CTA to the full paywall. Covers ~60% of screen.
 */
export function OfflinePaywallSheet() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { spacing, radius, iconSizes, media, borderWidths } = useResponsive();
  const tc = paywallThemeColors[theme];
  const isDark = theme === 'dark';

  const featureIconColor = '#78350F';
  const featureIconSize = iconSizes.xl + spacing.sm;

  const features = [
    {
      icon: <Ban size={iconSizes.sm} color={featureIconColor} />,
      title: t('paywallFeatureNoAds'),
      gradient: [PAYWALL_GOLD.dark, PAYWALL_GOLD.primary] as const,
    },
    {
      icon: <WifiOff size={iconSizes.sm} color={featureIconColor} />,
      title: t('paywallFeatureOfflineSupport'),
      gradient: [PAYWALL_GOLD.dark, PAYWALL_GOLD.badge] as const,
    },
    {
      icon: <Lightbulb size={iconSizes.sm} color={featureIconColor} />,
      title: t('paywallFeatureHints'),
      gradient: ['#FF8C00', PAYWALL_GOLD.badge] as const,
    },
  ];

  const sheetBg = isDark ? '#0D1A30' : '#FFF8EE';
  const handleColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 1000,
        },
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.5)',
        },
        sheet: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: sheetBg,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingBottom: insets.bottom + spacing.lg,
          // Shadow
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
            },
            android: {
              elevation: 24,
            },
          }),
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: handleColor,
          alignSelf: 'center',
          marginTop: spacing.md,
          marginBottom: spacing.md,
        },
        offlineBanner: {
          marginHorizontal: spacing.lg,
          marginBottom: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          backgroundColor: tc.featureBg,
          padding: spacing.md,
        },
        featureRow: {
          marginHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          backgroundColor: tc.featureBg,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
        featureIcon: {
          width: featureIconSize * 0.7,
          height: featureIconSize * 0.7,
          borderRadius: (featureIconSize * 0.7) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ctaContainer: {
          marginHorizontal: spacing.lg,
          borderRadius: radius.xl + spacing.xs,
          overflow: 'hidden',
          ...Platform.select({
            ios: {
              shadowColor: PAYWALL_GOLD.primary,
              shadowOffset: { width: 0, height: spacing.sm - borderWidths.medium },
              shadowOpacity: 0.45,
              shadowRadius: spacing.lg,
            },
            android: {
              elevation: 10,
            },
          }),
        },
        ctaButton: {
          height: media.buttonHeight,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [sheetBg, radius, spacing, insets, handleColor, tc, featureIconSize, media, borderWidths]
  );

  return (
    <View style={dynamicStyles.overlay} pointerEvents="box-none">
      {/* Dimmed backdrop */}
      <Animated.View entering={FadeIn.duration(300)} style={dynamicStyles.backdrop} />

      {/* Bottom sheet */}
      <Animated.View entering={FadeInUp.duration(400)} style={dynamicStyles.sheet}>
        {/* Handle */}
        <View style={dynamicStyles.handle} />

        <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
          {/* Offline banner */}
          <View style={dynamicStyles.offlineBanner}>
            <XStack alignItems="center" gap={spacing.md}>
              <View
                style={{
                  width: iconSizes.xl,
                  height: iconSizes.xl,
                  borderRadius: iconSizes.xl / 2,
                  backgroundColor: 'rgba(255, 184, 0, 0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <WifiOff size={iconSizes.md} color={PAYWALL_GOLD.primary} />
              </View>
              <YStack flex={1} gap={2}>
                <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle}>
                  {t('offlineGateTitle')}
                </Text.Body>
                <Text.Caption color={tc.featureDesc}>{t('offlineGateDescription')}</Text.Caption>
              </YStack>
            </XStack>
          </View>

          {/* Crown + Title */}
          <YStack alignItems="center" gap={spacing.xs} marginBottom={spacing.md}>
            <LinearGradient
              colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.xs,
              }}
            >
              <Crown size={iconSizes.lg} color="#FFFFFF" fill="#FFFFFF" />
            </LinearGradient>
            <Text.Headline textAlign="center" color={tc.title} fontFamily={FONT_FAMILIES.bold}>
              {t('paywallTitle')}
            </Text.Headline>
            <Text.Caption textAlign="center" color={tc.subtitle}>
              {t('paywallSubtitle')}
            </Text.Caption>
          </YStack>

          {/* Feature list (compact) */}
          <YStack gap={spacing.sm} marginBottom={spacing.lg}>
            {features.map((feature, index) => (
              <View key={index} style={dynamicStyles.featureRow}>
                <XStack alignItems="center" gap={spacing.md}>
                  <LinearGradient
                    colors={[...feature.gradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={dynamicStyles.featureIcon}
                  >
                    {feature.icon}
                  </LinearGradient>
                  <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle} flex={1}>
                    {feature.title}
                  </Text.Body>
                </XStack>
              </View>
            ))}
          </YStack>

          {/* CTA Button */}
          <Pressable
            onPress={() => router.push('/paywall?source=offline')}
            style={({ pressed }) => [dynamicStyles.ctaContainer, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={dynamicStyles.ctaButton}
            >
              <Text.Body fontFamily={FONT_FAMILIES.semibold} color="#000000">
                {t('offlineGateCta')}
              </Text.Body>
            </LinearGradient>
          </Pressable>

          {/* Restore link */}
          <Pressable
            onPress={() => router.push('/paywall?source=offline')}
            hitSlop={spacing.md}
            style={{ alignSelf: 'center', marginTop: spacing.md }}
          >
            <Text.Caption color={tc.restoreText}>{t('paywallRestore')}</Text.Caption>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
