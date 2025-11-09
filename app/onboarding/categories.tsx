import React, { useState, useEffect } from "react";
import { ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { useRouter } from "expo-router";
import { tokens } from "../../src/theme/tokens";
import {
  H1,
  BodyText,
  Button,
  ProgressIndicator,
  CategoryCard,
} from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as db from "../../src/services/database";
import { getLucideIcon } from "../../src/utils/iconMapper";

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

const CategoriesGrid = styled(View, {
  flex: 1,
  gap: tokens.space.md,
});

const CategoryRow = styled(XStack, {
  gap: tokens.space.md,
  justifyContent: "space-between",
});

const ButtonContainer = styled(View, {
  paddingTop: tokens.space.md,
});

export default function Categories() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const categoriesFromDb = await db.getAllCategories();
      setCategories(categoriesFromDb);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const handleContinue = () => {
    // Navigate to difficulty selection
    router.push({
      pathname: "/onboarding/difficulty",
      params: { selectedCategories: JSON.stringify(selectedCategories) },
    });
  };

  // Split categories into rows of 3
  const rows: db.Category[][] = [];
  for (let i = 0; i < categories.length; i += 3) {
    rows.push(categories.slice(i, i + 3));
  }

  if (isLoading) {
    return (
      <Container>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <ContentContainer justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
          <BodyText>{t("loadingCategories")}</BodyText>
        </ContentContainer>
      </Container>
    );
  }

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <ProgressIndicator currentStep={2} totalSteps={4} />

        <Header>
          <H1>{t("whatInterestsYou")}</H1>
          <BodyText color="$textSecondary">
            {t("selectCategoriesMinimum")}
          </BodyText>
        </Header>

        <ScrollView showsVerticalScrollIndicator={false}>
          <CategoriesGrid>
            {rows.map((row, rowIndex) => (
              <CategoryRow key={`row-${rowIndex}`}>
                {row.map((category) => (
                  <CategoryCard
                    key={category.slug}
                    icon={getLucideIcon(category.icon, 32)}
                    label={category.name}
                    selected={selectedCategories.includes(category.slug)}
                    onPress={() => toggleCategory(category.slug)}
                  />
                ))}
                {/* Add empty placeholders for the last row if needed */}
                {row.length < 3 && (
                  <>
                    {Array.from({ length: 3 - row.length }).map((_, idx) => (
                      <View key={`placeholder-${idx}`} style={{ flex: 1 }} />
                    ))}
                  </>
                )}
              </CategoryRow>
            ))}
          </CategoriesGrid>
          <View height={tokens.space.xl} />
        </ScrollView>

        <ButtonContainer>
          <Button
            onPress={handleContinue}
            disabled={selectedCategories.length < 5}
          >
            {t("continue")}
          </Button>
        </ButtonContainer>
      </ContentContainer>
    </Container>
  );
}
