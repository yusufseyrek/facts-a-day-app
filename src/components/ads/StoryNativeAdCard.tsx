import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaAspectRatio,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRight } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { XStack } from 'tamagui';

import { useAdForSlot } from '../../hooks/useAdForSlot';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

interface StoryNativeAdCardProps {
  screenWidth: number;
  screenHeight: number;
  onAdFailed?: () => void;
  /** Pre-loaded native ad (skips the pool). */
  nativeAd?: NativeAd;
  /** Stable slot key for pool-driven ads. Ignored when `nativeAd` is provided. */
  slotKey?: string;
}

const gradientColors = ['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)'] as const;
const gradientLocations = [0.3, 0.55, 1] as const;

function StoryNativeAdCardComponent({
  screenWidth,
  screenHeight,
  onAdFailed,
  nativeAd: nativeAdProp,
  slotKey,
}: StoryNativeAdCardProps) {
  const isPortrait = screenHeight > screenWidth;
  const aspectRatio = isPortrait
    ? NativeMediaAspectRatio.PORTRAIT
    : NativeMediaAspectRatio.LANDSCAPE;

  const { ad: nativeAdFromPool, status } = useAdForSlot(
    nativeAdProp ? null : slotKey,
    aspectRatio
  );
  const nativeAd = nativeAdProp ?? nativeAdFromPool;
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { spacing, typography, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  useEffect(() => {
    if (!nativeAdProp && status === 'failed' && onAdFailed) {
      onAdFailed();
    }
  }, [nativeAdProp, status, onAdFailed]);

  // Full-screen sized spacer while the pool is still loading — keeps the swipe
  // list's layout stable. A no-fill (failed) slot is dropped by the parent via
  // onAdFailed, so there's no long-lived empty page.
  if (!nativeAd) {
    return <View style={{ width: screenWidth, height: screenHeight }} pointerEvents="none" />;
  }

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={{ width: screenWidth, height: screenHeight, overflow: 'hidden' }}
    >
      {/* Full-screen media background */}
      <NativeMediaView
        resizeMode="cover"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: screenHeight,
          aspectRatio: undefined,
        }}
      />

      {/* Gradient overlay — matches StoryPage */}
      <LinearGradient
        colors={gradientColors}
        locations={gradientLocations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Text content overlaid at bottom — mirrors StoryPage layout */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.sm,
        }}
      >
        {/* Sponsored badge — styled like CategoryBadge compact */}
        <XStack
          pointerEvents="none"
          paddingHorizontal={spacing.sm}
          paddingVertical={2}
          borderRadius={999}
          alignSelf="flex-start"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Text.Caption color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
            {t('sponsored')}
          </Text.Caption>
        </XStack>

        {/* Headline — matches story title */}
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text.Headline
            pointerEvents="none"
            numberOfLines={3}
            color="#FFFFFF"
            style={styles.textShadow}
          >
            {nativeAd.headline}
          </Text.Headline>
        </NativeAsset>

        {/* Body — matches story summary */}
        {nativeAd.body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text.Body
              pointerEvents="none"
              color="rgba(255,255,255,0.8)"
              fontFamily={FONT_FAMILIES.regular}
              numberOfLines={3}
              style={styles.textShadow}
            >
              {nativeAd.body}
            </Text.Body>
          </NativeAsset>
        ) : null}

        {/* CTA — pointerEvents="none" so taps pass through to the ad behind */}
        {nativeAd.callToAction ? (
          <View
            pointerEvents="none"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              marginTop: spacing.xs,
            }}
          >
            <Text.Body
              color={colors.primary}
              fontFamily={FONT_FAMILIES.semibold}
              fontSize={typography.fontSize.body}
            >
              {nativeAd.callToAction}
            </Text.Body>
            <ChevronRight size={iconSizes.sm} color={colors.primary} />
          </View>
        ) : null}
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  textShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});

export const StoryNativeAdCard = memo(StoryNativeAdCardComponent);
