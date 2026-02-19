import React from 'react';

import { SvgXml } from 'react-native-svg';
import { XStack } from 'tamagui';

import { STAR_COLORS } from '../../config/badges';
import { useTheme } from '../../theme';

// 5-point star polygon coordinates in a 24x24 viewBox
const STAR_POINTS = '12,2 15.09,8.26 22,9.27 17,14.14 18.18,22 12,18.27 5.82,22 7,14.14 2,9.27 8.91,8.26';

function buildStarSvg(size: number, fill: string, stroke: string): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="${STAR_POINTS}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

interface StarRatingProps {
  earnedCount: number;
  totalStars?: number;
  size?: number;
  gap?: number;
}

export function StarRating({ earnedCount, totalStars = 3, size = 14, gap = 3 }: StarRatingProps) {
  const { theme } = useTheme();
  const emptyColor = STAR_COLORS.empty[theme];

  return (
    <XStack gap={gap} alignItems="center">
      {Array.from({ length: totalStars }).map((_, i) => {
        const isFilled = i < earnedCount;
        const xml = isFilled
          ? buildStarSvg(size, STAR_COLORS.filled, STAR_COLORS.filled)
          : buildStarSvg(size, 'none', emptyColor);
        return <SvgXml key={i} xml={xml} width={size} height={size} />;
      })}
    </XStack>
  );
}
