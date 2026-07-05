import { LinearGradient } from 'expo-linear-gradient';

import { avatarIconFor } from '../config/avatars';
import { darkenColor, getContrastColor } from '../utils/colors';

import { FONT_FAMILIES, Text } from './Typography';

/**
 * The shared identity disc: the comments/leaderboard gradient circle, with an
 * optional user-chosen avatar mark on top. Avatar values are icon TOKENS from
 * the curated catalog (config/avatars) rendered as contrast-colored vector
 * icons; unknown non-empty values are legacy emoji rows and keep the old text
 * rendering. No avatar falls back to the screen name's initial — the
 * pre-avatar rendering, so every legacy user looks exactly as before.
 *
 * Color stays the caller's concern (name-hash palette in comments, medal hues
 * on the podium) so the disc reads consistently inside each host's system.
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
  const AvatarIcon = avatarIconFor(avatar);
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
        borderWidth: borderColor ? 2 : 0,
        borderColor: borderColor ?? 'transparent',
      }}
    >
      {AvatarIcon ? (
        <AvatarIcon
          size={size * 0.52}
          color={getContrastColor(color)}
          // Discs render tiny (leaderboard rows) to hero-size (profile): a
          // fixed stroke would read spindly large and clogged small, so scale
          // it gently against the 24pt viewBox baseline.
          strokeWidth={Math.min(2.6, Math.max(1.8, 48 / size))}
        />
      ) : avatar ? (
        // Legacy emoji rows (pre-icon catalog). Emoji glyphs carry their own
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
