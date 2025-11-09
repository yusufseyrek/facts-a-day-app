import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CheckCircle } from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { H1, BodyText } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as onboardingService from "../../src/services/onboarding";

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
  const { t, locale } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Get data from previous steps
  const selectedCategories = params.selectedCategories
    ? JSON.parse(params.selectedCategories as string)
    : [];
  const difficulty = (params.difficulty as string) || "all";
  const notificationTime = params.notificationTime as string;

  useEffect(() => {
    downloadFactsAndCompleteOnboarding();
  }, []);

  const downloadFactsAndCompleteOnboarding = async () => {
    try {
      // Simulate progress updates
      setDownloadProgress(10);

      const result = await onboardingService.fetchAllFacts(
        locale,
        selectedCategories,
        difficulty
      );

      if (result.success) {
        setDownloadProgress(80);

        // Complete onboarding
        await onboardingService.completeOnboarding({
          selectedCategories,
          difficultyPreference: difficulty,
        });

        setDownloadProgress(100);
        setDownloadComplete(true);

        // Navigate to main app after a short delay
        setTimeout(() => {
          router.replace("/");
        }, 2500);
      } else {
        setDownloadError(result.error || "Failed to download facts");
      }
    } catch (error) {
      console.error("Error during onboarding completion:", error);
      setDownloadError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  };

  const handleRetry = () => {
    setDownloadError(null);
    setDownloadProgress(0);
    setDownloadComplete(false);
    downloadFactsAndCompleteOnboarding();
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <IconContainer>
          {downloadComplete ? (
            <CheckCircle size={60} color={tokens.color.light.success} />
          ) : (
            <ActivityIndicator
              size="large"
              color={tokens.color.light.primary}
            />
          )}
        </IconContainer>

        <YStack gap="$md" alignItems="center" marginBottom="$xl">
          <H1 textAlign="center">
            {downloadComplete
              ? t("allSet")
              : downloadError
              ? t("somethingWentWrong")
              : t("gettingReady")}
          </H1>
          <BodyText textAlign="center" color="$textSecondary">
            {downloadComplete
              ? t("welcomeToApp")
              : downloadError
              ? t("errorSettingUp")
              : t("downloadingFacts")}
          </BodyText>
        </YStack>

        <ProgressContainer>
          {downloadError ? (
            <>
              <BodyText
                color="$error"
                textAlign="center"
                fontSize={tokens.fontSize.small}
              >
                {downloadError}
              </BodyText>
              <BodyText
                color="$textSecondary"
                textAlign="center"
                fontSize={tokens.fontSize.small}
              >
                {t("checkInternetConnection")}
              </BodyText>
              {/* Retry button could be added here */}
            </>
          ) : (
            <>
              <BodyText
                fontWeight={tokens.fontWeight.semibold}
                fontSize={tokens.fontSize.h2}
                color="$primary"
              >
                {downloadProgress}%
              </BodyText>
              <BodyText
                color="$textSecondary"
                textAlign="center"
                fontSize={tokens.fontSize.small}
              >
                {downloadComplete ? t("redirectingToApp") : t("oneMoment")}
              </BodyText>
            </>
          )}
        </ProgressContainer>
      </ContentContainer>
    </Container>
  );
}
