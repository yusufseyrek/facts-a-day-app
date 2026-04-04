import React, { memo } from 'react';
import { View } from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { LAYOUT } from '../../config/app';
import { useNativeAd } from '../../hooks/useNativeAd';
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
  /** Preferred media aspect ratio. Affects both the ad request and the component height. Defaults to LANDSCAPE. */
  aspectRatio?: NativeMediaAspectRatio;
}

function InlineNativeAdComponent({ cardHeight: cardHeightProp, aspectRatio = NativeMediaAspectRatio.LANDSCAPE }: InlineNativeAdProps) {
  const { screenWidth, radius } = useResponsive();
  const { nativeAd, isLoading, error } = useNativeAd({ aspectRatio });

  if (!nativeAd || isLoading || error) {
    return null;
  }

  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  const cardHeight = cardHeightProp ?? contentWidth * getHeightRatio(aspectRatio);

  return (
    <View style={{ height: cardHeight, overflow: 'hidden', borderRadius: radius.lg }}>
      <NativeAdCard cardHeight={cardHeight} nativeAd={nativeAd} />
    </View>
  );
}

export const InlineNativeAd = memo(InlineNativeAdComponent);
