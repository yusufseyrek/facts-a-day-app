import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SectionList, RefreshControl, ActivityIndicator, useWindowDimensions, TextInput, FlatList, Pressable, Animated, Easing } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { Clock, Search, X } from "@tamagui/lucide-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { tokens } from "../../src/theme/tokens";
import {
  H1,
  H2,
  BodyText,
  FeedFactCard,
  HeroFactCard,
  EmptyState,
} from "../../src/components";
import type { FactWithRelations } from "../../src/services/database";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as database from "../../src/services/database";
import * as Notifications from "expo-notifications";
import { BannerAd } from "../../src/components/ads";
import { ADS_ENABLED } from "../../src/config/ads";
import { trackFactView } from "../../src/services/adManager";
import { checkAndRequestReview } from "../../src/services/appReview";
import { onFeedRefresh, forceRefreshContent, onRefreshStatusChange, getRefreshStatus, RefreshStatus } from "../../src/services/contentRefresh";
import { onPreferenceFeedRefresh } from "../../src/services/preferences";

// Device breakpoints
const TABLET_BREAKPOINT = 768;
const MAX_CONTENT_WIDTH = 800; // Optimal reading width for tablets

// Track prefetched images to avoid redundant prefetching
const prefetchedImages = new Set<string>();

// Prefetch images for faster loading in modal
const prefetchFactImages = (facts: FactWithRelations[]) => {
  const imageUrls = facts
    .filter((fact) => fact.image_url)
    .map((fact) => fact.image_url!);

  // Filter out already prefetched images
  const newImageUrls = imageUrls.filter((url) => !prefetchedImages.has(url));

  if (newImageUrls.length > 0) {
    Image.prefetch(newImageUrls);
    // Track newly prefetched images
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
  justifyContent: "space-between",
  variants: {
    tablet: {
      true: {
        padding: tokens.space.xxl,
        paddingBottom: tokens.space.lg,
      },
    },
  } as const,
});

const SectionHeader = styled(YStack, {
  paddingHorizontal: tokens.space.xl,
  paddingVertical: tokens.space.md,
  backgroundColor: "$background",
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xxl,
        paddingVertical: tokens.space.lg,
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

const LoadingContainer = styled(YStack, {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  gap: tokens.space.md,
});

const LocaleChangeOverlay = styled(YStack, {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "$background",
  zIndex: 100,
  gap: tokens.space.lg,
});

const SearchContainer = styled(XStack, {
  paddingHorizontal: tokens.space.xl,
  paddingBottom: tokens.space.md,
  gap: tokens.space.sm,
  alignItems: "center",
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xxl,
        paddingBottom: tokens.space.lg,
      },
    },
  } as const,
});

const SearchInputContainer = styled(XStack, {
  flex: 1,
  height: 40,
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
  paddingVertical: 0, // Remove padding to center text in fixed height container
});


// ClearButton and SearchIconButton will be inline Pressable components

