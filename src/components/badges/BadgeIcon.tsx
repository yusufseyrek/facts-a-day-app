import React from 'react';

import { SvgXml } from 'react-native-svg';

import { LOCKED_OPACITY } from '../../config/badges';
import { BADGE_SVG_MAP } from '../../utils/badgeSvgs';

interface BadgeIconProps {
  badgeId: string;
  size: number;
  isUnlocked?: boolean;
}

export function BadgeIcon({ badgeId, size, isUnlocked = true }: BadgeIconProps) {
  const xml = BADGE_SVG_MAP[badgeId];
  if (!xml) return null;

  return (
    <SvgXml
      xml={xml}
      width={size}
      height={size}
      opacity={isUnlocked ? 1 : LOCKED_OPACITY}
    />
  );
}
