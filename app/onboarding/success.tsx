import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { styled } from '@tamagui/core';
import { CheckCircle, Gift, Sparkle, Star } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, FONT_FAMILIES, Text } from '../../src/components';
import { ADS_ENABLED } from '../../src/config/app';
import { useOnboarding } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import { completeConsentFlow, isConsentRequired } from '../../src/services/ads';
import { Screens, trackOnboardingComplete, trackScreenView } from '../../src/services/analytics';
import { loadDailyFeedSections } from '../../src/services/dailyFeed';
import * as database from '../../src/services/database';
import * as notificationService from '../../src/services/notifications';
import { getNotificationTimes } from '../../src/services/onboarding';
import { getNeonColors, hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

type ScreenState = 'loading' | 'animation' | 'consent';

const Container = styled(SafeAreaView, {
  flex: 1,
});

// Particle component for confetti effect
const Particle = ({ delay, index }: { delay: number; index: number }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -150 - Math.random() * 100],
  });

  const translateX = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, (Math.random() - 0.5) * 150, (Math.random() - 0.5) * 200],
  });

  const scale = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1.2, 0],
  });

  const opacity = animatedValue.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  const rotate = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${360 + Math.random() * 360}deg`],
  });

  const neonColors = getNeonColors(theme);
  const colors = [
    neonColors.cyan,
    neonColors.green,
    neonColors.yellow,
    neonColors.magenta,
    neonColors.purple,
    neonColors.orange,
  ];
  const particleColor = colors[index % colors.length];
  const ParticleIcon = index % 3 === 0 ? Star : Sparkle;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        transform: [{ translateX }, { translateY }, { scale }, { rotate }],
        opacity,
      }}
    >
      <ParticleIcon size={20 + Math.random() * 10} color={particleColor} fill={particleColor} />
    </Animated.View>
  );
};

// Ring pulse animation component
const PulseRing = ({
  delay,
  theme,
  size,
  borderWidth,
}: {
  delay: number;
  theme: 'light' | 'dark';
  size: number;
  borderWidth: number;
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const ringColor = theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.neonCyan;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 2.5,
            duration: 2000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth,
        borderColor: ringColor,
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    />
  );
};

// Progress bar — driven by real download progress (0–1)
const ProgressBar = ({
  progress,
  theme,
  barWidth,
  barHeight,
  barRadius,
  marginTop,
}: {
  progress: number;
  theme: 'light' | 'dark';
  barWidth: number;
  barHeight: number;
  barRadius: number;
  marginTop: number;
}) => {
  const initialProgress = useRef(progress).current;
  const widthAnim = useRef(new Animated.Value(initialProgress)).current;
  const barColor = theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.neonCyan;
  const bgColor = theme === 'dark' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(0, 153, 204, 0.1)';

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={{
        width: barWidth,
        height: barHeight,
        backgroundColor: bgColor,
        borderRadius: barRadius,
        overflow: 'hidden',
        marginTop,
      }}
    >
      <Animated.View
        style={{
          width,
          height: '100%',
          backgroundColor: barColor,
          borderRadius: barRadius,
        }}
      />
    </View>
  );
};

const SLOW_DOWNLOAD_THRESHOLD_MS = 5000;
const NAVIGATE_DELAY_MS = 3000;

export default function OnboardingSuccessScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { screenWidth, typography, iconSizes, spacing, radius, borderWidths } = useResponsive();
  const router = useRouter();
  const {
    completeOnboarding,
    selectedCategories,
    isDownloadingFacts,
    downloadProgress,
    waitForDownloadComplete,
  } = useOnboarding();

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [flowComplete, setFlowComplete] = useState(false);

  // Responsive icon container size — derives from heroLg icon + padding
  const iconContainerSize = iconSizes.heroLg * 2 + spacing.md;
  const iconAreaSize = iconContainerSize + spacing.xl * 2;
  const consentIconSize = iconSizes.hero + spacing.xl;

  // Slow download timer — starts on mount, shows message if still downloading after threshold
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    slowTimerRef.current = setTimeout(() => {
      if (!flowComplete) {
        setShowSlowMessage(true);
      }
    }, SLOW_DOWNLOAD_THRESHOLD_MS);
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  // Hide slow message once flow completes
  useEffect(() => {
    if (flowComplete) {
      setShowSlowMessage(false);
    }
  }, [flowComplete]);

  // Track screen view and kick off the flow
  useEffect(() => {
    trackScreenView(Screens.ONBOARDING_SUCCESS);
    runFlow();
  }, []);

  const runFlow = async () => {
    try {
      // Step 1: Handle consent FIRST (before animation)
      await handleConsent();

      // Step 2: Consent done — switch to animation screen
      setConsentChecked(true);
      setScreenState('animation');

      // Step 3: Wait for download if still in progress
      if (isDownloadingFacts) {
        await waitForDownloadComplete();
      }

      setFlowComplete(true);

      // Step 4: Finish onboarding
      await finishOnboarding();
    } catch (error) {
      console.error('Error in success flow:', error);
      setConsentChecked(true);
      setScreenState('animation');
      setFlowComplete(true);
      await finishOnboarding();
    }
  };

  const handleConsent = async () => {
    if (!ADS_ENABLED) return;

    try {
      const gdprRequired = await isConsentRequired();

      if (gdprRequired) {
        setScreenState('consent');
        await new Promise<void>((resolve) => {
          consentResolveRef.current = resolve;
        });
      } else {
        await completeConsentFlow();
      }
    } catch (error) {
      console.error('Error checking consent:', error);
    }
  };

  const consentResolveRef = useRef<(() => void) | null>(null);

  const handleConsentContinue = async () => {
    setConsentLoading(true);
    try {
      await completeConsentFlow();
    } catch (error) {
      console.error('Error during consent flow:', error);
    }
    consentResolveRef.current?.();
  };

  const finishOnboarding = async () => {
    if (isFinishing) return;
    setIsFinishing(true);

    try {
      await completeOnboarding();

      // Fire-and-forget: sync notifications to OS
      notificationService.ensureNotificationSchedule(locale, 'cold_start').catch((error) => {
        console.error('Post-onboarding notification sync failed:', error);
      });

      // Track completion
      const notificationTimes = await getNotificationTimes();
      const notificationsEnabled = notificationTimes !== null && notificationTimes.length > 0;
      trackOnboardingComplete({
        locale,
        categoriesCount: selectedCategories.length,
        notificationsEnabled,
      });

      // Pre-load home screen data in background while animation plays
      Promise.all([
        loadDailyFeedSections(locale, true),
        database.getAllCategories(),
        database.getUnseenStoryStatus(selectedCategories, locale),
      ]).catch((error) => {
        console.error('Failed to pre-load home screen data:', error);
      });

      // Navigate to main app after showing success animation
      setTimeout(() => {
        router.replace('/');
      }, NAVIGATE_DELAY_MS);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setTimeout(() => {
        router.replace('/');
      }, NAVIGATE_DELAY_MS);
    }
  };

  // === Animation values ===
  const iconDropAnim = useRef(new Animated.Value(0)).current;
  const iconPulseAnim = useRef(new Animated.Value(1)).current;
  const mainIconRotate = useRef(new Animated.Value(0)).current;
  const mainIconOpacity = useRef(new Animated.Value(0)).current;
  const consentOpacity = useRef(new Animated.Value(1)).current;

  const titleWords = t('allSet').split(' ');
  const wordAnimations = useRef(
    titleWords.map(() => ({
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.5),
      translateY: new Animated.Value(20),
    }))
  ).current;

  const subtextOpacity = useRef(new Animated.Value(0)).current;
  const subtextTranslateY = useRef(new Animated.Value(spacing.xl)).current;
  const progressOpacity = useRef(new Animated.Value(0)).current;
  const slowMessageOpacity = useRef(new Animated.Value(0)).current;

  // Start animations only when transitioning TO animation (not on initial mount)
  const animationsStarted = useRef(false);
  useEffect(() => {
    if (screenState !== 'animation' || animationsStarted.current) return;
    if (!consentChecked) return;
    animationsStarted.current = true;

    Animated.sequence([
      // Phase 1: Icon drop with bounce
      Animated.parallel([
        Animated.spring(iconDropAnim, {
          toValue: 1,
          tension: 30,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(mainIconOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(mainIconRotate, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
      ]),
      // Phase 2: Title + subtitle + progress bar
      Animated.parallel([
        ...wordAnimations.map((wordAnim, index) =>
          Animated.parallel([
            Animated.spring(wordAnim.opacity, {
              toValue: 1,
              delay: index * 100,
              useNativeDriver: true,
            }),
            Animated.spring(wordAnim.scale, {
              toValue: 1,
              tension: 40,
              friction: 6,
              delay: index * 100,
              useNativeDriver: true,
            }),
            Animated.spring(wordAnim.translateY, {
              toValue: 0,
              tension: 40,
              friction: 6,
              delay: index * 100,
              useNativeDriver: true,
            }),
          ])
        ),
        Animated.sequence([
          Animated.delay(titleWords.length * 100 + 200),
          Animated.parallel([
            Animated.timing(subtextOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.spring(subtextTranslateY, {
              toValue: 0,
              tension: 40,
              friction: 8,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.sequence([
          Animated.delay(1000),
          Animated.timing(progressOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    // Continuous pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulseAnim, {
          toValue: 1.05,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(iconPulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [screenState, consentChecked]);

  // Animate slow message in/out
  useEffect(() => {
    Animated.timing(slowMessageOpacity, {
      toValue: showSlowMessage ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [showSlowMessage]);

  // Icon interpolations
  const iconTranslateY = iconDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 0],
  });
  const iconDropScale = iconDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const iconRotate = mainIconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '0deg'],
  });

  const particles = useMemo(
    () => Array.from({ length: 15 }, (_, i) => <Particle key={i} index={i} delay={300 + i * 50} />),
    []
  );

  const darkColors = [hexColors.dark.background, '#0F1E36', '#1A3D5C'] as const;
  const lightColors = [hexColors.light.background, '#E0F7FF', '#D0EFFF'] as const;
  const gradientColors = theme === 'dark' ? darkColors : lightColors;

  // Download progress for the progress bar (0–1)
  const currentProgress = flowComplete ? 1 : (downloadProgress?.percentage ?? 0) / 100;

  // Consent screen
  const renderConsentScreen = () => (
    <Animated.View style={{ flex: 1, opacity: consentOpacity }}>
      <YStack
        padding={spacing.xl}
        gap={spacing.lg}
        flex={1}
        justifyContent="center"
        alignItems="center"
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
          <YStack width="100%" paddingTop={spacing.lg}>
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
      </YStack>
    </Animated.View>
  );

  // Animation screen (progress bar reflects download)
  const renderAnimationScreen = () => (
    <YStack
      padding={spacing.xl}
      gap={spacing.lg}
      flex={1}
      justifyContent="center"
      alignItems="center"
    >
      <YStack alignItems="center" gap={spacing.xl}>
        {/* Icon with particles and pulse rings */}
        <View
          style={{
            width: iconAreaSize,
            height: iconAreaSize,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PulseRing
            delay={0}
            theme={theme}
            size={iconContainerSize}
            borderWidth={borderWidths.medium}
          />
          <PulseRing
            delay={1000}
            theme={theme}
            size={iconContainerSize}
            borderWidth={borderWidths.medium}
          />
          <PulseRing
            delay={2000}
            theme={theme}
            size={iconContainerSize}
            borderWidth={borderWidths.medium}
          />
          {particles}

          <Animated.View
            style={{
              opacity: mainIconOpacity,
              transform: [
                { translateY: iconTranslateY },
                { scale: iconDropScale },
                { rotate: iconRotate },
              ],
              shadowColor: theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.neonCyan,
              shadowOffset: { width: 0, height: spacing.sm },
              shadowOpacity: theme === 'dark' ? 0.4 : 0.2,
              shadowRadius: spacing.xl,
              elevation: 10,
            }}
          >
            <Animated.View style={{ transform: [{ scale: iconPulseAnim }] }}>
              <YStack
                width={iconContainerSize}
                height={iconContainerSize}
                borderRadius={radius.full}
                backgroundColor={theme === 'dark' ? '$primaryLight' : '#D4F1FF'}
                alignItems="center"
                justifyContent="center"
                marginBottom={spacing.lg}
              >
                <CheckCircle
                  size={iconSizes.heroLg}
                  color={theme === 'dark' ? hexColors.dark.neonGreen : hexColors.light.neonGreen}
                  strokeWidth={2.5}
                />
              </YStack>
            </Animated.View>
          </Animated.View>
        </View>

        {/* Animated title — word by word */}
        <XStack gap={spacing.sm} alignItems="center">
          {titleWords.map((word, index) => (
            <Animated.View
              key={index}
              style={{
                opacity: wordAnimations[index].opacity,
                transform: [
                  { scale: wordAnimations[index].scale },
                  { translateY: wordAnimations[index].translateY },
                ],
              }}
            >
              <Text.Headline
                fontSize={typography.fontSize.display}
                fontFamily={FONT_FAMILIES.extrabold}
                textAlign="center"
                color="$text"
                letterSpacing={typography.letterSpacing.display}
                lineHeight={typography.lineHeight.display}
              >
                {word}
              </Text.Headline>
            </Animated.View>
          ))}
        </XStack>

        {/* Animated subtitle */}
        <Animated.View
          style={{
            opacity: subtextOpacity,
            transform: [{ translateY: subtextTranslateY }],
          }}
        >
          <Text.Body
            fontSize={typography.fontSize.title}
            textAlign="center"
            color="$textSecondary"
            lineHeight={typography.lineHeight.title}
          >
            {t('welcomeToApp')}
          </Text.Body>
        </Animated.View>

        {/* Progress bar — real download progress */}
        <Animated.View style={{ opacity: progressOpacity, alignItems: 'center' }}>
          <ProgressBar
            progress={currentProgress}
            theme={theme}
            barWidth={screenWidth * 0.6}
            barHeight={borderWidths.thick}
            barRadius={borderWidths.thin}
            marginTop={spacing.xxl}
          />

          {/* Slow download message — fades in after 5s */}
          <Animated.View style={{ opacity: slowMessageOpacity, marginTop: spacing.lg }}>
            <Text.Body textAlign="center" color="$textSecondary">
              {t('settingUpExperience')}
            </Text.Body>
          </Animated.View>
        </Animated.View>
      </YStack>
    </YStack>
  );

  return (
    <Animated.View style={{ flex: 1 }}>
      <LinearGradient
        colors={gradientColors}
        style={{ flex: 1 }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Container>
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          {screenState === 'consent' && renderConsentScreen()}
          {screenState === 'animation' && renderAnimationScreen()}
        </Container>
      </LinearGradient>
    </Animated.View>
  );
}
