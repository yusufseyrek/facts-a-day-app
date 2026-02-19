import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';

import { STAR_COLORS, TIER_TO_STAR_INDEX, type BadgeTier } from '../../config/badges';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { useResponsive } from '../../utils/useResponsive';

import { BadgeIcon } from './BadgeIcon';
import { StarRating } from './StarRating';
import { FONT_FAMILIES, Text } from '../Typography';

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
    tier?: BadgeTier;
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

  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!badge) return;

    console.log('🏅 [BadgeToast] Showing toast for:', badge.name, badge.tier);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    translateY.setValue(-200);
    opacity.setValue(0);
    spin.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Slow continuous rotation for the sunburst
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    ).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -200, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => onHideRef.current());
    }, 3000);
    return () => clearTimeout(timer);
  }, [badge]);

  if (!badge) return null;

  const starCount = badge.tier ? TIER_TO_STAR_INDEX[badge.tier] + 1 : 3;
  const iconSize = Math.round(iconSizes.heroLg);
  const accentColor = STAR_COLORS.filled;
  const burstSize = iconSize + spacing.lg;
  const sunburstXml = buildShineSvg(
    burstSize,
    hexToRgba(accentColor, 0.3),
    hexToRgba(accentColor, 0.05)
  );

  const spinRotation = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
          left: spacing.lg,
          right: spacing.lg,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          Animated.parallel([
            Animated.timing(translateY, { toValue: -200, duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => {
            onHideRef.current();
            onPress?.();
          });
        }}
      >
      <XStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        overflow="hidden"
        alignItems="stretch"
        shadowColor={accentColor}
        shadowOffset={{ width: 0, height: 4 }}
        shadowOpacity={theme === 'dark' ? 0.35 : 0.15}
        shadowRadius={12}
        elevation={10}
        borderWidth={1}
        borderColor={`${accentColor}20`}
      >
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
            <Animated.View
              style={{
                position: 'absolute',
                transform: [{ rotate: spinRotation }],
              }}
            >
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
});
