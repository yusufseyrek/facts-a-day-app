import React, { useEffect, useRef, useMemo, useState } from "react";
import { Animated, Easing, View, Dimensions, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { useRouter } from "expo-router";
import { CheckCircle, Sparkle, Star, Gift } from "@tamagui/lucide-icons";
import { LinearGradient } from "expo-linear-gradient";
import { tokens, getNeonColors } from "../../src/theme";
import { BodyText, Button, H1, H2, FONT_FAMILIES } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";
import { completeConsentFlow, isConsentRequired, initializeAdsSDK } from "../../src/services/ads";
import { ADS_ENABLED } from "../../src/config/ads";

const { width: screenWidth } = Dimensions.get("window");

// Flow: loading -> consent (if GDPR required) -> processing -> animation -> navigate
// Non-EEA iOS users go directly: loading -> processing -> animation (ATT shown during processing)
type ScreenState = "loading" | "consent" | "processing" | "animation";

const Container = styled(SafeAreaView, {
  flex: 1,
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.lg,
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
});

const IconContainer = styled(YStack, {
  width: 140,
  height: 140,
  borderRadius: tokens.radius.full,
  backgroundColor: "$primaryLight",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: tokens.space.lg,
});

const ConsentIconContainer = styled(YStack, {
  width: 100,
  height: 100,
  borderRadius: tokens.radius.full,
  backgroundColor: "$primaryLight",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: tokens.space.md,
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
    outputRange: ["0deg", `${360 + Math.random() * 360}deg`],
  });

  // Use neon colors for particles
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
        position: "absolute",
        transform: [
          { translateX },
          { translateY },
          { scale },
          { rotate },
        ],
        opacity,
      }}
    >
      <ParticleIcon
        size={20 + Math.random() * 10}
        color={particleColor}
        fill={particleColor}
      />
    </Animated.View>
  );
};

// Ring pulse animation component
const PulseRing = ({ delay, theme }: { delay: number; theme: "light" | "dark" }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Use neon cyan for pulse ring
  const ringColor = theme === "dark" ? tokens.color.dark.neonCyan : tokens.color.light.neonCyan;

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
        position: "absolute",
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 2,
        borderColor: ringColor,
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    />
  );
};

// Progress bar component
const ProgressBar = ({ duration, theme }: { duration: number; theme: "light" | "dark" }) => {
  const widthAnim = useRef(new Animated.Value(0)).current;

  // Use neon cyan for progress bar
  const barColor = theme === "dark" ? tokens.color.dark.neonCyan : tokens.color.light.neonCyan;
  const bgColor = theme === "dark" ? "rgba(0, 212, 255, 0.1)" : "rgba(0, 153, 204, 0.1)";

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: 1,
      duration: duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, []);

  const width = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      style={{
        width: screenWidth * 0.6,
        height: 3,
        backgroundColor: bgColor,
        borderRadius: 1.5,
        overflow: "hidden",
        marginTop: 40,
      }}
    >
      <Animated.View
        style={{
          width,
          height: "100%",
          backgroundColor: barColor,
          borderRadius: 1.5,
        }}
      />
    </View>
  );
};

