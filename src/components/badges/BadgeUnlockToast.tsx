import { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { type BadgeStar, STAR_COLORS } from '../../config/badges';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { GlassSurface } from '../GlassSurface';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import { BadgeIcon } from './BadgeIcon';
import { StarRating } from './StarRating';

const HIDDEN_TRANSLATE_Y = -200;
const SPRING_IN = { duration: 350, dampingRatio: 0.8 } as const;
const AUTO_HIDE_MS = 3000;
const SPIN_DURATION_MS = 8000;

function buildShineSvg(size: number, color: string, colorFade: string): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.5;

  // Soft radial glow
  const glow = `<defs>
    <radialGradient id="glow"><stop offset="0%" stop-color="${color}"/><stop offset="60%" stop-color="${colorFade}"/><stop offset="100%" stop-color="${colorFade}" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glow)"/>`;

  // Soft cross-shaped shine streaks (4 main + 4 diagonal)
  const streaks = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const len = r * 0.95;
      const width = deg % 90 === 0 ? 2.5 : 1.5; // main streaks thicker
      const opacity = deg % 90 === 0 ? 0.6 : 0.3;
      const x1 = cx + len * Math.cos(rad);
      const y1 = cy + len * Math.sin(rad);
      const x2 = cx - len * Math.cos(rad);
      const y2 = cy - len * Math.sin(rad);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
    })
    .join('');

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${glow}${streaks}</svg>`;
}

interface BadgeUnlockToastProps {
  badge: {
    badgeId?: string;
    name?: string;
    star?: BadgeStar;
  } | null;
  onHide: () => void;
  onPress?: () => void;
}

export function BadgeUnlockToast({ badge, onHide, onPress }: BadgeUnlockToastProps) {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes } = useResponsive();
  const { t } = useTranslation();
  const colors = hexColors[theme];
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(HIDDEN_TRANSLATE_Y);
  const opacity = useSharedValue(0);
  const spin = useSharedValue(0);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  const finishHide = useCallback(() => {
    onHideRef.current();
  }, []);

  const finishPress = useCallback(() => {
    onHideRef.current();
    onPress?.();
  }, [onPress]);

  useEffect(() => {
    if (!badge) return;

    if (__DEV__) console.log('🏅 [BadgeToast] Showing toast for:', badge.name, badge.star);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    translateY.value = HIDDEN_TRANSLATE_Y;
    opacity.value = 0;
    spin.value = 0;

    translateY.value = withSpring(0, SPRING_IN);
    opacity.value = withTiming(1, { duration: 200 });

    // Slow continuous rotation for the sunburst
    spin.value = withRepeat(
      withTiming(1, { duration: SPIN_DURATION_MS, easing: Easing.linear }),
      -1,
      false
    );

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 250 });
      translateY.value = withTiming(HIDDEN_TRANSLATE_Y, { duration: 250 }, (finished) => {
        if (finished) runOnJS(finishHide)();
      });
    }, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [badge, finishHide, opacity, spin, translateY]);

  const handlePress = useCallback(() => {
    opacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(HIDDEN_TRANSLATE_Y, { duration: 200 }, (finished) => {
      if (finished) runOnJS(finishPress)();
    });
  }, [finishPress, opacity, translateY]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  if (!badge) return null;

  const starCount = badge.star ? parseInt(badge.star.replace('star', '')) : 3;
  const iconSize = Math.round(iconSizes.heroLg);
  const accentColor = STAR_COLORS.filled;
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const burstSize = iconSize + spacing.lg;
  const sunburstXml = buildShineSvg(
    burstSize,
    hexToRgba(accentColor, 0.3),
    hexToRgba(accentColor, 0.05)
  );

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
          left: spacing.lg,
          right: spacing.lg,
        },
        cardStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable onPress={handlePress}>
        <XStack
          backgroundColor={useGlass ? 'transparent' : colors.cardBackground}
          borderRadius={radius.xl}
          overflow="hidden"
          alignItems="stretch"
          // Liquid glass floats via its material (specular rim), not a drop
          // shadow — the gold glow stays on the opaque fallback card only.
          shadowColor={useGlass ? undefined : accentColor}
          shadowOffset={useGlass ? undefined : { width: 0, height: 4 }}
          shadowOpacity={useGlass ? undefined : theme === 'dark' ? 0.35 : 0.15}
          shadowRadius={useGlass ? undefined : 12}
          elevation={useGlass ? undefined : 10}
          borderWidth={1}
          borderColor={`${accentColor}20`}
        >
          {/* iOS 26: Liquid Glass card backing — same composition as the
              badges screen's glass panels (transparent card + absolute-fill
              surface shaped to the card's radius). */}
          {useGlass && (
            <GlassSurface
              variant="glass"
              isDark={theme === 'dark'}
              tint={colors.cardBackground}
              glassTint={hexToRgba(colors.cardBackground, theme === 'dark' ? 0.6 : 0.65)}
              borderRadius={radius.xl}
              style={absoluteFillObject}
              pointerEvents="none"
            />
          )}

          {/* Left accent gradient bar */}
          <LinearGradient
            colors={[accentColor, hexToRgba(accentColor, 0.6)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ width: 4 }}
          />

          <XStack flex={1} padding={spacing.md} gap={spacing.md} alignItems="center">
            {/* Icon with sunburst */}
            <View
              style={{
                width: burstSize,
                height: burstSize,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Animated.View style={[styles.sunburst, spinStyle]}>
                <SvgXml xml={sunburstXml} width={burstSize} height={burstSize} />
              </Animated.View>
              {badge.badgeId && <BadgeIcon badgeId={badge.badgeId} size={iconSize} />}
            </View>

            {/* Text */}
            <YStack flex={1} gap={spacing.xs}>
              <Text.Label color={accentColor} fontFamily={FONT_FAMILIES.bold}>
                {t('badgeEarned')}
              </Text.Label>
              <Text.Body color={colors.text} fontFamily={FONT_FAMILIES.semibold} numberOfLines={1}>
                {badge.name}
              </Text.Body>
              <StarRating earnedCount={starCount} size={iconSizes.sm} gap={spacing.xs} />
            </YStack>
          </XStack>
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99999,
    ...Platform.select({
      android: { elevation: 99999 },
    }),
  },
  sunburst: {
    position: 'absolute',
  },
});
