import { SvgXml } from 'react-native-svg';

import { LinearGradient } from 'expo-linear-gradient';

import { avatarXmlFor } from '../config/avatars';
import { darkenColor, getContrastColor } from '../utils/colors';

import { FONT_FAMILIES, Text } from './Typography';

/** Catalog-shaped values (kebab-case tokens) that aren't in the catalog —
 * e.g. rows written by a newer app version. These must never text-render. */
const TOKEN_SHAPE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The shared identity disc: the comments/leaderboard gradient circle, with an
 * optional user-chosen avatar on top. Avatar values are TOKENS from the
 * curated DiceBear catalog (config/avatars), pre-rendered SVG drawn full-bleed
 * and clipped to the disc. Unknown values degrade by shape: token-shaped ones
 * (a newer client's catalog additions) fall back to the name initial, while
 * anything else is a legacy emoji row and keeps the old text rendering. No
 * avatar falls back to the screen name's initial — the pre-avatar rendering,
 * so every legacy user looks exactly as before.
 *
 * Color stays the caller's concern (identityColor in comments/leaderboard
 * rows, medal hues on the podium) so the disc reads consistently inside each
 * host's system.
 */
export function AvatarDisc({
  name,
  avatar,
  color,
  size,
  borderColor,
}: {
  name: string;
  avatar?: string | null;
  color: string;
  size: number;
  borderColor?: string;
}) {
  const xml = avatarXmlFor(avatar);
  return (
    <LinearGradient
      colors={[color, darkenColor(color, 0.22)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        // Clip the square avatar art to the circle.
        overflow: 'hidden',
        borderWidth: borderColor ? 2 : 0,
        borderColor: borderColor ?? 'transparent',
      }}
    >
      {xml ? (
        <SvgXml xml={xml} width={size} height={size} />
      ) : avatar && !TOKEN_SHAPE_RE.test(avatar) ? (
        // Legacy emoji rows (pre-token catalog). Emoji glyphs carry their own
        // visual padding, so they sit larger than the initial. Explicit
        // lineHeight stops Android's font padding from nudging the glyph
        // off-center at small sizes.
        <Text
          fontSize={size * 0.52}
          lineHeight={size * 0.62}
          textAlign="center"
          maxFontSizeMultiplier={1}
        >
          {avatar}
        </Text>
      ) : (
        <Text
          fontFamily={FONT_FAMILIES.bold}
          fontSize={size * 0.4}
          color={getContrastColor(color)}
          maxFontSizeMultiplier={1}
        >
          {(name[0] || '?').toUpperCase()}
        </Text>
      )}
    </LinearGradient>
  );
}
