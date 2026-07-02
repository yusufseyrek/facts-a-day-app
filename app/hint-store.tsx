import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';

import { Text } from '../src/components';
import { Check, Lightbulb } from '../src/components/icons';
import { XStack, YStack } from '../src/components/Stacks';
import { FONT_FAMILIES } from '../src/components/Typography';
import { useHintPurchase } from '../src/hooks/useHintPurchase';
import { useTranslation } from '../src/i18n';
import { trackHintStoreViewed } from '../src/services/analytics';
import { PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
import { isMacOS } from '../src/utils/platform';
import { useResponsive } from '../src/utils/useResponsive';

/** Warm near-black for glyphs/labels on the gold gradient (matches paywall.tsx). */
const CREST_INK = '#1A1A2E';

/**
 * The consumable hint-pack store, opened from the trivia hub's balance chip
 * and the in-game "Get Hints" pill. Same native form-sheet treatment as
 * remove-ads (fitToContents + grabber, configured in app/_layout.tsx) and the
 * same paywall-family look. Purchasing goes through useHintPurchase; the
 * actual balance credit happens in PremiumContext's global purchase listener,
 * so this sheet just reflects the live wallet balance.
 */
export default function HintStoreScreen() {
  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const source = sourceParam || 'hint_store';
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes, media, borderWidths, isTablet } = useResponsive();
  const tc = paywallThemeColors[theme];
  const isDark = theme === 'dark';

  const { balance, productIds, hintsFor, getDisplayPrice, purchasingId, purchasePack } =
    useHintPurchase(source);

  // Default selection: the middle pack.
  const [selectedId, setSelectedId] = useState<string>(
    productIds[Math.floor(productIds.length / 2)] ?? productIds[0]
  );

  // Success feedback: the global purchase listener credits the wallet, so a
  // balance increase while the sheet is open means the purchase landed.
  const prevBalanceRef = useRef(balance);
  const [justCredited, setJustCredited] = useState(false);
  useEffect(() => {
    if (balance > prevBalanceRef.current) {
      setJustCredited(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    prevBalanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    trackHintStoreViewed(source);
  }, [source]);

  const isPurchasing = purchasingId !== null;
  const largestId = productIds[productIds.length - 1];

  /* eslint-disable react-native/no-unused-styles -- styles used via styles.* */
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xxl,
          paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md,
          gap: spacing.lg,
        },
        scrollRoot: {
          flex: 1,
        },
        scroll: {
          flex: 1,
        },
        ambientGlow: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 220,
        },
        balanceCard: {
          backgroundColor: tc.featureBg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
        },
        packPressable: {
          flex: 1,
        },
        packCard: {
          flex: 1,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.lg,
          borderWidth: borderWidths.thin,
          borderColor: tc.planBorder,
          backgroundColor: tc.planBg,
          alignItems: 'center',
          minHeight: media.buttonHeight + spacing.lg,
        },
        packCardSelected: {
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
        valueBadge: {
          position: 'absolute',
          top: -spacing.sm - 2,
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
      }),
    [tc, isDark, spacing, radius, media, borderWidths, insets]
  );
  /* eslint-enable react-native/no-unused-styles */

  const backdrop = (
    <>
      <LinearGradient colors={[...tc.bg]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientGlow} pointerEvents="none">
        <LinearGradient colors={[...tc.ambientGlow]} style={StyleSheet.absoluteFill} />
      </View>
    </>
  );

  const content = (
    <>
      {/* Header — lightbulb + title, description below. */}
      <YStack gap={spacing.xs}>
        <XStack alignItems="center" gap={spacing.xs + 2}>
          <Lightbulb
            size={iconSizes.sm}
            color={PAYWALL_GOLD.primary}
            fill={PAYWALL_GOLD.primary}
          />
          <Text.Title fontFamily={FONT_FAMILIES.extrabold} color={tc.title} letterSpacing={-0.5}>
            {t('hintStoreTitle')}
          </Text.Title>
        </XStack>
        <Text.Caption color={tc.featureDesc}>{t('hintStoreDescription')}</Text.Caption>
      </YStack>

      {/* Current balance (turns into the success row right after a purchase). */}
      <View style={styles.balanceCard}>
        <XStack alignItems="center" gap={spacing.md}>
          {justCredited ? (
            <Check size={iconSizes.sm} color={PAYWALL_GOLD.primary} strokeWidth={2.4} />
          ) : (
            <Lightbulb size={iconSizes.sm} color={PAYWALL_GOLD.primary} />
          )}
          <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle}>
            {t('hintStoreBalance', { count: balance })}
          </Text.Body>
        </XStack>
      </View>

      {/* Packs — small | medium | large, BEST VALUE badge on the largest. */}
      <XStack gap={spacing.sm + 2}>
        {productIds.map((productId) => {
          const selected = selectedId === productId;
          const isLargest = productId === largestId;

          return (
            <Pressable
              key={productId}
              onPress={() => setSelectedId(productId)}
              disabled={isPurchasing}
              style={styles.packPressable}
            >
              <View style={[styles.packCard, selected && styles.packCardSelected]}>
                {isLargest && (
                  <View style={styles.valueBadge}>
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
                      {t('paywallBestValue')}
                    </Text.Tiny>
                  </View>
                )}

                <Text.Title
                  fontFamily={FONT_FAMILIES.extrabold}
                  letterSpacing={-0.5}
                  color={selected ? tc.planSelectedTitle : tc.planPrice}
                >
                  {hintsFor(productId)}
                </Text.Title>
                <Text.Tiny
                  fontFamily={FONT_FAMILIES.extrabold}
                  letterSpacing={0.8}
                  color={tc.planPeriod}
                >
                  {t('hintStoreHintsUnit')}
                </Text.Tiny>
                <Text.Label
                  fontFamily={FONT_FAMILIES.semibold}
                  color={tc.planPrice}
                  marginTop={spacing.xs}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {getDisplayPrice(productId)}
                </Text.Label>
              </View>
            </Pressable>
          );
        })}
      </XStack>

      {/* CTA + footer. */}
      <YStack gap={spacing.sm}>
        <Pressable
          onPress={() => purchasePack(selectedId)}
          disabled={isPurchasing}
          style={({ pressed }) => [
            styles.ctaButton,
            isPurchasing && styles.ctaButtonDisabled,
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
                {t('hintStoreCta', { count: hintsFor(selectedId) })}
              </Text.Body>
            )}
          </LinearGradient>
        </Pressable>

        <YStack alignItems="center">
          <Text.Caption color={tc.cancelText} textAlign="center">
            {t('hintStoreNeverExpires')}
          </Text.Caption>
        </YStack>
      </YStack>
    </>
  );

  // Same host split as remove-ads.tsx: plain View on phones (fitToContents
  // wraps it exactly); ScrollView host on tablets/Mac where formSheet is a
  // fixed-size card that ignores the detent and would otherwise clip.
  if (isTablet || isMacOS()) {
    return (
      <View style={styles.scrollRoot}>
        {backdrop}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          {content}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {backdrop}
      {content}
    </View>
  );
}
