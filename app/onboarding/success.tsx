import React, { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { useRouter } from "expo-router";
import { CheckCircle } from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { H1, BodyText } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.xl,
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
});

const IconContainer = styled(YStack, {
  width: 120,
  height: 120,
  borderRadius: tokens.radius.full,
  backgroundColor: "$primaryLight",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: tokens.space.xl,
});

const ProgressContainer = styled(YStack, {
  backgroundColor: "$surface",
  padding: tokens.space.xl,
  borderRadius: tokens.radius.lg,
  gap: tokens.space.md,
  width: "100%",
  alignItems: "center",
  borderWidth: 1,
  borderColor: "$border",
});

export default function OnboardingSuccessScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();

  useEffect(() => {
    finishOnboarding();
  }, []);

  const finishOnboarding = async () => {
    try {
      // Complete onboarding (save preferences)
      await completeOnboarding();

      // Navigate to main app after showing success message
      setTimeout(() => {
        router.replace("/");
      }, 2000);
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <IconContainer>
          <CheckCircle size={60} color={tokens.color.light.success} />
        </IconContainer>

        <YStack gap="$md" alignItems="center" marginBottom="$xl">
          <H1 textAlign="center">{t("allSet")}</H1>
          <BodyText textAlign="center" color="$textSecondary">
            {t("welcomeToApp")}
          </BodyText>
        </YStack>

        <ProgressContainer>
          <BodyText
            color="$textSecondary"
            textAlign="center"
            fontSize={tokens.fontSize.small}
          >
            {t("redirectingToApp")}
          </BodyText>
        </ProgressContainer>
      </ContentContainer>
    </Container>
  );
}
