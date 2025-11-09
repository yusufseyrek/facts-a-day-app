import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ScrollView, Pressable } from "react-native";
import { styled, Text } from "@tamagui/core";
import { YStack, XStack, View } from "tamagui";
import { useRouter } from "expo-router";
import { tokens } from "../../src/theme/tokens";
import { H1, BodyText, Button, ProgressIndicator } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation, type SupportedLocale } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.xl,
  flex: 1,
});

const Header = styled(YStack, {
  gap: tokens.space.sm,
});

const LanguagesGrid = styled(View, {
  flex: 1,
  gap: tokens.space.md,
});

const LanguageRow = styled(XStack, {
  gap: tokens.space.md,
  justifyContent: "space-between",
});

const LanguageCard = styled(View, {
  flex: 1,
  aspectRatio: 1,
  borderRadius: tokens.radius.lg,
  padding: tokens.space.md,
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
  gap: tokens.space.sm,
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

const FlagText = styled(Text, {
  fontSize: 40,
});

const LanguageName = styled(BodyText, {
  textAlign: "center",
  fontWeight: tokens.fontWeight.semibold,
});

const ButtonContainer = styled(View, {
  paddingTop: tokens.space.md,
});

interface Language {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
];

export default function LanguageSelectionScreen() {
  const { theme } = useTheme();
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] =
    useState<SupportedLocale>(locale);
  const { isInitializing, initializationError, initializeOnboarding } =
    useOnboarding();

  const handleLanguageSelect = (languageCode: SupportedLocale) => {
    setSelectedLanguage(languageCode);
    // Update the locale immediately
    setLocale(languageCode);
  };

  const handleContinue = async () => {
    // Initialize onboarding with selected language
    const success = await initializeOnboarding(selectedLanguage);

    if (success) {
      // Navigate to categories on successful initialization
      router.push("/onboarding/categories");
    }
    // If failed, error state will be shown automatically
  };

  // Split languages into rows of 3
  const rows: Language[][] = [];
  for (let i = 0; i < LANGUAGES.length; i += 3) {
    rows.push(LANGUAGES.slice(i, i + 3));
  }

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <ProgressIndicator currentStep={1} totalSteps={4} />

        <Header>
          <H1>{t("selectLanguage")}</H1>
          <BodyText color="$textSecondary">
            {t("choosePreferredLanguage")}
          </BodyText>
        </Header>

        <ScrollView showsVerticalScrollIndicator={false}>
          <LanguagesGrid>
            {rows.map((row, rowIndex) => (
              <LanguageRow key={`row-${rowIndex}`}>
                {row.map((language) => (
                  <Pressable
                    key={language.code}
                    onPress={() => handleLanguageSelect(language.code)}
                    style={{ flex: 1 }}
                  >
                    {({ pressed }) => (
                      <LanguageCard
                        selected={selectedLanguage === language.code}
                        opacity={pressed ? 0.7 : 1}
                      >
                        <FlagText>{language.flag}</FlagText>
                        <LanguageName
                          color={
                            selectedLanguage === language.code
                              ? "#FFFFFF"
                              : "$text"
                          }
                        >
                          {language.nativeName}
                        </LanguageName>
                      </LanguageCard>
                    )}
                  </Pressable>
                ))}
                {/* Add empty placeholders for incomplete rows */}
                {row.length < 3 && (
                  <>
                    {Array.from({ length: 3 - row.length }).map((_, idx) => (
                      <View key={`placeholder-${idx}`} style={{ flex: 1 }} />
                    ))}
                  </>
                )}
              </LanguageRow>
            ))}
          </LanguagesGrid>

          <BodyText
            textAlign="center"
            color="$textSecondary"
            fontSize={tokens.fontSize.small}
            paddingTop="$xl"
            paddingBottom="$xl"
          >
            {t("languageDescription")}
          </BodyText>
        </ScrollView>

        <ButtonContainer>
          <Button onPress={handleContinue} loading={isInitializing}>
            {isInitializing ? t("settingUpLanguage") : t("continue")}
          </Button>

          {initializationError && (
            <YStack gap="$sm" paddingTop="$md">
              <BodyText color="$error" textAlign="center" fontSize={tokens.fontSize.small}>
                {initializationError}
              </BodyText>
              <BodyText color="$textSecondary" textAlign="center" fontSize={tokens.fontSize.small}>
                {t("checkInternetConnection")}
              </BodyText>
            </YStack>
          )}
        </ButtonContainer>
      </ContentContainer>
    </Container>
  );
}
