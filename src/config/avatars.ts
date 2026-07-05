import {
  BookOpen,
  Brain,
  ChefHat,
  Crown,
  Dumbbell,
  Flame,
  Gamepad2,
  Globe,
  Heart,
  Leaf,
  Microscope,
  Moon,
  Music,
  Palette,
  PawPrint,
  Plane,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  Telescope,
  Zap,
} from '../components/icons';

/**
 * Curated avatar catalog — icon TOKENS, a MIRROR of AVATAR_TOKENS in the
 * backend (src/db/appUsers.ts). The server validates against its copy (values
 * render verbatim in other users' UIs, so it must never accept free text);
 * keep the two lists in sync. Additions are backward-safe, removals are not
 * (existing rows keep the value).
 *
 * Tokens are kebab-case lucide icon names rendered from the app's vendored
 * icon set (components/icons.tsx) — crisp vector marks that match the app's
 * icon language, instead of the OS-dependent emoji glyphs they replaced.
 * Legacy emoji values already stored on the server still render via
 * AvatarDisc's text fallback.
 */
export const AVATAR_ICONS = {
  rocket: Rocket,
  star: Star,
  flame: Flame,
  zap: Zap,
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
  globe: Globe,
  leaf: Leaf,
  'paw-print': PawPrint,
  heart: Heart,
  crown: Crown,
  shield: Shield,
  target: Target,
  'gamepad-2': Gamepad2,
  music: Music,
  palette: Palette,
  'book-open': BookOpen,
  brain: Brain,
  telescope: Telescope,
  microscope: Microscope,
  plane: Plane,
  'chef-hat': ChefHat,
  dumbbell: Dumbbell,
} as const;

export type AvatarToken = keyof typeof AVATAR_ICONS;

export const AVATAR_TOKENS = Object.keys(AVATAR_ICONS) as AvatarToken[];

/** The icon component for a stored avatar value, or undefined when the value
 * is absent or not a known token (legacy emoji rows). */
export function avatarIconFor(
  value: string | null | undefined
): (typeof AVATAR_ICONS)[AvatarToken] | undefined {
  return value ? AVATAR_ICONS[value as AvatarToken] : undefined;
}
