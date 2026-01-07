import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import {
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { styled, View } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { Search, X } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { tokens } from "../../src/theme/tokens";
import { typography } from "../../src/utils/responsive";
import {
  H1,
  BodyText,
  EmptyState,
  LabelText,
  SmallText,
  ScreenContainer,
  ScreenHeaderContainer,
  FONT_FAMILIES,
  ContentContainer,
  TabletWrapper,
} from "../../src/components";
import { ImageFactCard } from "../../src/components/ImageFactCard";
import type { FactWithRelations, Category } from "../../src/services/database";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as database from "../../src/services/database";
import { getSelectedCategories } from "../../src/services/onboarding";
import { getLucideIcon } from "../../src/utils/iconMapper";
import { getContrastColor } from "../../src/utils/colors";
import { FACT_FLASH_LIST_SETTINGS, getImageCardHeight } from "../../src/config/factListSettings";
import { prefetchFactImagesWithLimit } from "../../src/services/images";
import { checkAndRequestReview } from "../../src/services/appReview";
import {
  trackSearch,
  trackCategoryBrowse,
  trackScreenView,
  Screens,
} from "../../src/services/analytics";
import { onPreferenceFeedRefresh } from "../../src/services/preferences";

// Device breakpoints
const TABLET_BREAKPOINT = 768;

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
  paddingBottom: tokens.space.md,
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

// Memoized list item component to prevent re-renders
interface FactListItemProps {
  item: FactWithRelations;
  isTablet: boolean;
  onPress: (fact: FactWithRelations) => void;
  selectedCategory?: Category | null;
}

const FactListItem = React.memo(({ item, isTablet, onPress, selectedCategory }: FactListItemProps) => {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <ContentContainer tablet={isTablet}>
      <ImageFactCard
        title={item.title || item.content.substring(0, 80) + "..."}
        imageUrl={item.image_url!}
        factId={item.id}
        category={selectedCategory || item.categoryData || item.category}
        categorySlug={selectedCategory?.slug || item.categoryData?.slug || item.category}
        onPress={handlePress}
        isTablet={isTablet}
      />
    </ContentContainer>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.image_url === nextProps.item.image_url &&
    prevProps.isTablet === nextProps.isTablet &&
    prevProps.selectedCategory?.slug === nextProps.selectedCategory?.slug
  );
});

