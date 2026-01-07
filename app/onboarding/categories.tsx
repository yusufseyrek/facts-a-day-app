import React, { useState, useEffect, useRef } from "react";
import { ScrollView, ActivityIndicator, useWindowDimensions, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { useRouter } from "expo-router";
import { tokens } from "../../src/theme/tokens";
import { typography } from "../../src/utils/responsive";
import {
  H1,
  BodyText,
  Button,
  ProgressIndicator,
  CategoryCard,
} from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation, type SupportedLocale } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";
import * as db from "../../src/services/database";
import { getLucideIcon } from "../../src/utils/iconMapper";
import {
  trackOnboardingStart,
  trackOnboardingCategoriesSelected,
  trackScreenView,
  Screens,
} from "../../src/services/analytics";

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

// Tablet breakpoint (iPad mini is 768px wide)
const TABLET_BREAKPOINT = 768;

export default function Categories() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { 
    selectedCategories, 
    setSelectedCategories, 
    isInitialized, 
    isInitializing,
    initializationError,
    initializeOnboarding,
    downloadFacts 
  } = useOnboarding();
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { width } = useWindowDimensions();

  // Responsive sizing for tablets
  const isTablet = width >= TABLET_BREAKPOINT;
  const numColumns = isTablet ? 4 : 3;
  const iconSize = isTablet ? 48 : 32;
  const typo = isTablet ? typography.tablet : typography.phone;
  const labelFontSize = typo.fontSize.caption;

  // Track if we've already logged the onboarding start event
  const hasLoggedStart = useRef(false);

  // Enter animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-30)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(30)).current;
  const categoryAnimations = useRef<Animated.Value[]>([]).current;

  // Run enter animations when categories are loaded
  useEffect(() => {
    if (!isLoading && categories.length > 0) {
      // Initialize category animations if not already done
      while (categoryAnimations.length < categories.length) {
        categoryAnimations.push(new Animated.Value(0));
      }

      // Start animations
      Animated.sequence([
        // Header animation
        Animated.parallel([
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Grid fade in
        Animated.timing(gridOpacity, {
          toValue: 1,
          duration: 130,
          useNativeDriver: true,
        }),
        // Staggered category cards
        Animated.stagger(
          20,
          categoryAnimations.slice(0, categories.length).map((anim) =>
            Animated.spring(anim, {
              toValue: 1,
              tension: 60,
              friction: 8,
              useNativeDriver: true,
            })
          )
        ),
      ]).start();

      // Button animation (parallel with grid)
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 260,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(buttonTranslateY, {
          toValue: 0,
          duration: 260,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isLoading, categories.length]);

  // Auto-initialize with device locale if not already initialized
  // Language selection has been removed - we use device language settings
  useEffect(() => {
    if (!isInitialized && !isInitializing) {
      // Initialize with the current device locale
      initializeOnboarding(locale as SupportedLocale);
    }
  }, [isInitialized, isInitializing, locale, initializeOnboarding]);

  // Track onboarding start and screen view when screen is initialized
  useEffect(() => {
    if (isInitialized && !hasLoggedStart.current) {
      hasLoggedStart.current = true;
      trackOnboardingStart(locale);
      trackScreenView(Screens.ONBOARDING_CATEGORIES);
    }
  }, [isInitialized, locale]);

  useEffect(() => {
    if (isInitialized) {
      loadCategories();
    }
  }, [isInitialized]);

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
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
  };

  const handleContinue = () => {
    // Track categories selected
    trackOnboardingCategoriesSelected(selectedCategories);

    // Start downloading facts in the background (non-blocking)
    downloadFacts(locale);

    // Navigate immediately to notifications
    router.push("/onboarding/notifications");
  };

  // Split categories into rows
  const rows: db.Category[][] = [];
  for (let i = 0; i < categories.length; i += numColumns) {
    rows.push(categories.slice(i, i + numColumns));
  }

  // Show loading while initializing or loading categories
  if (isInitializing || (!isInitialized && !initializationError) || isLoading) {
    return (
      <Container>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <ContentContainer justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
          <BodyText>{isInitializing ? t("settingUpApp") : t("loadingCategories")}</BodyText>
        </ContentContainer>
      </Container>
    );
  }

  // Show error if initialization failed
  if (initializationError) {
    return (
      <Container>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <ContentContainer justifyContent="center" alignItems="center" gap={tokens.space.lg}>
          <BodyText color="#FF6B6B" textAlign="center">
            {initializationError}
          </BodyText>
          <BodyText color="$textSecondary" textAlign="center">
            {t("checkInternetConnection")}
          </BodyText>
          <Button onPress={() => initializeOnboarding(locale as SupportedLocale)}>
            {t("tryAgain")}
          </Button>
        </ContentContainer>
      </Container>
    );
  }

  // Get category index for animation
  const getCategoryIndex = (rowIndex: number, colIndex: number) => {
    return rowIndex * numColumns + colIndex;
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <Animated.View
          style={{
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          }}
        >
          <ProgressIndicator currentStep={1} totalSteps={2} />

          <Header style={{ marginTop: tokens.space.xl }}>
            <H1>{t("whatInterestsYou")}</H1>
            <BodyText color="$textSecondary">
              {t("selectCategoriesMinimum")}
            </BodyText>
          </Header>
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: gridOpacity }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <CategoriesGrid>
              {rows.map((row, rowIndex) => (
                <CategoryRow key={`row-${rowIndex}`}>
                  {row.map((category, colIndex) => {
                    const catIndex = getCategoryIndex(rowIndex, colIndex);
                    const animValue = categoryAnimations[catIndex];
                    
                    return (
                      <Animated.View
                        key={category.slug}
                        style={{
                          flex: 1,
                          opacity: animValue || 1,
                          transform: [
                            {
                              scale: animValue
                                ? animValue.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.8, 1],
                                  })
                                : 1,
                            },
                            {
                              translateY: animValue
                                ? animValue.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [20, 0],
                                  })
                                : 0,
                            },
                          ],
                        }}
                      >
                        <CategoryCard
                          icon={getLucideIcon(category.icon, iconSize)}
                          label={category.name}
                          colorHex={category.color_hex}
                          selected={selectedCategories.includes(category.slug)}
                          onPress={() => toggleCategory(category.slug)}
                          labelFontSize={labelFontSize}
                        />
                      </Animated.View>
                    );
                  })}
                  {/* Add empty placeholders for the last row if needed */}
                  {row.length < numColumns && (
                    <>
                      {Array.from({ length: numColumns - row.length }).map((_, idx) => (
                        <View key={`placeholder-${idx}`} style={{ flex: 1 }} />
                      ))}
                    </>
                  )}
                </CategoryRow>
              ))}
            </CategoriesGrid>
            <View height={tokens.space.xl} />
          </ScrollView>
        </Animated.View>

        <Animated.View
          style={{
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          }}
        >
          <ButtonContainer>
            <Button
              onPress={handleContinue}
              disabled={selectedCategories.length < 5}
            >
              {t("continue")}
            </Button>
          </ButtonContainer>
        </Animated.View>
      </ContentContainer>
    </Container>
  );
}
