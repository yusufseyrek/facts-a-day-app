import React from "react";
import { Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { useRouter } from "expo-router";
import { tokens } from "../../src/theme/tokens";
import {
  H1,
  H2,
  BodyText,
  Button,
  ProgressIndicator,
} from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation, type TranslationKeys } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.xl,
  flex: 1,
  justifyContent: "space-between",
});

const Header = styled(YStack, {
  gap: tokens.space.sm,
});

const OptionsContainer = styled(YStack, {
  gap: tokens.space.md,
  paddingVertical: tokens.space.lg,
});

const OptionCard = styled(View, {
  borderRadius: tokens.radius.lg,
  borderWidth: 2,
  padding: tokens.space.lg,

  variants: {
    selected: {
      true: {
        backgroundColor: "$primary",
        borderColor: "$primary",
      },
      false: {
        backgroundColor: "$surface",
        borderColor: "$border",
      },
    },
  } as const,
});

const OptionHeader = styled(YStack, {
  gap: tokens.space.xs,
});

type DifficultyLevel = "beginner" | "intermediate" | "advanced" | "all";

interface DifficultyOption {
  value: DifficultyLevel;
  title: string;
  description: string;
}

// Difficulty options with translation keys
const getDifficultyOptions = (
  t: (key: TranslationKeys) => string
): DifficultyOption[] => [
  {
    value: "beginner",
    title: t("easyDifficulty"),
    description: t("easyDescription"),
  },
  {
    value: "intermediate",
    title: t("mediumDifficulty"),
    description: t("mediumDescription"),
  },
  {
    value: "advanced",
    title: t("hardDifficulty"),
    description: t("hardDescription"),
  },
  {
    value: "all",
    title: t("allDifficulties"),
    description: t("allDescription"),
  },
];

export default function Difficulty() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { difficulty, setDifficulty } = useOnboarding();

  const handleContinue = () => {
    // Navigate to notifications screen
    router.push("/onboarding/notifications");
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <YStack gap="$xl">
          <ProgressIndicator currentStep={3} totalSteps={4} />

          <Header>
            <H1>{t("chooseDifficultyLevel")}</H1>
            <BodyText color="$textSecondary">
              {t("tailorFactsComplexity")}
            </BodyText>
          </Header>

          <OptionsContainer>
            {getDifficultyOptions(t).map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setDifficulty(option.value)}
              >
                {({ pressed }) => (
                  <OptionCard
                    selected={difficulty === option.value}
                    opacity={pressed ? 0.7 : 1}
                  >
                    <OptionHeader>
                      <H2
                        color={
                          difficulty === option.value
                            ? "#FFFFFF"
                            : "$text"
                        }
                      >
                        {option.title}
                      </H2>
                      <BodyText
                        color={
                          difficulty === option.value
                            ? "#FFFFFF"
                            : "$textSecondary"
                        }
                      >
                        {option.description}
                      </BodyText>
                    </OptionHeader>
                  </OptionCard>
                )}
              </Pressable>
            ))}
          </OptionsContainer>
        </YStack>

        <Button onPress={handleContinue}>{t("continue")}</Button>
      </ContentContainer>
    </Container>
  );
}
