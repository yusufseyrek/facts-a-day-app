import React, { memo, useCallback, useState } from 'react';
import { View } from 'react-native';

import { useResponsive } from '../../utils/useResponsive';

import { NativeAdCard } from './NativeAdCard';

const INLINE_HEIGHT_RATIO_PHONE = 0.35;
const INLINE_HEIGHT_RATIO_TABLET = 0.25;

interface InlineNativeAdProps {
  /** Override the default height. Defaults to screenWidth * 0.35 (phone) or 0.25 (tablet). */
  cardHeight?: number;
}

function InlineNativeAdComponent({ cardHeight: cardHeightProp }: InlineNativeAdProps) {
  const { screenWidth, radius, isTablet } = useResponsive();
  const [adFailed, setAdFailed] = useState(false);

  const handleAdFailed = useCallback(() => {
    setAdFailed(true);
  }, []);

  if (adFailed) {
    return null;
  }

  const cardHeight =
    cardHeightProp ?? screenWidth * (isTablet ? INLINE_HEIGHT_RATIO_TABLET : INLINE_HEIGHT_RATIO_PHONE);

  return (
    <View style={{ height: cardHeight, overflow: 'hidden', borderRadius: radius.lg }}>
      <NativeAdCard cardHeight={cardHeight} onAdFailed={handleAdFailed} />
    </View>
  );
}

export const InlineNativeAd = memo(InlineNativeAdComponent);