interface FactSection {
  title: string;
  data: FactWithRelations[];
}

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  const [sections, setSections] = useState<FactSection[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FactWithRelations[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() => getRefreshStatus());
  const searchInputRef = useRef<TextInput>(null);
  
  // Animation values for smooth search bar transition
  const searchAnimValue = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(1)).current;

  // Reload facts when tab gains focus (e.g., after settings change)
  useFocusEffect(
    useCallback(() => {
      loadFacts();
    }, [locale])
  );

  // Auto-refresh feed when new notifications are received
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(
      async (notification) => {
        const factId = notification.request.content.data.factId;

        // Mark the fact as shown in feed and reload
        if (factId) {
          try {
            await database.markFactAsShown(factId as number);
            console.log(`✅ Marked fact ${factId} as shown in feed`);
          } catch (error) {
            console.error("Error marking fact as shown:", error);
          }
          loadFacts();
        }
      }
    );

    return () => subscription.remove();
  }, []);

  // Auto-refresh feed when content is updated from API
  useEffect(() => {
    const unsubscribe = onFeedRefresh(() => {
      console.log("📥 Feed refresh triggered by content update");
      loadFacts();
    });

    return () => unsubscribe();
  }, []);

  // Auto-refresh feed when language or categories change (from device settings or in-app)
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      console.log("🌍 Feed refresh triggered by preference change (language/categories)");
      loadFacts();
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to background refresh status for loading indicator
  useEffect(() => {
    const unsubscribe = onRefreshStatusChange((status) => {
      console.log(`📊 Background refresh status changed: ${status}`);
      setBackgroundRefreshStatus(status);
    });

    return () => unsubscribe();
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // setIsSearching(true) is already called in handleSearchChange
    try {
      const results = await database.searchFacts(query.trim(), locale);
      setSearchResults(results);
      // Prefetch images for search results
      prefetchFactImages(results);
    } catch (error) {
      console.error("Error searching facts:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [locale]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 500); // Increased delay to 500ms for better UX

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch]);

  const loadFacts = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }
      // Only show loading spinner on initial load (no data yet)

      // Mark any delivered facts as shown (for facts delivered while app was closed)
      const markedCount = await database.markDeliveredFactsAsShown(locale);
      if (markedCount > 0) {
        console.log(`✅ Marked ${markedCount} delivered facts as shown in feed`);
      }

      // Get facts grouped by date
      const facts = await database.getFactsGroupedByDate(locale);

      // Prefetch images for faster modal loading
      prefetchFactImages(facts);

      // Group facts by date
      const groupedFacts = groupFactsByDate(facts);
      setSections(groupedFacts);
    } catch (error) {
      console.error("Error loading facts:", error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  const groupFactsByDate = (facts: FactWithRelations[]): FactSection[] => {
    const today = new Date();
    const todayString = today.toISOString().split("T")[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split("T")[0];

    // Group facts by date
    const grouped: { [key: string]: FactWithRelations[] } = {};

    facts.forEach((fact) => {
      let dateKey: string;

      // Facts marked as shown_in_feed (without scheduled_date) should appear under "Today"
      if (fact.shown_in_feed === 1 && !fact.scheduled_date) {
        dateKey = todayString;
      } else if (fact.scheduled_date) {
        dateKey = fact.scheduled_date.split("T")[0];
      } else {
        // Skip facts that are neither scheduled nor marked as shown
        return;
      }

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(fact);
    });

    // Convert to sections array with formatted titles
    const sectionsArray: FactSection[] = [];

    Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a)) // Sort descending (newest first)
      .forEach((dateKey) => {
        let title: string;

        if (dateKey === todayString) {
          title = t("today");
        } else if (dateKey === yesterdayString) {
          title = t("yesterday");
        } else {
          // Format date using user's locale (e.g., "October 24, 2023" for en-US)
          const date = new Date(dateKey);
          title = date.toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        }

        sectionsArray.push({
          title,
          data: grouped[dateKey],
        });
      });

    return sectionsArray;
  };

  const handleFactPress = async (fact: FactWithRelations) => {
    // Track fact view and potentially show interstitial ad
    await trackFactView();

    // Check if we should request app review
    checkAndRequestReview(); // Non-blocking call

    router.push(`/fact/${fact.id}`);
  };

  const handleRefresh = async () => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    } else {
      setRefreshing(true);
      try {
        // First fetch new content from API
        await forceRefreshContent();
      } catch (error) {
        console.error("Error refreshing content from API:", error);
      }
      // Then reload facts from database
      // loadFacts will set refreshing to false in its finally block
      await loadFacts(false);
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

  const handleSearchIconPress = () => {
    if (!isSearchMode) {
      setIsSearchMode(true);
      // Animate search bar expansion
      Animated.parallel([
        Animated.timing(searchAnimValue, {
          toValue: 1,
          duration: 300,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.timing(titleOpacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
      ]).start(() => {
        searchInputRef.current?.focus();
      });
    } else {
      // If already in search mode, just focus the input
      searchInputRef.current?.focus();
    }
  };

  const clearSearch = () => {
    searchInputRef.current?.blur();
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
    
    // Animate search bar collapse
    Animated.parallel([
      Animated.timing(searchAnimValue, {
        toValue: 0,
        duration: 300,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 200,
        delay: 150,
        easing: Easing.in(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start(() => {
      setIsSearchMode(false);
    });
    
    loadFacts();
  };

  const handleSearchFocus = () => {
    setIsInputFocused(true);
  };

  const handleSearchBlur = () => {
    setIsInputFocused(false);
    // Only exit search mode if there's no query
    // Use a small delay to allow for potential focus events (like clicking clear button)
    setTimeout(() => {
      if (!searchQuery.trim() && !isInputFocused) {
        // Animate search bar collapse
        Animated.parallel([
          Animated.timing(searchAnimValue, {
            toValue: 0,
            duration: 300,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: false,
          }),
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 200,
            delay: 150,
            easing: Easing.in(Easing.ease),
            useNativeDriver: false,
          }),
        ]).start(() => {
          setIsSearchMode(false);
        });
      }
    }, 150);
  };

  const renderHeader = () => {
    // Calculate available width for search bar
    const padding = isTablet ? tokens.space.xxl * 2 : tokens.space.xl * 2;
    const availableWidth = width - padding;

    // Animated interpolations
    const searchBarWidth = searchAnimValue.interpolate({
      inputRange: [0, 1],
      outputRange: [40, availableWidth],
    });
    
    const inputOpacity = searchAnimValue.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0, 1],
    });
    
    const closeButtonScale = searchAnimValue.interpolate({
      inputRange: [0, 0.7, 1],
      outputRange: [0, 0, 1],
    });
    
    const containerBorderWidth = searchAnimValue.interpolate({
      inputRange: [0, 0.05, 1],
      outputRange: [0, 1, 1],
    });

    return (
      <Header tablet={isTablet}>
        <XStack alignItems="center" flex={1} position="relative">
          {/* Title section - fades out when searching */}
          <Animated.View 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: tokens.space.sm,
              opacity: titleOpacity,
              position: 'absolute',
              left: 0,
              zIndex: 1,
            }}
            pointerEvents={isSearchMode ? 'none' : 'auto'}
          >
            <Clock
              size={isTablet ? 32 : 24}
              color={theme === "dark" ? "#FFFFFF" : tokens.color.light.text}
            />
            <H1 fontSize={isTablet ? tokens.fontSize.h1Tablet : tokens.fontSize.h1}>
              {t("recentFacts")}
            </H1>
          </Animated.View>

          {/* Search container - expands from right */}
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginLeft: 'auto',
              width: searchBarWidth,
              height: 40,
              backgroundColor: theme === "dark" ? tokens.color.dark.surface : tokens.color.light.surface,
              borderRadius: tokens.radius.md,
              borderWidth: containerBorderWidth,
              borderColor: theme === "dark" ? tokens.color.dark.border : tokens.color.light.border,
              overflow: 'hidden',
              zIndex: 2,
            }}
          >
            {/* Search icon button - always visible */}
            <Pressable
              onPress={handleSearchIconPress}
              style={{
                width: 40,
                height: 40,
                borderRadius: tokens.radius.md,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Search
                size={isTablet ? 24 : 20}
                color={
                  theme === "dark"
                    ? tokens.color.dark.textSecondary
                    : tokens.color.light.textSecondary
                }
              />
            </Pressable>

            {/* Input field - expands when searching */}
            <Animated.View
              style={{
                flex: 1,
                height: '100%',
                opacity: inputOpacity,
                flexDirection: 'row',
                alignItems: 'center',
                paddingRight: tokens.space.sm,
              }}
            >
              <SearchInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={handleSearchChange}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                placeholder={t("searchPlaceholder")}
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
              />
              
              {/* Close/Loading button */}
              <Animated.View style={{ transform: [{ scale: closeButtonScale }] }}>
                {isSearching ? (
                  <ActivityIndicator size="small" color={tokens.color[theme].textSecondary} />
                ) : (
                  <Pressable
                    onPress={clearSearch}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: tokens.radius.full,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme === "dark"
                        ? tokens.color.dark.border
                        : tokens.color.light.border,
                    }}
                  >
                    <X
                      size={16}
                      color={
                        theme === "dark"
                          ? tokens.color.dark.textSecondary
                          : tokens.color.light.textSecondary
                      }
                    />
                  </Pressable>
                )}
              </Animated.View>
            </Animated.View>
          </Animated.View>
          
          {/* Hack to hide border on the icon when collapsed - we overlay the border color? 
              No, simpler: bind borderColor opacity to animation */}
        </XStack>
      </Header>
    );
  };

  // Only show loading spinner on initial load when there's no data yet
  if (initialLoading && sections.length === 0 && !searchQuery) {
    return (
      <Container edges={["top"]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </Container>
    );
  }

  // Render content based on state
  const renderContent = () => {
    const hasQuery = searchQuery.trim().length > 0;
    const hasResults = searchResults.length > 0;
    const searchFinished = !isSearching;
    
    // Show Search Results (if we have them, regardless of searching status - handles refinement)
    // OR Show "No Results" (only if search finished and no results found)
    const showSearchResults = hasQuery && (hasResults || searchFinished);

    if (showSearchResults) {
      if (searchResults.length === 0) {
        return (
          <EmptyState
            title={t("noSearchResults")}
            description={t("noSearchResultsDescription")}
          />
        );
      }

      return (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{
            paddingBottom: ADS_ENABLED ? (isTablet ? 120 : 70) : 0,
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

    if (sections.length === 0) {
      return (
        <EmptyState
          title={t("emptyStateTitle")}
          description={t("emptyStateDescription")}
        />
      );
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{
          paddingBottom: ADS_ENABLED ? (isTablet ? 120 : 70) : 0,
        }}
        renderSectionHeader={({ section: { title } }) => (
          <SectionHeader tablet={isTablet}>
            <H2 fontSize={isTablet ? tokens.fontSize.h2Tablet : tokens.fontSize.h2}>
              {title}
            </H2>
          </SectionHeader>
        )}
        renderItem={({ item, section, index }) => {
          // Use HeroFactCard for the first item in the first section (Today)
          const isFirstItem = sections.indexOf(section) === 0 && index === 0;
          const categoryColor = item.categoryData?.color_hex || "#0066FF";

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
        stickySectionHeadersEnabled={true}
      />
    );
  };

  const renderLocaleChangeOverlay = () => {
    // Only show overlay for locale changes, not for regular background refresh
    if (backgroundRefreshStatus !== 'locale-change') return null;
    
    return (
      <LocaleChangeOverlay>
        <ActivityIndicator size="large" color={tokens.color[theme].primary} />
        <BodyText fontSize={tokens.fontSize.body} color="$textSecondary">
          {t("updatingLanguage")}
        </BodyText>
      </LocaleChangeOverlay>
    );
  };

  return (
    <Container edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      {renderHeader()}
      <YStack flex={1}>
        {isTablet ? (
          <TabletWrapper flex={1}>
            {renderContent()}
          </TabletWrapper>
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
            <BannerAd position="home" />
          </YStack>
        )}
        {renderLocaleChangeOverlay()}
      </YStack>
    </Container>
  );
}


export default HomeScreen;
