import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
import { XStack } from 'tamagui';

import { useNativeAd } from '../../hooks/useNativeAd';
import { useTranslation } from '../../i18n';
import { trackNativeAdImpression } from '../../services/analytics';
import { useResponsive } from '../../utils/useResponsive';

import { FONT_FAMILIES, Text } from '../Typography';

interface NativeAdCardProps {
  /** Fixed card width (for carousel use) */
  cardWidth?: number;
  /** Fixed card height — overrides the default aspect-ratio-based height */
  cardHeight?: number;
  /** Called when the native ad fails to load (e.g. no-fill) */
  onAdFailed?: () => void;
  /** Called when the native ad successfully loads */
  onAdLoaded?: () => void;
  /** Pre-loaded native ad (when provided, skips internal useNativeAd hook) */
  nativeAd?: NativeAd;
}

const gradientColors = ['transparent', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.85)'] as const;
const gradientLocations = [0.25, 0.55, 1] as const;

function NativeAdCardComponent({ cardWidth, cardHeight: cardHeightProp, onAdFailed, onAdLoaded, nativeAd: nativeAdProp }: NativeAdCardProps) {
  const { nativeAd: nativeAdFromHook, isLoading, error } = useNativeAd({ skip: !!nativeAdProp });
  const nativeAd = nativeAdProp ?? nativeAdFromHook;
  const { screenWidth, spacing, radius, config } = useResponsive();
  const { t } = useTranslation();

  useEffect(() => {
    if (!nativeAdProp && !isLoading && (error || !nativeAd)) {
      onAdFailed?.();
    }
  }, [nativeAdProp, isLoading, error, nativeAd, onAdFailed]);

  useEffect(() => {
    if (nativeAd && (nativeAdProp || (!isLoading && !error))) {
      trackNativeAdImpression();
      onAdLoaded?.();
    }
  }, [nativeAd, nativeAdProp, isLoading, error, onAdLoaded]);

  if (!nativeAd || (!nativeAdProp && (isLoading || error))) {
    return null;
  }

  const cardHeight = cardHeightProp ?? screenWidth * config.cardAspectRatio;

  // When nativeAd is passed as prop (inline usage), no margin needed since parent handles spacing
  const needsMargin = !nativeAdProp && !cardWidth;

  return (
    <NativeAdView nativeAd={nativeAd} style={needsMargin ? { marginBottom: spacing.md } : undefined}>
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
