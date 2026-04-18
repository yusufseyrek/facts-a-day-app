import { memo, useEffect } from 'react';
import { View } from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { LAYOUT } from '../../config/app';
import { useAdForSlot } from '../../hooks/useAdForSlot';
import { useResponsive } from '../../utils/useResponsive';

import { NativeAdCard } from './NativeAdCard';

/** Map aspect ratio enum to a width/height multiplier */
function getHeightRatio(aspectRatio: NativeMediaAspectRatio): number {
  switch (aspectRatio) {
    case NativeMediaAspectRatio.LANDSCAPE:
      return 9 / 16;
    case NativeMediaAspectRatio.PORTRAIT:
      return 4 / 3;
    case NativeMediaAspectRatio.SQUARE:
      return 1;
    case NativeMediaAspectRatio.ANY:
    default:
      return 9 / 16;
  }
}

interface InlineNativeAdProps {
  /** Override the default height. When set, aspectRatio is ignored for sizing. */
  cardHeight?: number;
  /** Preferred media aspect ratio. Affects the component height. Defaults to LANDSCAPE. */
  aspectRatio?: NativeMediaAspectRatio;
  /** Stable slot key for pool-driven ads in a FlashList. */
  slotKey?: string;
  /** When `false`, the cell skips subscribing — the parent list should flip
   * this to `true` once the row becomes viewable, so pool inventory isn't
   * burned on off-screen cells pre-mounted by FlashList. Defaults to `true`. */
  enabled?: boolean;
  /** Fires when the pool reports the slot as `failed` (no-fill / rate-limit).
   * Parent lists should use this to drop the row so the gap closes. */
  onAdFailed?: () => void;
}

function InlineNativeAdComponent({
  cardHeight: cardHeightProp,
  aspectRatio = NativeMediaAspectRatio.LANDSCAPE,
  slotKey,
  enabled = true,
  onAdFailed,
}: InlineNativeAdProps) {
  const { screenWidth, radius } = useResponsive();
  const { ad, status } = useAdForSlot(slotKey, aspectRatio, enabled);

  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  const cardHeight = cardHeightProp ?? contentWidth * getHeightRatio(aspectRatio);

  useEffect(() => {
    if (status === 'failed' && onAdFailed) {
      onAdFailed();
    }
  }, [status, onAdFailed]);

  // No ad bound → render nothing. Parents listening for `onAdFailed` drop the
  // row on terminal failure; transient 'loading' windows flash nothing instead
  // of a reserved-height spacer.
  if (!ad) return null;

  return (
    <View style={{ height: cardHeight, overflow: 'hidden', borderRadius: radius.lg }}>
      <NativeAdCard cardHeight={cardHeight} nativeAd={ad} />
    </View>
  );
}

export const InlineNativeAd = memo(InlineNativeAdComponent);
