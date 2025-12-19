import React, { useState, useCallback, useRef, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { styled, View } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { Search, X } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { tokens } from "../../src/theme/tokens";
import {
  H1,
  BodyText,
  FeedFactCard,
  HeroFactCard,
  EmptyState,
  LabelText,
} from "../../src/components";
import type { FactWithRelations, Category } from "../../src/services/database";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as database from "../../src/services/database";
import { getSelectedCategories } from "../../src/services/onboarding";
import { getLucideIcon } from "../../src/utils/iconMapper";
import { getContrastColor } from "../../src/utils/colors";
import { BannerAd } from "../../src/components/ads";
import { ADS_ENABLED } from "../../src/config/ads";
import { trackFactView } from "../../src/services/adManager";
import { checkAndRequestReview } from "../../src/services/appReview";

// Device breakpoints
const TABLET_BREAKPOINT = 768;
const MAX_CONTENT_WIDTH = 800;

// Track prefetched images to avoid redundant prefetching
const prefetchedImages = new Set<string>();

// Prefetch images for faster loading in modal
const prefetchFactImages = (facts: FactWithRelations[]) => {
  const imageUrls = facts
    .filter((fact) => fact.image_url)
    .map((fact) => fact.image_url!);

  const newImageUrls = imageUrls.filter((url) => !prefetchedImages.has(url));

  if (newImageUrls.length > 0) {
    Image.prefetch(newImageUrls);
    newImageUrls.forEach((url) => prefetchedImages.add(url));
  }
};

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const Header = styled(XStack, {
  padding: tokens.space.xl,
  paddingBottom: tokens.space.md,
  alignItems: "center",
  gap: tokens.space.sm,
  variants: {
    tablet: {
      true: {
        padding: tokens.space.xxl,
        paddingBottom: tokens.space.lg,
      },
    },
  } as const,
});

const ContentContainer = styled(YStack, {
  paddingHorizontal: tokens.space.lg,
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xl,
      },
    },
  } as const,
});

const TabletWrapper = styled(YStack, {
  width: "100%",
  maxWidth: MAX_CONTENT_WIDTH,
  alignSelf: "center",
});

const SearchInputContainer = styled(XStack, {
  flex: 1,
  height: 44,
  alignItems: "center",
  backgroundColor: "$surface",
  borderRadius: tokens.radius.md,
  paddingHorizontal: tokens.space.md,
  borderWidth: 1,
  borderColor: "$border",
  gap: tokens.space.sm,
});

const SearchInput = styled(TextInput, {
  flex: 1,
  height: "100%",
  paddingVertical: 0,
});

const ClearButton = styled(YStack, {
  width: 28,
  height: 28,
  borderRadius: tokens.radius.full,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "$border",
});

// Category chip in search input
const CategoryChip = styled(XStack, {
  height: 28,
  borderRadius: tokens.radius.full,
  paddingLeft: tokens.space.sm,
  paddingRight: tokens.space.xs,
  alignItems: "center",
  gap: tokens.space.xs,
});

const CategoryChipClearButton = styled(YStack, {
  width: 20,
  height: 20,
  borderRadius: tokens.radius.full,
  alignItems: "center",
  justifyContent: "center",
});

const EmptyDiscoverState = styled(YStack, {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: tokens.space.xl,
  gap: tokens.space.md,
});

const CategoriesContainer = styled(YStack, {
  flex: 1,
  paddingHorizontal: tokens.space.lg,
  gap: tokens.space.lg,
});

const CategoriesGrid = styled(View, {
  gap: tokens.space.md,
});

const CategoryRow = styled(XStack, {
  gap: tokens.space.md,
  justifyContent: "space-between",
});

// Discover Category Card - wider with facts count
const DiscoverCategoryCard = styled(XStack, {
  flex: 1,
  height: 80,
  borderRadius: tokens.radius.lg,
  paddingHorizontal: tokens.space.md,
  alignItems: "center",
  gap: tokens.space.md,
});

const DiscoverCategoryIconContainer = styled(YStack, {
  width: 48,
  height: 48,
  borderRadius: tokens.radius.md,
  alignItems: "center",
  justifyContent: "center",
});

const DiscoverCategoryTextContainer = styled(YStack, {
  flex: 1,
  gap: 2,
});

function DiscoverScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FactWithRelations[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bannerAdLoaded, setBannerAdLoaded] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Category filter state
  const [userCategories, setUserCategories] = useState<Category[]>([]);
  const [categoryFactsCounts, setCategoryFactsCounts] = useState<Record<string, number>>({});
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null);
  const [categoryFacts, setCategoryFacts] = useState<FactWithRelations[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingCategoryFacts, setIsLoadingCategoryFacts] = useState(false);

  const performSearch = useCallback(
    async (query: string, categorySlug: string | null) => {
      if (!query || query.trim().length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      try {
        let results: FactWithRelations[];
        
        if (categorySlug) {
          // Search within the selected category
          const categoryFacts = await database.getFactsByCategory(categorySlug, locale);
          const searchTerm = query.trim().toLowerCase();
          results = categoryFacts.filter((fact) =>
            (fact.title?.toLowerCase().includes(searchTerm)) ||
            fact.content.toLowerCase().includes(searchTerm) ||
            (fact.summary?.toLowerCase().includes(searchTerm))
          );
        } else {
          // Search all facts
          results = await database.searchFacts(query.trim(), locale);
        }
        
        setSearchResults(results);
        prefetchFactImages(results);
      } catch (error) {
        console.error("Error searching facts:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [locale]
  );

  // Load user's selected categories on mount
  useEffect(() => {
    const loadUserCategories = async () => {
      try {
        setIsLoadingCategories(true);
        const selectedSlugs = await getSelectedCategories();
        const allCategories = await database.getAllCategories();
        
        // Filter to only include user's selected categories
        const filteredCategories = allCategories.filter((cat) =>
          selectedSlugs.includes(cat.slug)
        );
        setUserCategories(filteredCategories);

        // Load facts counts for each category
        const counts: Record<string, number> = {};
        await Promise.all(
          filteredCategories.map(async (cat) => {
            const facts = await database.getFactsByCategory(cat.slug, locale);
            counts[cat.slug] = facts.length;
          })
        );
        setCategoryFactsCounts(counts);
      } catch (error) {
        console.error("Error loading user categories:", error);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    loadUserCategories();
  }, [locale]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery, selectedCategorySlug);
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedCategorySlug, performSearch]);

  const handleFactPress = async (fact: FactWithRelations) => {
    await trackFactView();
    checkAndRequestReview();
    router.push(`/fact/${fact.id}`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (searchQuery.trim()) {
      await performSearch(searchQuery, selectedCategorySlug);
    } else if (selectedCategorySlug) {
      // Refresh category facts
      try {
        const facts = await database.getFactsByCategory(selectedCategorySlug, locale);
        setCategoryFacts(facts);
        prefetchFactImages(facts);
      } catch (error) {
        console.error("Error refreshing category facts:", error);
      }
    }
    setRefreshing(false);
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
    searchInputRef.current?.focus();
  };

  // Handle category selection
  const handleCategoryPress = async (categorySlug: string) => {
    // If tapping the same category, deselect it
    if (selectedCategorySlug === categorySlug) {
      setSelectedCategorySlug(null);
      setCategoryFacts([]);
      return;
    }

    setSelectedCategorySlug(categorySlug);
    setIsLoadingCategoryFacts(true);

    try {
      const facts = await database.getFactsByCategory(categorySlug, locale);
      setCategoryFacts(facts);
      prefetchFactImages(facts);
    } catch (error) {
      console.error("Error loading category facts:", error);
      setCategoryFacts([]);
    } finally {
      setIsLoadingCategoryFacts(false);
    }
  };

  const clearCategoryFilter = () => {
    setSelectedCategorySlug(null);
    setCategoryFacts([]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const renderHeader = () => {
    const selectedCategory = selectedCategorySlug
      ? userCategories.find((cat) => cat.slug === selectedCategorySlug)
      : null;

    const categoryColor = selectedCategory?.color_hex || "#0066FF";
    const contrastColor = selectedCategory ? getContrastColor(categoryColor) : "#FFFFFF";

    return (
      <Header tablet={isTablet}>
        <SearchInputContainer>
          <Search
            size={20}
            color={
              theme === "dark"
                ? tokens.color.dark.textSecondary
                : tokens.color.light.textSecondary
            }
          />
          {selectedCategory && (
            <CategoryChip style={{ backgroundColor: categoryColor }}>
              <LabelText
                color={contrastColor}
                fontSize={tokens.fontSize.small}
                numberOfLines={1}
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                {selectedCategory.name}
              </LabelText>
              <Pressable onPress={clearCategoryFilter}>
                <CategoryChipClearButton
                  style={{
                    backgroundColor:
                      contrastColor === "#000000"
                        ? "rgba(0,0,0,0.2)"
                        : "rgba(255,255,255,0.3)",
                  }}
                >
                  <X size={12} color={contrastColor} />
                </CategoryChipClearButton>
              </Pressable>
            </CategoryChip>
          )}
          <SearchInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder={selectedCategory ? t("searchPlaceholder") : t("discoverPlaceholder")}
            placeholderTextColor={
              theme === "dark"
                ? tokens.color.dark.textMuted
                : tokens.color.light.textMuted
            }
            style={{
              color:
                theme === "dark"
                  ? tokens.color.dark.text
                  : tokens.color.light.text,
              fontSize: tokens.fontSize.body,
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {isSearching ? (
            <ActivityIndicator
              size="small"
              color={tokens.color[theme].textSecondary}
            />
          ) : searchQuery.length > 0 ? (
            <ClearButton onPress={clearSearch}>
              <X
                size={16}
                color={
                  theme === "dark"
                    ? tokens.color.dark.textSecondary
                    : tokens.color.light.textSecondary
                }
              />
            </ClearButton>
          ) : null}
        </SearchInputContainer>
      </Header>
    );
  };

  const renderEmptyState = () => {
    const hasQuery = searchQuery.trim().length > 0;
    const searchFinished = !isSearching;

    if (hasQuery && searchFinished && searchResults.length === 0) {
      return (
        <EmptyState
          title={t("noDiscoverResults")}
          description={t("noDiscoverResultsDescription")}
        />
      );
    }

    // Show category grid when no search has been performed and no category is selected
    if (!hasQuery && !selectedCategorySlug) {
      const numColumns = isTablet ? 3 : 2;
      const iconSize = isTablet ? 28 : 24;

      // Split categories into rows of 2 (or 3 on tablet)
      const rows: Category[][] = [];
      for (let i = 0; i < userCategories.length; i += numColumns) {
        rows.push(userCategories.slice(i, i + numColumns));
      }

      if (isLoadingCategories) {
        return (
          <EmptyDiscoverState>
            <ActivityIndicator size="large" color={tokens.color[theme].primary} />
          </EmptyDiscoverState>
        );
      }

      if (userCategories.length === 0) {
        return (
          <EmptyDiscoverState>
            <BodyText
              fontSize={tokens.fontSize.body}
              textAlign="center"
              color="$textMuted"
            >
              {t("discoverDescription")}
            </BodyText>
          </EmptyDiscoverState>
        );
      }

      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          <CategoriesContainer>
            <YStack gap={tokens.space.sm}>
              <H1
                fontSize={isTablet ? tokens.fontSize.h2Tablet : tokens.fontSize.h2}
                color="$text"
              >
                {t("discover")}
              </H1>
              <BodyText
                fontSize={tokens.fontSize.body}
                color="$textMuted"
              >
                {t("discoverDescription")}
              </BodyText>
            </YStack>

            <CategoriesGrid>
              {rows.map((row, rowIndex) => (
                <CategoryRow key={`row-${rowIndex}`}>
                  {row.map((category) => {
                    const categoryColor = category.color_hex || "#0066FF";
                    const contrastColor = getContrastColor(categoryColor);
                    const factsCount = categoryFactsCounts[category.slug] || 0;

                    return (
                      <Pressable
                        key={category.slug}
                        onPress={() => handleCategoryPress(category.slug)}
                        style={{ flex: 1 }}
                      >
                        {({ pressed }) => (
                          <DiscoverCategoryCard
                            opacity={pressed ? 0.7 : 1}
                            style={{ backgroundColor: categoryColor }}
                          >
                            <DiscoverCategoryIconContainer
                              style={{
                                backgroundColor:
                                  contrastColor === "#000000"
                                    ? "rgba(0,0,0,0.1)"
                                    : "rgba(255,255,255,0.2)",
                              }}
                            >
                              {getLucideIcon(category.icon, iconSize, contrastColor)}
                            </DiscoverCategoryIconContainer>
                            <DiscoverCategoryTextContainer>
                              <LabelText
                                color={contrastColor}
                                fontSize={isTablet ? tokens.fontSize.body : tokens.fontSize.small}
                                numberOfLines={1}
                                style={{ fontFamily: "Montserrat_600SemiBold" }}
                              >
                                {category.name}
                              </LabelText>
                              <LabelText
                                color={contrastColor}
                                fontSize={tokens.fontSize.small}
                                style={{ opacity: 0.85, fontFamily: "Montserrat_500Medium" }}
                              >
                                {factsCount} {factsCount === 1 ? "fact" : "facts"}
                              </LabelText>
                            </DiscoverCategoryTextContainer>
                          </DiscoverCategoryCard>
                        )}
                      </Pressable>
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
          </CategoriesContainer>
        </ScrollView>
      );
    }

    return null;
  };

  const renderContent = () => {
    const hasQuery = searchQuery.trim().length > 0;

    // Show search results if there's a search query
    if (hasQuery) {
      if (searchResults.length === 0) {
        return renderEmptyState();
      }

      return (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{
            paddingBottom: bannerAdLoaded ? (isTablet ? 120 : 70) : 0,
          }}
          renderItem={({ item, index }) => {
            const categoryColor = item.categoryData?.color_hex || "#0066FF";
            const isFirstItem = index === 0;

            return (
              <ContentContainer tablet={isTablet}>
                {isFirstItem ? (
                  <HeroFactCard
                    title={item.title || item.content.substring(0, 80) + "..."}
                    summary={item.summary}
                    categoryColor={categoryColor}
                    onPress={() => handleFactPress(item)}
                    isTablet={isTablet}
                  />
                ) : (
                  <FeedFactCard
                    title={item.title || item.content.substring(0, 80) + "..."}
                    summary={item.summary}
                    onPress={() => handleFactPress(item)}
                    isTablet={isTablet}
                  />
                )}
              </ContentContainer>
            );
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      );
    }

    // Show category facts if a category is selected
    if (selectedCategorySlug) {
      if (isLoadingCategoryFacts) {
        return (
          <EmptyDiscoverState>
            <ActivityIndicator size="large" color={tokens.color[theme].primary} />
          </EmptyDiscoverState>
        );
      }

      if (categoryFacts.length === 0) {
        return (
          <EmptyState
            title={t("noDiscoverResults")}
            description={t("noDiscoverResultsDescription")}
          />
        );
      }

      const selectedCategory = userCategories.find(
        (cat) => cat.slug === selectedCategorySlug
      );
      const categoryColor = selectedCategory?.color_hex || "#0066FF";

      return (
        <FlatList
          data={categoryFacts}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{
            paddingBottom: bannerAdLoaded ? (isTablet ? 120 : 70) : 0,
          }}
          renderItem={({ item, index }) => {
            const isFirstItem = index === 0;

            return (
              <ContentContainer tablet={isTablet}>
                {isFirstItem ? (
                  <HeroFactCard
                    title={item.title || item.content.substring(0, 80) + "..."}
                    summary={item.summary}
                    categoryColor={categoryColor}
                    onPress={() => handleFactPress(item)}
                    isTablet={isTablet}
                  />
                ) : (
                  <FeedFactCard
                    title={item.title || item.content.substring(0, 80) + "..."}
                    summary={item.summary}
                    onPress={() => handleFactPress(item)}
                    isTablet={isTablet}
                  />
                )}
              </ContentContainer>
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await handleCategoryPress(selectedCategorySlug);
                setRefreshing(false);
              }}
            />
          }
        />
      );
    }

    // Show category grid when no search and no category selected
    return renderEmptyState();
  };

  return (
    <Container edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      {renderHeader()}
      <YStack flex={1}>
        {isTablet ? (
          <TabletWrapper flex={1}>{renderContent()}</TabletWrapper>
        ) : (
          renderContent()
        )}
        {ADS_ENABLED && (
          <YStack
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            backgroundColor="$background"
          >
            <BannerAd position="discover" onAdLoadChange={setBannerAdLoaded} />
          </YStack>
        )}
      </YStack>
    </Container>
  );
}

export default DiscoverScreen;

