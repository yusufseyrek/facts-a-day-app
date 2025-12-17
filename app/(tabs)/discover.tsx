import React, { useState, useCallback, useRef, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { Compass, Search, X } from "@tamagui/lucide-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { tokens } from "../../src/theme/tokens";
import {
  H1,
  BodyText,
  FeedFactCard,
  HeroFactCard,
  EmptyState,
} from "../../src/components";
import type { FactWithRelations } from "../../src/services/database";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as database from "../../src/services/database";
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

const EmptyDiscoverState = styled(YStack, {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: tokens.space.xl,
  gap: tokens.space.md,
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

  // Focus the search input when screen is focused
  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure the screen is fully mounted
      const timeout = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeout);
    }, [])
  );

  const performSearch = useCallback(
    async (query: string) => {
      if (!query || query.trim().length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      try {
        const results = await database.searchFacts(query.trim(), locale);
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

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch]);

  const handleFactPress = async (fact: FactWithRelations) => {
    await trackFactView();
    checkAndRequestReview();
    router.push(`/fact/${fact.id}`);
  };

  const handleRefresh = async () => {
    if (searchQuery.trim()) {
      setRefreshing(true);
      await performSearch(searchQuery);
      setRefreshing(false);
    }
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

  const renderHeader = () => (
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
        <SearchInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder={t("discoverPlaceholder")}
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

    // Show initial state when no search has been performed
    if (!hasQuery) {
      return (
        <EmptyDiscoverState>
          <Compass
            size={64}
            color={
              theme === "dark"
                ? tokens.color.dark.textMuted
                : tokens.color.light.textMuted
            }
          />
          <H1
            fontSize={isTablet ? tokens.fontSize.h2Tablet : tokens.fontSize.h2}
            textAlign="center"
            color="$textSecondary"
          >
            {t("discover")}
          </H1>
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

    return null;
  };

  const renderContent = () => {
    const hasQuery = searchQuery.trim().length > 0;

    if (!hasQuery || searchResults.length === 0) {
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

