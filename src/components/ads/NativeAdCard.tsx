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

import { LinearGradient } from 'expo-linear-gradient';
import { XStack } from 'tamagui';

import { useAdForSlot } from '../../hooks/useAdForSlot';
import { useTranslation } from '../../i18n';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

interface NativeAdCardProps {
  /** Fixed card width (for carousel use) */
  cardWidth?: number;
  /** Fixed card height — overrides the default aspect-ratio-based height */
  cardHeight?: number;
  /** Pre-loaded native ad (skips the pool). Used by callers that manage their own ad lifecycle. */
  nativeAd?: NativeAd;
  /** Stable slot key for pool-driven ads in a FlashList. Ignored when `nativeAd` is passed. */
  slotKey?: string;
  /** Preferred media aspect ratio for the ad request. Defaults to LANDSCAPE. */
  aspectRatio?: NativeMediaAspectRatio;
  /** Fires when the pool reports a failure for this slot. Parent lists use this to drop the ad cell. */
  onAdFailed?: () => void;
}

const gradientColors = ['transparent', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.85)'] as const;
const gradientLocations = [0.25, 0.55, 1] as const;

function NativeAdCardComponent({
  cardWidth,
  cardHeight: cardHeightProp,
  nativeAd: nativeAdProp,
  slotKey,
  aspectRatio = NativeMediaAspectRatio.LANDSCAPE,
  onAdFailed,
}: NativeAdCardProps) {
  const { ad: nativeAdFromPool, status } = useAdForSlot(
    nativeAdProp ? null : slotKey,
    aspectRatio
  );
  const nativeAd = nativeAdProp ?? nativeAdFromPool;
  const { screenWidth, spacing, radius, config } = useResponsive();
  const { t } = useTranslation();

  useEffect(() => {
    if (!nativeAdProp && status === 'failed' && onAdFailed) {
      onAdFailed();
    }
  }, [nativeAdProp, status, onAdFailed]);

  const cardHeight = cardHeightProp ?? screenWidth * config.cardAspectRatio;
  // Inline usage (InlineNativeAd) and carousel usage handle outer spacing themselves.
  const needsMargin = !nativeAdProp && !cardWidth;

  // No ad bound yet (pool still loading, no-fill, premium, etc.) — render
  // nothing. Parent lists that wired `onAdFailed` drop the cell on terminal
  // failure; transient 'loading' windows are effectively invisible.
  if (!nativeAd) {
    return null;
  }

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={needsMargin ? { marginBottom: spacing.md } : undefined}
    >
      <View
        style={{
          borderRadius: radius.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        <View style={[styles.imageContainer, { height: cardHeight }]}>
          {/* Media content — must explicitly nullify the internal aspectRatio
              that NativeMediaView injects, otherwise it overrides our dimensions */}
          <NativeMediaView
            resizeMode="cover"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: cardHeight,
              aspectRatio: undefined,
            }}
          />

          {/* Gradient overlay */}
          <LinearGradient
            colors={gradientColors}
            locations={gradientLocations}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Sponsored badge */}
          <View style={[styles.badgeContainer, { top: spacing.md, right: spacing.md }]}>
            <XStack
              paddingHorizontal={spacing.md}
              paddingVertical={spacing.xs}
              borderRadius={radius.full}
              alignSelf="flex-start"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
            >
              <Text.Caption color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                {t('sponsored')}
              </Text.Caption>
            </XStack>
          </View>

          {/* Headline */}
          <View
            style={[
              styles.contentOverlay,
              {
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.lg,
                paddingTop: spacing.xl * 1.5,
              },
            ]}
          >
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text.Title
                color="#FFFFFF"
                numberOfLines={config.maxLines}
                style={styles.titleShadow}
              >
                {nativeAd.headline}
              </Text.Title>
            </NativeAsset>
          </View>
        </View>
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  badgeContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  titleShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});

export const NativeAdCard = memo(NativeAdCardComponent);
