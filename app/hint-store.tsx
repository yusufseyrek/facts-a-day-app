import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';

import { Text } from '../src/components';
import { Check, HelpCircle } from '../src/components/icons';
import { XStack, YStack } from '../src/components/Stacks';
import { FONT_FAMILIES } from '../src/components/Typography';
import { useFormSheetBottomPadding } from '../src/hooks/useFormSheetBottomPadding';
import { useHintPurchase } from '../src/hooks/useHintPurchase';
import { useTranslation } from '../src/i18n';
import { trackHintStoreViewed } from '../src/services/analytics';
import { hexColors, PAYWALL_GOLD, paywallThemeColors, useTheme } from '../src/theme';
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
  const sheetBottomPadding = useFormSheetBottomPadding();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes, media, borderWidths, isTablet } = useResponsive();
  const tc = paywallThemeColors[theme];
  const isDark = theme === 'dark';

  const {
    balance,
    productIds,
    hintsFor,
    getDisplayPrice,
    purchasingId,
    purchasePack,
    isPackAvailable,
    purchaseFailed,
  } = useHintPurchase(source);

  // Default selection: the middle pack.
  const [selectedId, setSelectedId] = useState<string>(
    productIds[Math.floor(productIds.length / 2)] ?? productIds[0]
  );

  // Success feedback: the global purchase listener credits the wallet, so a
  // balance increase means the purchase landed. Armed only after a purchase
  // attempt from THIS sheet — the initial async wallet load also raises the
  // balance (0 → stored value) and must not read as "Hints added!".
  const attemptedRef = useRef(false);
  const prevBalanceRef = useRef(balance);
  const [justCredited, setJustCredited] = useState(false);
  useEffect(() => {
    if (purchasingId !== null) attemptedRef.current = true;
  }, [purchasingId]);
  useEffect(() => {
    if (attemptedRef.current && balance > prevBalanceRef.current) {
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
  const balanceIconSize = iconSizes.xl + spacing.md;
  // Cached prices can render the tiles before the store answers, but a
  // purchase needs the LIVE product — keep the CTA down until it's in.
  const selectedAvailable = isPackAvailable(selectedId);
  const selectedPrice = getDisplayPrice(selectedId);
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  // CTA carries the exact charge so there's no ambiguity about which tile
  // is selected before the native payment sheet appears.
  const ctaLabel =
    selectedPrice !== '---'
      ? `${t('hintStoreCta', { count: hintsFor(selectedId) })} · ${selectedPrice}`
      : t('hintStoreCta', { count: hintsFor(selectedId) });

  /* eslint-disable react-native/no-unused-styles -- styles used via styles.* */
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xxl,
          paddingBottom: sheetBottomPadding,
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
        balanceCardSuccess: {
          borderColor: PAYWALL_GOLD.primary,
        },
        // Same circular icon treatment as remove-ads' benefit rows.
        balanceIcon: {
          width: balanceIconSize,
          height: balanceIconSize,
          borderRadius: balanceIconSize / 2,
          backgroundColor: tc.featureIconBg,
          borderWidth: 1,
          borderColor: tc.featureBorder,
          alignItems: 'center',
          justifyContent: 'center',
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
    [tc, isDark, spacing, radius, media, borderWidths, sheetBottomPadding, balanceIconSize]
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
      {/* Header — question-mark badge + title, description below. HelpCircle
          can't take the paywall family's fill treatment (a filled circle would
          swallow its own question mark), so a heavier stroke carries the same
          visual weight instead. */}
      <YStack gap={spacing.xs}>
        <XStack alignItems="center" gap={spacing.xs + 2}>
          <HelpCircle size={iconSizes.sm} color={PAYWALL_GOLD.primary} strokeWidth={2.5} />
          <Text.Title fontFamily={FONT_FAMILIES.extrabold} color={tc.title} letterSpacing={-0.5}>
            {t('hintStoreTitle')}
          </Text.Title>
        </XStack>
        <Text.Caption color={tc.featureDesc}>{t('hintStoreDescription')}</Text.Caption>
      </YStack>

      {/* Current balance (turns into the success row right after a purchase). */}
      <View
        style={[styles.balanceCard, justCredited && styles.balanceCardSuccess]}
        accessibilityLiveRegion="polite"
      >
        <XStack alignItems="center" gap={spacing.md}>
          <View style={styles.balanceIcon}>
            {justCredited ? (
              <Check size={iconSizes.md} color={PAYWALL_GOLD.primary} strokeWidth={2.4} />
            ) : (
              <HelpCircle size={iconSizes.md} color={PAYWALL_GOLD.primary} />
            )}
          </View>
          <YStack flex={1} gap={2}>
            <Text.Body fontFamily={FONT_FAMILIES.semibold} color={tc.featureTitle}>
              {t('hintStoreBalance', { count: balance })}
            </Text.Body>
            {justCredited && (
              <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={PAYWALL_GOLD.primary}>
                {t('hintStoreAdded')}
              </Text.Caption>
            )}
          </YStack>
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
              role="radio"
              aria-label={`${hintsFor(productId)} ${t('hintStoreHintsUnit')}, ${getDisplayPrice(productId)}`}
              aria-selected={selected}
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
          disabled={isPurchasing || !selectedAvailable}
          role="button"
          aria-label={ctaLabel}
          testID="hint-store-cta"
          style={({ pressed }) => [
            styles.ctaButton,
            (isPurchasing || !selectedAvailable) && styles.ctaButtonDisabled,
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
                {ctaLabel}
              </Text.Body>
            )}
          </LinearGradient>
        </Pressable>

        {/* One status line under the CTA: a store error from the last attempt,
            or why the button is disabled (live product not fetched yet). */}
        {purchaseFailed ? (
          <Text.Caption color={errorColor} textAlign="center" accessibilityLiveRegion="polite">
            {t('hintStorePurchaseFailed')}
          </Text.Caption>
        ) : !selectedAvailable && !isPurchasing ? (
          <Text.Caption color={tc.cancelText} textAlign="center">
            {t('hintStoreConnecting')}
          </Text.Caption>
        ) : null}

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
      <View style={styles.scrollRoot} testID="hint-store-sheet">
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
    <View style={styles.container} testID="hint-store-sheet">
      {backdrop}
      {content}
    </View>
  );
}
