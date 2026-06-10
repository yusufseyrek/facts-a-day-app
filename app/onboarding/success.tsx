import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
  Svg,
} from 'react-native-svg';

import { Gift } from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, FONT_FAMILIES, GlassSurface, ScreenContainer, Text } from '../../src/components';
import { ADS_ENABLED } from '../../src/config/app';
import { useOnboarding } from '../../src/contexts';
import { useReduceMotion } from '../../src/hooks/useReduceMotion';
import { useTranslation } from '../../src/i18n';
import { completeConsentFlow, isConsentRequired } from '../../src/services/ads';
import { Screens, trackOnboardingComplete, trackScreenView } from '../../src/services/analytics';
import { warmUpHomeScreen } from '../../src/services/homeWarmup';
import * as notificationService from '../../src/services/notifications';
import { getNotificationTimes } from '../../src/services/onboarding';
import { getNeonColors, hexColors, useTheme } from '../../src/theme';
import { blendHexColors, hexToRgba } from '../../src/utils/colors';
import { useResponsive } from '../../src/utils/useResponsive';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Checkmark path in a 100x100 viewBox; CHECK_LENGTH is its measured stroke
// length (drawn via dashoffset, so it must cover the full path).
const CHECK_PATH = 'M30 53 L45 67 L71 39';
const CHECK_LENGTH = 60;

const BURST_DOT_COUNT = 12;

