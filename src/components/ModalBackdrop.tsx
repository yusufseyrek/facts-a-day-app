import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { GlassSurface } from './GlassSurface';

/**
 * ModalBackdrop — the shared full-bleed scrim behind centered modals.
 *
 * Replaces the byte-identical `Platform.OS === 'ios' ? <BlurView/> : <rgba View/>`
 * blocks duplicated across FactModal's premium gate, the Trivia Intro/Exit
 * modals, and SatisfactionModal. Routes through {@link GlassSurface} so iOS 26
 * gets real Liquid Glass, iOS<26 keeps the exact BlurView intensity it had, and
 * Android keeps its exact rgba fill.
 *
 * IMPORTANT: `glassEffectStyle="regular"` does NOT dim. The BlurView (iOS<26)
 * and rgba (Android) fallback paths already provide their own dimming, so the
 * extra dim layer is painted ONLY when real Liquid Glass is active — keeping the
 * fallback paths byte-identical to the hardcoded scrims they replace.
 */

interface ModalBackdropProps {
  isDark: boolean;
  /** iOS<26 BlurView intensity for this specific modal (35 / 50 / 70 today). */
  blurIntensity: number;
  /** Opaque Android fill — pass the exact rgba the site used before. */
  androidScrim: string;
  /**
   * Dim overlay painted on top of real Liquid Glass only. Defaults to a light
   * theme-tuned scrim; override per site if a stronger/weaker dim is wanted.
   */
  dim?: string;
  /** Tap-to-dismiss handler. When provided, a full-bleed Pressable is rendered. */
  onPress?: () => void;
}

export function ModalBackdrop({
  isDark,
  blurIntensity,
  androidScrim,
  dim = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)',
  onPress,
}: ModalBackdropProps) {
  const glassActive = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    <>
      <GlassSurface
        variant="glass"
        isDark={isDark}
        tint={androidScrim}
        blurIntensity={blurIntensity}
        style={StyleSheet.absoluteFill}
      />
      {glassActive ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} pointerEvents="none" />
      ) : null}
      {onPress ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityRole="button" />
      ) : null}
    </>
  );
}
