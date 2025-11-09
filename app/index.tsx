import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { Lightbulb } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import { tokens } from "../src/theme/tokens";
import { H1, BodyText, Button } from "../src/components";
import { useTheme } from "../src/theme";
import { useTranslation } from "../src/i18n";
import * as onboardingService from "../src/services/onboarding";

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

export default function MainApp() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handleResetOnboarding = async () => {
    try {
      // Reset onboarding status
      await onboardingService.resetOnboarding();

      // Navigate to onboarding
      // The layout will re-check onboarding status and handle the flow
      router.replace("/onboarding");
    } catch (error) {
      console.error("Error resetting onboarding:", error);
    }
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <IconContainer>
          <Lightbulb size={60} color={tokens.color.light.primary} />
        </IconContainer>

        <YStack gap="$md" alignItems="center" width="100%">
          <H1 textAlign="center">{t("welcomeToApp")}</H1>
          <BodyText textAlign="center" color="$textSecondary">
            {t("onboardingComplete")}{"\n"}
            {t("mainAppPlaceholder")}
          </BodyText>
        </YStack>

        <YStack width="100%" paddingTop="$xl">
          <Button variant="secondary" onPress={handleResetOnboarding}>
            {t("resetOnboarding")}
          </Button>
        </YStack>
      </ContentContainer>
    </Container>
  );
}