/** One radial burst dot, driven by a single shared progress value. */
const BurstDot = ({
  progress,
  angle,
  distance,
  size,
  color,
  centerOffset,
}: {
  progress: SharedValue<number>;
  angle: number;
  distance: number;
  size: number;
  color: string;
  centerOffset: number;
}) => {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.08, 0.7, 1], [0, 1, 0.9, 0]),
      transform: [
        { translateX: Math.cos(angle) * distance * p },
        { translateY: Math.sin(angle) * distance * p },
        { scale: interpolate(p, [0, 0.12, 1], [0.4, 1, 0.5]) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: centerOffset - size / 2,
          left: centerOffset - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
};

// Overshoot easing so each letter pops slightly past its resting spot
const LETTER_EASING = Easing.out(Easing.back(2));

/**
 * One letter of the welcome line. Rises and pops in over its own window of the
 * shared cascade progress; its color idles between two points on the cyan ->
 * green ramp (driven by breath) so the gradient appears to flow through the
 * text.
 */
const CascadeLetter = ({
  progress,
  breath,
  char,
  start,
  end,
  colorFrom,
  colorTo,
  glowColor,
  fontSize,
  lineHeight,
  rise,
}: {
  progress: SharedValue<number>;
  breath: SharedValue<number>;
  char: string;
  start: number;
  end: number;
  colorFrom: string;
  colorTo: string;
  glowColor: string;
  fontSize: number;
  lineHeight: number;
  rise: number;
}) => {
  const style = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [start, end], [0, 1], 'clamp');
    const eased = LETTER_EASING(p);
    return {
      opacity: p,
      color: interpolateColor(breath.value, [0, 1], [colorFrom, colorTo]),
      transform: [{ translateY: (1 - eased) * rise }, { scale: 0.9 + eased * 0.1 }],
    };
  });

  return (
    <Animated.Text
      allowFontScaling={false}
      style={[
        {
          fontFamily: FONT_FAMILIES.bold,
          fontSize,
          lineHeight,
          textShadowColor: glowColor,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 10,
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
};

const NAVIGATE_DELAY_MS = 3000;

// Max extra dwell after the animation while the home warm-up finishes.
const HOME_WARM_EXTRA_WAIT_MS = 2500;

export default function OnboardingSuccessScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { typography, iconSizes, spacing, radius, media } = useResponsive();
  const router = useRouter();
  const { completeOnboarding, selectedCategories } = useOnboarding();
  const reduceMotion = useReduceMotion();

  const [showConsent, setShowConsent] = useState(false);
  const [consentDone, setConsentDone] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [_flowComplete, setFlowComplete] = useState(false);

  const neon = getNeonColors(theme);

  // Badge disc, the gradient ring around it, and the stage they live on
  const badgeSize = iconSizes.heroLg * 2 + spacing.md;
  const ringGap = spacing.lg;
  const ringStroke = 3.5;
  const ringSize = badgeSize + ringGap * 2;
  const areaSize = ringSize + spacing.xl * 2;
  const ringRadius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const consentIconSize = iconSizes.hero + spacing.xl;

  // Track screen view and kick off the flow
  useEffect(() => {
    trackScreenView(Screens.ONBOARDING_SUCCESS);
    runFlow();
  }, []);

  const consentResolveRef = useRef<(() => void) | null>(null);

  const runFlow = async () => {
    // Start rendering the home screen's world immediately, in the background:
    // prefetch its queries and first-card images while the user watches the
    // consent/success animation. By navigation time the home screen mounts
    // straight into a fully painted first frame. Never rejects.
    const homeWarm = warmUpHomeScreen(locale);

    // Step 1: Handle consent first (download continues in background)
    try {
      await handleConsent();
    } catch (error) {
      console.error('Error in consent:', error);
    }

    // Step 2: Animation is now visible — start the minimum display timer
    const animationTimer = new Promise<void>((resolve) => setTimeout(resolve, NAVIGATE_DELAY_MS));

    const save = (async () => {
      try {
        await completeOnboarding();
      } catch (error) {
        console.error('Error completing onboarding:', error);
      }
    })();

    // Fire-and-forget after onboarding is saved: register for push + analytics.
    save.then(() => {
      notificationService.registerForPush(locale).catch((error) => {
        console.error('Post-onboarding push registration failed:', error);
      });

      getNotificationTimes().then((notificationTimes) => {
        trackOnboardingComplete({
          locale,
          categoriesCount: selectedCategories.length,
          notificationsEnabled: notificationTimes !== null && notificationTimes.length > 0,
        });
      });
    });

    // Wait for the animation timer and the onboarding save.
    await Promise.all([animationTimer, save]);

    setFlowComplete(true);

    // Navigate as soon as the home warm-up lands — usually it already finished
    // under the animation, so this is instant. The cap bounds a dead network:
    // past it, home shows its own loading states, same as without warming.
    await Promise.race([
      homeWarm,
      new Promise<void>((resolve) => setTimeout(resolve, HOME_WARM_EXTRA_WAIT_MS)),
    ]);
    router.replace('/');
  };

  const handleConsent = async () => {
    if (!ADS_ENABLED) {
      setConsentDone(true);
      return;
    }

    try {
      const gdprRequired = await isConsentRequired();

      if (gdprRequired) {
        setShowConsent(true);
        await new Promise<void>((resolve) => {
          consentResolveRef.current = resolve;
        });
        setShowConsent(false);
      } else {
        await completeConsentFlow();
      }
    } catch (error) {
      console.error('Error checking consent:', error);
    }
    setConsentDone(true);
  };

  const handleConsentContinue = async () => {
    setConsentLoading(true);
    try {
      await completeConsentFlow();
    } catch (error) {
      console.error('Error during consent flow:', error);
    }
    consentResolveRef.current?.();
  };

  // === Animation values ===
  // badgeIn: disc spring-in. ring/check: SVG stroke draws. halo/burst: the
  // single celebration pulse. breath: idle loop (badge scale + welcome-line
  // gradient flow). title: rise + fade. welcomeIn: letter cascade progress.
  const badgeIn = useSharedValue(0);
  const ring = useSharedValue(0);
  const check = useSharedValue(0);
  const halo = useSharedValue(0);
  const burst = useSharedValue(0);
  const breath = useSharedValue(0);
  const titleIn = useSharedValue(0);
  const underlineIn = useSharedValue(0);
  const welcomeIn = useSharedValue(0);

  // Choreography: disc + ring (0ms) -> check draws (380ms) -> haptic, halo and
  // burst fire as the check lands (~830ms) -> title rises, underline draws,
  // welcome line cascades in letter by letter -> idle breathing (from 1000ms).
  useEffect(() => {
    if (!consentDone) return;

    if (reduceMotion) {
      badgeIn.value = 1;
      ring.value = 1;
      check.value = 1;
      titleIn.value = 1;
      underlineIn.value = 1;
      welcomeIn.value = 1;
      return;
    }

    badgeIn.value = withSpring(1, { damping: 14, stiffness: 140 });
    ring.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    check.value = withDelay(
      380,
      withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) })
    );
    halo.value = withDelay(830, withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) }));
    burst.value = withDelay(830, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
    breath.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
    titleIn.value = withDelay(850, withSpring(1, { damping: 16, stiffness: 120 }));
    underlineIn.value = withDelay(
      1000,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    // Linear master clock for the cascade; each letter applies its own
    // overshoot easing inside its window.
    welcomeIn.value = withDelay(1050, withTiming(1, { duration: 900, easing: Easing.linear }));

    const hapticTimer = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 830);

    return () => {
      clearTimeout(hapticTimer);
      cancelAnimation(breath);
    };
  }, [consentDone, reduceMotion]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - ring.value),
  }));

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - check.value),
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(badgeIn.value, [0, 1], [0, 1], 'clamp'),
    transform: [
      { scale: interpolate(badgeIn.value, [0, 1], [0.6, 1]) * (1 + breath.value * 0.02) },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 0.12, 1], [0, 0.5, 0]),
    transform: [{ scale: 1 + halo.value * 0.8 }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(titleIn.value, [0, 1], [0, 1], 'clamp'),
    transform: [{ translateY: (1 - titleIn.value) * spacing.lg }],
  }));

  // Gradient underline draws out from the center beneath the title
  const underlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(underlineIn.value, [0, 1], [0, 1], 'clamp'),
    transform: [{ scaleX: interpolate(underlineIn.value, [0, 1], [0.15, 1]) }],
  }));

  // Welcome line split into words of letters. Each letter gets its position on
  // the cyan -> green ramp (colorFrom) and the mirrored position (colorTo) so
  // breath makes the gradient sweep back and forth, plus a stagger window for
  // the cascade. Spaces are skipped but keep their slot, giving a natural
  // pause between words.
  const welcomeFontSize = typography.fontSize.title;
  const welcomeWords = useMemo(() => {
    const chars = Array.from(t('welcomeToApp'));
    const total = chars.length;
    const ramp = (pos: number) => blendHexColors(neon.green, neon.cyan, pos);
    const words: {
      char: string;
      colorFrom: string;
      colorTo: string;
      start: number;
      end: number;
    }[][] = [[]];
    chars.forEach((char, i) => {
      if (char === ' ') {
        if (words[words.length - 1].length > 0) words.push([]);
        return;
      }
      const pos = total > 1 ? i / (total - 1) : 0.5;
      const start = (i / total) * 0.7;
      words[words.length - 1].push({
        char,
        colorFrom: ramp(pos),
        colorTo: ramp(1 - pos),
        start,
        end: start + 0.3,
      });
    });
    return words.filter((word) => word.length > 0);
  }, [locale, neon, t]);

  // Deterministic radial burst: evenly spread angles with small per-dot
  // variation in distance and size so it reads organic, not mechanical.
  const burstDots = useMemo(() => {
    const palette = [neon.cyan, neon.green, neon.yellow, neon.magenta, neon.purple, neon.orange];
    const baseDistance = ringSize / 2 + spacing.lg;
    return Array.from({ length: BURST_DOT_COUNT }, (_, i) => ({
      angle: (i / BURST_DOT_COUNT) * Math.PI * 2 + (i % 2 === 0 ? 0.12 : -0.08),
      distance: baseDistance * (1 + ((i * 7) % 5) / 10),
      size: 5 + (i % 3) * 2,
      color: palette[i % palette.length],
    }));
  }, [neon, ringSize, spacing.lg]);

  const darkColors = [hexColors.dark.background, '#0F1E36', '#1A3D5C'] as const;
  const lightColors = [hexColors.light.background, '#E0F7FF', '#D0EFFF'] as const;
  const gradientColors = theme === 'dark' ? darkColors : lightColors;

  // Consent screen — shown as full screen before animation
  const renderConsentScreen = () => (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
        paddingBottom: spacing.xl + spacing.sm,
      }}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
    >
      <YStack alignItems="center" gap={spacing.lg} paddingHorizontal={spacing.md}>
        <YStack
          width={consentIconSize}
          height={consentIconSize}
          borderRadius={radius.full}
          backgroundColor={theme === 'dark' ? '$primaryLight' : '#D4F1FF'}
          alignItems="center"
          justifyContent="center"
          marginBottom={spacing.md}
        >
          <Gift
            size={iconSizes.hero}
            color={theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.neonCyan}
            strokeWidth={2}
          />
        </YStack>
        <Text.Headline textAlign="center" color="$text" letterSpacing={-0.5}>
          {t('adsConsentTitle')}
        </Text.Headline>
        <Text.Body textAlign="center" color="$textSecondary">
          {t('adsConsentMessage')}
        </Text.Body>
        <YStack
          width="100%"
          paddingTop={spacing.lg}
          justifyContent="center"
          height={media.buttonHeight}
        >
          {consentLoading ? (
            <ActivityIndicator
              size="large"
              color={theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.neonCyan}
            />
          ) : (
            <Button onPress={handleConsentContinue}>{t('adsConsentButton')}</Button>
          )}
        </YStack>
      </YStack>
    </ScrollView>
  );

  // Success animation: glass disc with a self-drawing check, gradient ring,
  // one halo pulse + dot burst, then rising text.
  const renderAnimationScreen = () => (
    <YStack
      padding={spacing.xl}
      gap={spacing.lg}
      flex={1}
      justifyContent="center"
      alignItems="center"
    >
      <YStack alignItems="center" gap={spacing.xl}>
        <View
          style={{
            width: areaSize,
            height: areaSize,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Halo pulse — a single soft ring expanding past the badge */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                borderWidth: 1.5,
                borderColor: neon.cyan,
              },
              haloStyle,
            ]}
          />

          {burstDots.map((dot, index) => (
            <BurstDot
              key={index}
              progress={burst}
              angle={dot.angle}
              distance={dot.distance}
              size={dot.size}
              color={dot.color}
              centerOffset={areaSize / 2}
            />
          ))}

          <Animated.View
            style={[
              badgeStyle,
              {
                shadowColor: neon.cyan,
                shadowOffset: { width: 0, height: spacing.sm },
                shadowOpacity: theme === 'dark' ? 0.35 : 0.18,
                shadowRadius: spacing.xl,
                elevation: 10,
              },
            ]}
          >
            <View style={{ width: ringSize, height: ringSize }}>
              {/* Gradient ring drawing around the disc */}
              <Svg width={ringSize} height={ringSize}>
                <Defs>
                  <SvgLinearGradient id="successRing" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={neon.cyan} />
                    <Stop offset="100%" stopColor={neon.green} />
                  </SvgLinearGradient>
                </Defs>
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                  strokeWidth={ringStroke}
                  fill="none"
                />
                <AnimatedCircle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke="url(#successRing)"
                  strokeWidth={ringStroke}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${circumference} ${circumference}`}
                  animatedProps={ringProps}
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </Svg>

              {/* Glass disc with the self-drawing checkmark */}
              <View
                style={{
                  position: 'absolute',
                  top: ringGap,
                  left: ringGap,
                  width: badgeSize,
                  height: badgeSize,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <GlassSurface
                  variant="glass"
                  isDark={theme === 'dark'}
                  tint={hexColors[theme].primaryLight}
                  glassTint={hexToRgba(neon.cyan, 0.12)}
                  borderRadius={badgeSize / 2}
                  style={StyleSheet.absoluteFill}
                />
                <Svg width={badgeSize * 0.58} height={badgeSize * 0.58} viewBox="0 0 100 100">
                  <AnimatedPath
                    d={CHECK_PATH}
                    stroke={neon.green}
                    strokeWidth={9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray={`${CHECK_LENGTH} ${CHECK_LENGTH}`}
                    animatedProps={checkProps}
                  />
                </Svg>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Title with neon glow, gradient underline, then cascading welcome line */}
        <YStack alignItems="center" gap={spacing.md}>
          <Animated.View style={titleStyle}>
            <Text.Headline
              fontSize={typography.fontSize.display}
              fontFamily={FONT_FAMILIES.extrabold}
              textAlign="center"
              color="$text"
              letterSpacing={typography.letterSpacing.display}
              lineHeight={typography.lineHeight.display}
              style={{
                textShadowColor: hexToRgba(neon.cyan, theme === 'dark' ? 0.45 : 0.2),
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 16,
              }}
            >
              {t('allSet')}
            </Text.Headline>
          </Animated.View>

          {/* Underline picks up the ring's cyan -> green gradient */}
          <Animated.View style={underlineStyle}>
            <LinearGradient
              colors={[neon.cyan, neon.green]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                width: spacing.xxl * 2,
                height: spacing.xs,
                borderRadius: radius.full,
              }}
            />
          </Animated.View>

          {/* Welcome line: gradient letters cascading in, glow per letter */}
          <XStack
            flexWrap="wrap"
            justifyContent="center"
            columnGap={welcomeFontSize * 0.3}
            rowGap={spacing.xs}
            paddingHorizontal={spacing.lg}
          >
            {welcomeWords.map((word, wordIndex) => (
              <XStack key={wordIndex}>
                {word.map((letter, letterIndex) => (
                  <CascadeLetter
                    key={letterIndex}
                    progress={welcomeIn}
                    breath={breath}
                    char={letter.char}
                    start={letter.start}
                    end={letter.end}
                    colorFrom={letter.colorFrom}
                    colorTo={letter.colorTo}
                    glowColor={hexToRgba(letter.colorFrom, theme === 'dark' ? 0.4 : 0.18)}
                    fontSize={welcomeFontSize}
                    lineHeight={typography.lineHeight.title}
                    rise={spacing.lg}
                  />
                ))}
              </XStack>
            ))}
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );

  return (
    <LinearGradient
      colors={gradientColors}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScreenContainer>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        {showConsent ? renderConsentScreen() : consentDone && renderAnimationScreen()}
      </ScreenContainer>
    </LinearGradient>
  );
}
