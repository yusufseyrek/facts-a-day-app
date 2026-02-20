import React, { useMemo } from 'react';

import { SvgXml } from 'react-native-svg';

import { BADGE_SVG_MAP } from '../../utils/badgeSvgs';

function makeGrayscale(xml: string): string {
  const filterDef =
    '<defs><filter id="__gs"><feColorMatrix type="saturate" values="0"/></filter></defs>';
  return xml
    .replace(/(<svg[^>]*>)/, `$1${filterDef}<g filter="url(#__gs)">`)
    .replace(/<\/svg>\s*$/, '</g></svg>');
}

interface BadgeIconProps {
  badgeId: string;
  size: number;
  isUnlocked?: boolean;
}

export function BadgeIcon({ badgeId, size, isUnlocked = true }: BadgeIconProps) {
  const xml = BADGE_SVG_MAP[badgeId];

  const grayscaleXml = useMemo(() => (xml ? makeGrayscale(xml) : null), [xml]);

  if (!xml) return null;

  return (
    <SvgXml xml={isUnlocked ? xml : grayscaleXml!} width={size} height={size} />
  );
}