FactListItem.displayName = 'FactListItem';

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
          const catFacts = await database.getFactsByCategory(categorySlug, locale);
          const searchTerm = query.trim().toLowerCase();
          results = catFacts.filter((fact) =>
            (fact.title?.toLowerCase().includes(searchTerm)) ||
            fact.content.toLowerCase().includes(searchTerm) ||
            (fact.summary?.toLowerCase().includes(searchTerm))
          );
        } else {
          // Search all facts
          results = await database.searchFacts(query.trim(), locale);
        }
        
        setSearchResults(results);
        prefetchFactImagesWithLimit(results);

        // Track search event
        trackSearch({
          searchTerm: query.trim(),
          resultsCount: results.length,
          categoryFilter: categorySlug || undefined,
        });
      } catch (error) {
        // Ignore search errors
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [locale]
  );

  // Track screen view when tab is focused
  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.DISCOVER);
    }, [])
  );

  // Load user's selected categories
  const loadUserCategories = useCallback(async () => {
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
      // Ignore category loading errors
    } finally {
      setIsLoadingCategories(false);
    }
  }, [locale]);

  // Load user's selected categories on mount
  useEffect(() => {
    loadUserCategories();
  }, [loadUserCategories]);

  // Auto-refresh when categories or language change (from settings)
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      // Clear any selected category filter since categories may have changed
      setSelectedCategorySlug(null);
      setCategoryFacts([]);
      setSearchQuery("");
      setSearchResults([]);
      // Reload categories
      loadUserCategories();
    });

    return () => unsubscribe();
  }, [loadUserCategories]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery, selectedCategorySlug);
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedCategorySlug, performSearch]);

  const handleFactPress = useCallback((fact: FactWithRelations) => {
    checkAndRequestReview();
    router.push(`/fact/${fact.id}?source=discover`);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (searchQuery.trim()) {
      await performSearch(searchQuery, selectedCategorySlug);
    } else if (selectedCategorySlug) {
      // Refresh category facts
      try {
        const facts = await database.getFactsByCategory(selectedCategorySlug, locale);
        setCategoryFacts(facts);
        prefetchFactImagesWithLimit(facts);
      } catch (error) {
        // Ignore refresh errors
      }
    }
    setRefreshing(false);
  }, [searchQuery, selectedCategorySlug, locale, performSearch]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
    searchInputRef.current?.focus();
  }, []);

  // Handle category selection
  const handleCategoryPress = useCallback(async (categorySlug: string) => {
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
      prefetchFactImagesWithLimit(facts);

      // Track category browse event
      trackCategoryBrowse({
        category: categorySlug,
        factsCount: facts.length,
      });
    } catch (error) {
      // Ignore fact loading errors
      setCategoryFacts([]);
    } finally {
      setIsLoadingCategoryFacts(false);
    }
  }, [selectedCategorySlug, locale]);

  const clearCategoryFilter = useCallback(() => {
    setSelectedCategorySlug(null);
    setCategoryFacts([]);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  // Get selected category object
  const selectedCategory = useMemo(() => 
    selectedCategorySlug
      ? userCategories.find((cat) => cat.slug === selectedCategorySlug) || null
      : null,
    [selectedCategorySlug, userCategories]
  );

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: FactWithRelations) => 
    item.id.toString(), []);

  // Calculate exact item height for FlashList layout
  const itemHeight = useMemo(() => getImageCardHeight(width, isTablet), [width, isTablet]);
  
  // Override item layout to give FlashList exact dimensions (helps with recycling issues)
  const overrideItemLayout = useCallback((layout: { span?: number; size?: number }) => {
    layout.size = itemHeight;
  }, [itemHeight]);

  // Memoized renderItem for search results
  const renderSearchItem = useCallback(({ item }: ListRenderItemInfo<FactWithRelations>) => (
    <FactListItem
      item={item}
      isTablet={isTablet}
      onPress={handleFactPress}
      selectedCategory={selectedCategory}
    />
  ), [isTablet, handleFactPress, selectedCategory]);

  // Memoized renderItem for category facts
  const renderCategoryItem = useCallback(({ item }: ListRenderItemInfo<FactWithRelations>) => (
    <FactListItem
      item={item}
      isTablet={isTablet}
      onPress={handleFactPress}
      selectedCategory={selectedCategory}
    />
  ), [isTablet, handleFactPress, selectedCategory]);

  // Memoized refresh controls
  const searchRefreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
  ), [refreshing, handleRefresh]);

  const categoryRefreshControl = useMemo(() => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        if (selectedCategorySlug) {
          await handleCategoryPress(selectedCategorySlug);
        }
        setRefreshing(false);
      }}
    />
  ), [refreshing, selectedCategorySlug, handleCategoryPress]);


  const renderHeader = useCallback(() => {
    const categoryColor = selectedCategory?.color_hex || "#0066FF";
    const contrastColor = selectedCategory ? getContrastColor(categoryColor) : "#FFFFFF";

    return (
      <Animated.View entering={FadeIn.duration(300)}>
        <ScreenHeaderContainer tablet={isTablet}>
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
              <Pressable onPress={clearCategoryFilter}>
                <CategoryChip style={{ backgroundColor: categoryColor }}>
                  <SmallText
                    color={contrastColor}
                    numberOfLines={1}
                    fontFamily={FONT_FAMILIES.semibold}
                  >
                    {selectedCategory.name}
                  </SmallText>
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
                </CategoryChip>
              </Pressable>
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
                fontSize: isTablet ? typography.tablet.fontSize.body : typography.phone.fontSize.body,
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
        </ScreenHeaderContainer>
      </Animated.View>
    );
  }, [isTablet, selectedCategory, searchQuery, isSearching, theme, t, handleSearchChange, clearSearch, clearCategoryFilter]);

  const renderEmptyState = useCallback(() => {
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
            <Animated.View entering={FadeIn.duration(300)}>
              <YStack gap={tokens.space.sm}>
                <H1
                  color="$text"
                >
                  {t("discover")}
                </H1>
                <BodyText
                  color="$textMuted"
                >
                  {t("discoverDescription")}
                </BodyText>
              </YStack>
            </Animated.View>

            <CategoriesGrid>
              {rows.map((row, rowIndex) => (
                <Animated.View key={`row-${rowIndex}`} entering={FadeInDown.delay(100 + rowIndex * 50).duration(300)}>
                  <CategoryRow>
                    {row.map((category) => {
                      const categoryColor = category.color_hex || "#0066FF";
                      const contrastColor = getContrastColor(categoryColor);
                      const factsCount = categoryFactsCounts[category.slug] || 0;

                      return (
                        <Pressable
                          key={category.slug}
                          onPress={() => handleCategoryPress(category.slug)}
                          style={{ flex: 1 }}
                          testID={`discover-category-${rowIndex * numColumns + row.indexOf(category)}`}
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
                                  numberOfLines={1}
                                  fontFamily={FONT_FAMILIES.semibold}
                                >
                                  {category.name}
                                </LabelText>
                                <SmallText
                                  color={contrastColor}
                                  style={{ opacity: 0.85 }}
                                  fontFamily={FONT_FAMILIES.medium}
                                >
                                  {factsCount === 1
                                    ? t("factCountSingular", { count: factsCount })
                                    : t("factCountPlural", { count: factsCount })}
                                </SmallText>
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
                </Animated.View>
              ))}
            </CategoriesGrid>
          </CategoriesContainer>
        </ScrollView>
      );
    }

    return null;
  }, [searchQuery, isSearching, searchResults.length, selectedCategorySlug, isTablet, userCategories, isLoadingCategories, categoryFactsCounts, theme, t, handleCategoryPress]);

  const renderContent = useCallback(() => {
    const hasQuery = searchQuery.trim().length > 0;

    // Show search results if there's a search query
    if (hasQuery) {
      if (searchResults.length === 0) {
        return renderEmptyState();
      }

      return (
        <Animated.View 
          key="search-results"
          entering={FadeInUp.duration(350).springify()}
          style={{ flex: 1 }}
        >
          <FlashList
            data={searchResults}
            keyExtractor={keyExtractor}
            renderItem={renderSearchItem}
            refreshControl={searchRefreshControl}
            overrideItemLayout={overrideItemLayout}
            {...FACT_FLASH_LIST_SETTINGS}
          />
        </Animated.View>
      );
    }

    // Show category facts if a category is selected
    if (selectedCategorySlug) {
      if (isLoadingCategoryFacts) {
        return (
          <Animated.View 
            key="loading" 
            entering={FadeIn.duration(200)} 
            style={{ flex: 1 }}
          >
            <EmptyDiscoverState>
              <ActivityIndicator size="large" color={tokens.color[theme].primary} />
            </EmptyDiscoverState>
          </Animated.View>
        );
      }

      if (categoryFacts.length === 0) {
        return (
          <Animated.View 
            key="empty" 
            entering={FadeInUp.duration(350).springify()} 
            style={{ flex: 1 }}
          >
            <EmptyState
              title={t("noDiscoverResults")}
              description={t("noDiscoverResultsDescription")}
            />
          </Animated.View>
        );
      }

      return (
        <Animated.View 
          key={`category-${selectedCategorySlug}`}
          entering={FadeInUp.duration(400).springify()}
          style={{ flex: 1 }}
        >
          <FlashList
            data={categoryFacts}
            keyExtractor={keyExtractor}
            renderItem={renderCategoryItem}
            refreshControl={categoryRefreshControl}
            overrideItemLayout={overrideItemLayout}
            {...FACT_FLASH_LIST_SETTINGS}
          />
        </Animated.View>
      );
    }

    // Show category grid when no search and no category selected
    return (
      <Animated.View 
        key="category-grid"
        entering={FadeIn.duration(300)}
        style={{ flex: 1 }}
      >
        {renderEmptyState()}
      </Animated.View>
    );
  }, [searchQuery, searchResults, selectedCategorySlug, isLoadingCategoryFacts, categoryFacts, theme, t, keyExtractor, renderSearchItem, renderCategoryItem, searchRefreshControl, categoryRefreshControl, renderEmptyState, overrideItemLayout]);

  return (
    <ScreenContainer edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      {renderHeader()}
      <YStack flex={1}>
        <YStack flex={1}>
          {isTablet ? (
            <TabletWrapper flex={1}>{renderContent()}</TabletWrapper>
          ) : (
            renderContent()
          )}
        </YStack>
      </YStack>
    </ScreenContainer>
  );
}

export default DiscoverScreen;