export default function OnboardingSuccessScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();

  // Screen state: loading -> consent (if required) -> processing -> animation -> navigate
  const [screenState, setScreenState] = useState<ScreenState>("loading");

  // Track if animations should run
  const [shouldRunAnimations, setShouldRunAnimations] = useState(false);

  // Check if consent is required on mount
  useEffect(() => {
    checkConsentRequired();
  }, []);

  const checkConsentRequired = async () => {
    console.log("checkConsentRequired started, ADS_ENABLED:", ADS_ENABLED);
    
    if (!ADS_ENABLED) {
      // Ads disabled, skip to animation
      setScreenState("animation");
      setShouldRunAnimations(true);
      return;
    }

    try {
      // Check if GDPR consent is required (user is in EEA/UK)
      const gdprRequired = await isConsentRequired();
      console.log("isConsentRequired (GDPR) returned:", gdprRequired);
      
      if (gdprRequired) {
        // GDPR consent is required (EEA/UK user), show GDPR soft message
        console.log("Showing GDPR consent screen");
        setScreenState("consent");
      } else if (Platform.OS === "ios") {
        // Non-EEA iOS user: skip soft message, run consent flow directly for ATT
        console.log("Non-EEA iOS user, running consent flow directly for ATT...");
        setScreenState("processing");
        const result = await completeConsentFlow();
        console.log("Consent flow completed:", result);
        setScreenState("animation");
        setShouldRunAnimations(true);
      } else {
        // Android user outside EEA, no consent screens needed
        console.log("No consent required, initializing ads...");
        await initializeAdsSDK();
        setScreenState("animation");
        setShouldRunAnimations(true);
      }
    } catch (error) {
      console.error("Error checking consent requirement:", error);
      // On error, skip to animation
      setScreenState("animation");
      setShouldRunAnimations(true);
    }
  };

  // Animation values for success screen
  const iconDropAnim = useRef(new Animated.Value(0)).current;
  const iconPulseAnim = useRef(new Animated.Value(1)).current;
  const mainIconRotate = useRef(new Animated.Value(0)).current;
  const mainIconOpacity = useRef(new Animated.Value(0)).current;

  // Animation values for consent screen
  const consentOpacity = useRef(new Animated.Value(1)).current;

  // Text animations
  const titleWords = t("allSet").split(" ");
  const wordAnimations = useRef(
    titleWords.map(() => ({
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.5),
      translateY: new Animated.Value(20),
    }))
  ).current;

  const subtextOpacity = useRef(new Animated.Value(0)).current;
  const subtextTranslateY = useRef(new Animated.Value(20)).current;
  const progressOpacity = useRef(new Animated.Value(0)).current;

  // Run success animations when animation screen is shown
  useEffect(() => {
    if (!shouldRunAnimations) return;

    // Start all animations
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
      // Phase 2: Start pulse animation
      Animated.parallel([
        // Word-by-word title reveal
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
        // Subtitle animation
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
        // Show progress bar
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

    // Continuous pulse animation
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

    // Complete onboarding and navigate after animation
    finishOnboarding();
  }, [shouldRunAnimations]);

  const finishOnboarding = async () => {
    try {
      // Complete onboarding (save preferences)
      await completeOnboarding();

      // Navigate to main app after showing success message
      setTimeout(() => {
        router.replace("/");
      }, 3000);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      // Even on error, navigate to main app
      setTimeout(() => {
        router.replace("/");
      }, 3000);
    }
  };

  const handleConsentContinue = async () => {
    setScreenState("processing");

    try {
      // Run the complete consent flow (shows GDPR consent + ATT dialog)
      const result = await completeConsentFlow();
      console.log("Consent flow completed:", result);
    } catch (error) {
      console.error("Error during consent flow:", error);
    }

    // After consent flow, show success animation
    setScreenState("animation");
    setShouldRunAnimations(true);
  };

  // Icon animations
  const iconTranslateY = iconDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 0],
  });

  // Create separate scale values
  const iconDropScale = iconDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const iconRotate = mainIconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["-180deg", "0deg"],
  });

  // Generate particles
  const particles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => (
        <Particle key={i} index={i} delay={300 + i * 50} />
      )),
    []
  );

  // Gradient colors based on theme - using neon palette
  const darkColors = [tokens.color.dark.background, "#0F1E36", "#1A3D5C"] as const;
  const lightColors = [tokens.color.light.background, "#E0F7FF", "#D0EFFF"] as const;
  const gradientColors = theme === "dark" ? darkColors : lightColors;

  // Render consent screen
  const renderConsentScreen = () => (
    <Animated.View
      style={{
        flex: 1,
        opacity: consentOpacity,
      }}
    >
      <ContentContainer>
        <YStack alignItems="center" gap={tokens.space.lg} paddingHorizontal={tokens.space.md}>
          {/* Icon */}
          <ConsentIconContainer>
            <Gift
              size={50}
              color={theme === "dark" ? tokens.color.dark.neonCyan : tokens.color.light.neonCyan}
              strokeWidth={2}
            />
          </ConsentIconContainer>

          {/* Title */}
          <H2
            fontSize={28}
            textAlign="center"
            color="$text"
            letterSpacing={-0.5}
          >
            {t("adsConsentTitle")}
          </H2>

          {/* Message */}
          <BodyText
            fontSize={16}
            textAlign="center"
            color="$textSecondary"
            lineHeight={24}
          >
            {t("adsConsentMessage")}
          </BodyText>

          {/* Button */}
          <YStack width="100%" paddingTop={tokens.space.lg}>
            <Button onPress={handleConsentContinue}>
              {t("adsConsentButton")}
            </Button>
          </YStack>
        </YStack>
      </ContentContainer>
    </Animated.View>
  );

  // Render loading screen (checking consent requirement)
  const renderLoadingScreen = () => (
    <ContentContainer>
      <YStack alignItems="center" gap={tokens.space.lg}>
        <ActivityIndicator size="large" color={theme === "dark" ? tokens.color.dark.neonCyan : tokens.color.light.neonCyan} />
      </YStack>
    </ContentContainer>
  );

  // Render processing screen
  const renderProcessingScreen = () => (
    <ContentContainer>
      <YStack alignItems="center" gap={tokens.space.lg}>
        <ActivityIndicator size="large" color={theme === "dark" ? tokens.color.dark.neonCyan : tokens.color.light.neonCyan} />
        <BodyText
          fontSize={16}
          textAlign="center"
          color="$textSecondary"
        >
          {t("oneMoment")}
        </BodyText>
      </YStack>
    </ContentContainer>
  );

  // Render success animation screen
  const renderAnimationScreen = () => (
    <ContentContainer>
      <YStack alignItems="center" gap={tokens.space.xl}>
        {/* Icon with particles and pulse rings */}
        <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
          {/* Pulse rings */}
          <PulseRing delay={0} theme={theme} />
          <PulseRing delay={1000} theme={theme} />
          <PulseRing delay={2000} theme={theme} />

          {/* Particles */}
          {particles}

          {/* Main animated icon */}
          <Animated.View
            style={{
              opacity: mainIconOpacity,
              transform: [
                { translateY: iconTranslateY },
                { scale: iconDropScale },
                { rotate: iconRotate },
              ],
              shadowColor: theme === "dark" ? tokens.color.dark.neonCyan : tokens.color.light.neonCyan,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: theme === "dark" ? 0.4 : 0.2,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            <Animated.View
              style={{
                transform: [{ scale: iconPulseAnim }],
              }}
            >
              <IconContainer>
                <CheckCircle
                  size={70}
                  color={theme === "dark" ? tokens.color.dark.neonGreen : tokens.color.light.neonGreen}
                  strokeWidth={2.5}
                />
              </IconContainer>
            </Animated.View>
          </Animated.View>
        </View>

        {/* Animated title - word by word */}
        <XStack gap={tokens.space.sm} alignItems="center">
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
              <H1
                fontSize={48}
                fontFamily={FONT_FAMILIES.extrabold}
                textAlign="center"
                color="$text"
                letterSpacing={-1}
                lineHeight={56}
              >
                {word}
              </H1>
            </Animated.View>
          ))}
        </XStack>

        {/* Animated subtitle */}
        <Animated.View
          style={{
            opacity: subtextOpacity,
            transform: [{ translateY: subtextTranslateY }],
            maxWidth: "90%",
          }}
        >
          <BodyText
            fontSize={18}
            textAlign="center"
            color="$textSecondary"
            lineHeight={26}
          >
            {t("welcomeToApp")}
          </BodyText>
        </Animated.View>

        {/* Progress bar */}
        <Animated.View style={{ opacity: progressOpacity }}>
          <ProgressBar duration={2000} theme={theme} />
        </Animated.View>
      </YStack>
    </ContentContainer>
  );

  return (
    <>
      <Animated.View style={{ flex: 1 }}>
        <LinearGradient
          colors={gradientColors}
          style={{ flex: 1 }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Container>
            <StatusBar style={theme === "dark" ? "light" : "dark"} />
            {screenState === "loading" && renderLoadingScreen()}
            {screenState === "consent" && renderConsentScreen()}
            {screenState === "processing" && renderProcessingScreen()}
            {screenState === "animation" && renderAnimationScreen()}
          </Container>
        </LinearGradient>
      </Animated.View>
    </>
  );
}
