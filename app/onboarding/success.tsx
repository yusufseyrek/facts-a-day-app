import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { styled } from "@tamagui/core";
import { YStack, Text } from "tamagui";
import { useRouter } from "expo-router";
import { CheckCircle } from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { BodyText } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
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
  shadowColor: "$primary",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 16,
  elevation: 8,
});

export default function OnboardingSuccessScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();

  // Animation values
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(30)).current;
  const subtextOpacity = useRef(new Animated.Value(0)).current;
  const subtextTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Start animations
    Animated.sequence([
      // Icon animation - bouncy entrance with rotation
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(iconRotate, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Text animations - staggered
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 500,
          delay: 100,
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          tension: 40,
          friction: 8,
          delay: 100,
          useNativeDriver: true,
        }),
      ]),
      // Subtext animation
      Animated.parallel([
        Animated.timing(subtextOpacity, {
          toValue: 1,
          duration: 500,
          delay: 150,
          useNativeDriver: true,
        }),
        Animated.spring(subtextTranslateY, {
          toValue: 0,
          tension: 40,
          friction: 8,
          delay: 150,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    finishOnboarding();
  }, []);

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
    }
  };

  const iconRotateInterpolate = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["-180deg", "0deg"],
  });

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <YStack alignItems="center" gap="$xl">
          {/* Animated Icon */}
          <Animated.View
            style={{
              opacity: iconOpacity,
              transform: [
                { scale: iconScale },
                { rotate: iconRotateInterpolate },
              ],
            }}
          >
            <IconContainer>
              <CheckCircle
                size={70}
                color={tokens.color.light.success}
                strokeWidth={2.5}
              />
            </IconContainer>
          </Animated.View>

          {/* Large Welcome Text */}
          <YStack gap="$md" alignItems="center" maxWidth="90%">
            <Animated.View
              style={{
                opacity: textOpacity,
                transform: [{ translateY: textTranslateY }],
              }}
            >
              <Text
                fontSize={48}
                fontWeight="800"
                textAlign="center"
                color="$text"
                letterSpacing={-1}
                lineHeight={56}
              >
                {t("allSet")}
              </Text>
            </Animated.View>

            <Animated.View
              style={{
                opacity: subtextOpacity,
                transform: [{ translateY: subtextTranslateY }],
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
          </YStack>
        </YStack>
      </ContentContainer>
    </Container>
  );
}
