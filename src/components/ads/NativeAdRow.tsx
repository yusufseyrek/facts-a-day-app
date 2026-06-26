import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  NativeAdEventType,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaAspectRatio,
  NativeMediaView,
} from 'react-native-google-mobile-ads';

import { useAdForSlot } from '../../hooks/useAdForSlot';
import { useTranslation } from '../../i18n';
import { trackAdRevenue, trackNativeAdClick } from '../../services/analytics';
import { aspectRatioName } from '../../services/nativeAds';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

interface NativeAdRowProps {
  /** Stable slot key for the pooled native ad. */
  slotKey: string;
  /** Alternating row tint, mirroring the surrounding KeepReadingItem rows. */
  isOdd?: boolean;
}

const ASPECT = NativeMediaAspectRatio.SQUARE;

/**
 * In-feed native ad styled to match `KeepReadingItem`: a "Sponsored" label and
 * the ad headline on the left, a small square media thumbnail on the right.
 * Renders nothing until its pooled slot has a bound ad, so a no-fill collapses
 * the row instead of leaving an empty spacer.
 */
function NativeAdRowComponent({ slotKey, isOdd = false }: NativeAdRowProps) {
  const { ad } = useAdForSlot(slotKey, ASPECT);
  const { theme } = useTheme();
  const { spacing, media } = useResponsive();
  const { t } = useTranslation();
  const colors = hexColors[theme];

  const imageSize = media.keepReadingImageSize;

  useEffect(() => {
    if (!ad) return;
    const clickSub = ad.addAdEventListener(NativeAdEventType.CLICKED, () => {
      trackNativeAdClick({ placement: 'feed', aspectRatio: aspectRatioName(ASPECT), slotKey });
    });
    // Native PAID payload emits `currency` at runtime despite the typed `currencyCode`.
    const paidSub = ad.addAdEventListener(NativeAdEventType.PAID, (revenue) => {
      trackAdRevenue({
        format: 'native',
        value: revenue.value,
        currency: (revenue as { currency?: string }).currency ?? revenue.currencyCode ?? '',
        precision: revenue.precision,
        placement: 'feed',
      });
    });
    return () => {
      clickSub.remove();
      paidSub.remove();
    };
  }, [ad, slotKey]);

  if (!ad) return null;

  return (
    <NativeAdView nativeAd={ad}>
      <View
        style={[
          styles.item,
          {
            padding: spacing.xl,
            backgroundColor: isOdd ? `${colors.cardBackground}70` : 'transparent',
          },
        ]}
      >
        <View style={[styles.textContainer, { marginRight: spacing.md }]}>
          {/* Category slot — reads "Sponsored" so the row is clearly an ad. */}
          <Text.Label color={colors.accent} marginBottom={spacing.xs}>
            {t('sponsored')}
          </Text.Label>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text.Body color="$text" numberOfLines={5} fontFamily={FONT_FAMILIES.semibold}>
              {ad.headline}
            </Text.Body>
          </NativeAsset>
        </View>

        {/* Square thumbnail — mirrors the KeepReadingItem image on the right. */}
        <View
          style={{
            width: imageSize,
            height: imageSize,
            borderRadius: spacing.sm,
            overflow: 'hidden',
            backgroundColor: '#1a1a2e',
          }}
        >
          <NativeMediaView
            resizeMode="cover"
            style={{ width: imageSize, height: imageSize, aspectRatio: undefined }}
          />
        </View>
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
});

export const NativeAdRow = memo(NativeAdRowComponent);
