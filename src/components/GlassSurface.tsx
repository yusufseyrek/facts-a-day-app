import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleProp, View, ViewProps, ViewStyle } from 'react-native';

import { BlurTint,BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * GlassSurface — the single guarded fallback chain for translucent CHROME.
 *
 *   iOS 26 (Liquid Glass available)  -> <GlassView>           (real liquid glass)
 *   iOS < 26 / reduce-transparency   -> <BlurView>            (today's behavior)
 *   Android / variant 'solid'        -> <View backgroundColor> (Material tonal fill)
 *
 * Rules this primitive encodes:
 *  - Glass goes on FLOATING chrome only (tab bar, modal backdrops, sheet backing,
 *    toasts). Never under reading text and never inside a virtualized list.
 *  - Reduce-transparency users never get glass/blur (Apple HIG) — they fall to
 *    the opaque `tint` fill.
 *  - The app has its own light/dark toggle, so `colorScheme` is passed
 *    EXPLICITLY (GlassView otherwise defaults to the system 'auto').
 *
 * `tint` doubles as the GlassView tint color and the opaque fallback fill, so a
 * single theme token (e.g. colors.surface / colors.cardBackground, optionally at
 * reduced alpha) drives every layer.
 */

type GlassVariant = 'glass' | 'solid';

interface GlassSurfaceProps extends ViewProps {
  /** 'glass' = translucent chrome on capable iOS; 'solid' = always the opaque fill. */
  variant?: GlassVariant;
  isDark: boolean;
  /** Opaque fill used on Android / iOS<26 / 'solid' / reduce-transparency. */
  tint: string;
  /**
   * Tint applied to the GlassView layer on capable iOS. Should be LOW-alpha so
   * the refraction shows through (a fully opaque tint defeats the glass look).
   * Defaults to `tint` when omitted.
   */
  glassTint?: string;
  /** iOS<26 BlurView fallback intensity. Higher = more frosting. */
  blurIntensity?: number;
  /** Optional explicit BlurView tint; defaults to light/dark from `isDark`. */
  blurTint?: BlurTint;
  style?: StyleProp<ViewStyle>;
}

/** Tracks the iOS-only "Reduce Transparency" setting, live. No-op (false) elsewhere. */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduce
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

export function GlassSurface({
  variant = 'glass',
  isDark,
  tint,
  glassTint,
  blurIntensity = 50,
  blurTint,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const reduceTransparency = useReduceTransparency();

  const wantsGlass = variant === 'glass' && Platform.OS === 'ios';
  const canGlass = wantsGlass && isLiquidGlassAvailable() && !reduceTransparency;

  if (canGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={glassTint ?? tint}
        colorScheme={isDark ? 'dark' : 'light'}
        style={style}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  // iOS without Liquid Glass (older OS or reduce-transparency): keep frosted blur.
  if (wantsGlass && !reduceTransparency) {
    return (
      <BlurView
        intensity={blurIntensity}
        tint={blurTint ?? (isDark ? 'dark' : 'light')}
        style={style}
        {...rest}
      >
        {children}
      </BlurView>
    );
  }

  // Android, variant 'solid', or reduce-transparency: opaque Material tonal fill.
  return (
    <View style={[style, { backgroundColor: tint }]} {...rest}>
      {children}
    </View>
  );
}
