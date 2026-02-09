import React, { memo, useCallback, useEffect } from 'react';
import { View } from 'react-native';

import { useNativeAd } from '../../hooks/useNativeAd';
import { useResponsive } from '../../utils/useResponsive';

import { NativeAdCard } from './NativeAdCard';

interface PopularNativeAdItemProps {
  adKey: string;
  cardWidth: number;
  cardHeight: number;
  onAdFailed: (key: string) => void;
}

function PopularNativeAdItemComponent({
  adKey,
  cardWidth,
  cardHeight,
  onAdFailed,
}: PopularNativeAdItemProps) {
  const { nativeAd, isLoading, error } = useNativeAd();
  const { spacing } = useResponsive();

  const handleAdFailed = useCallback(() => {
    onAdFailed(adKey);
  }, [adKey, onAdFailed]);

  // Notify parent when ad fails so the placeholder is removed from the list
  useEffect(() => {
    if (!isLoading && (error || !nativeAd)) {
      handleAdFailed();
    }
  }, [isLoading, error, nativeAd, handleAdFailed]);

  // Don't render anything until we have an ad ready — no wrapper = no empty card
  if (!nativeAd || isLoading || error) {
    return null;
  }

  return (
    <View style={{ width: cardWidth, paddingVertical: spacing.sm }}>
      <NativeAdCard
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        nativeAd={nativeAd}
      />
    </View>
  );
}

export const PopularNativeAdItem = memo(PopularNativeAdItemComponent);
