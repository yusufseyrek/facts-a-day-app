import { memo } from 'react';
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
}

function InlineNativeAdComponent({
  cardHeight: cardHeightProp,
  aspectRatio = NativeMediaAspectRatio.LANDSCAPE,
  slotKey,
}: InlineNativeAdProps) {
  const { screenWidth, radius } = useResponsive();
  const { ad } = useAdForSlot(slotKey, aspectRatio);

  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  const cardHeight = cardHeightProp ?? contentWidth * getHeightRatio(aspectRatio);

  return (
    <View style={{ height: cardHeight, overflow: 'hidden', borderRadius: radius.lg }}>
      {ad ? <NativeAdCard cardHeight={cardHeight} nativeAd={ad} /> : null}
    </View>
  );
}

export const InlineNativeAd = memo(InlineNativeAdComponent);
