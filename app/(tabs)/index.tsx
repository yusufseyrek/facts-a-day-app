import React, { useEffect, useState, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { SectionList, RefreshControl, ActivityIndicator, useWindowDimensions } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { Clock } from "@tamagui/lucide-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { tokens } from "../../src/theme/tokens";
import {
  H2,
  BodyText,
  FeedFactCard,
  HeroFactCard,
  EmptyState,
  ScreenContainer,
  ScreenHeader,
  SectionHeaderContainer,
  ContentContainer,
  LoadingContainer,
  TabletWrapper,
  useIconColor,
} from "../../src/components";
import type { FactWithRelations } from "../../src/services/database";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as database from "../../src/services/database";
import * as Notifications from "expo-notifications";
import { trackFactView } from "../../src/services/adManager";
import { checkAndRequestReview } from "../../src/services/appReview";
import { onFeedRefresh, forceRefreshContent, onRefreshStatusChange, getRefreshStatus, RefreshStatus } from "../../src/services/contentRefresh";
import { onPreferenceFeedRefresh } from "../../src/services/preferences";
import { trackFeedRefresh, trackScreenView, Screens } from "../../src/services/analytics";

// Device breakpoints
const TABLET_BREAKPOINT = 768;

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

interface FactSection {
  title: string;
  data: FactWithRelations[];
}

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  const [sections, setSections] = useState<FactSection[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() => getRefreshStatus());

  // Reload facts when tab gains focus (e.g., after settings change)
  useFocusEffect(
    useCallback(() => {
      loadFacts();
      // Track screen view when tab gains focus
      trackScreenView(Screens.HOME);
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
            
            // Top up notifications since one was just delivered
            // This ensures we always have 64 scheduled notifications
            console.log('🔔 Notification received, checking if top-up needed...');
            const { checkAndTopUpNotifications } = await import("../../src/services/notifications");
            const { getLocaleFromCode } = await import("../../src/i18n");
            const Localization = await import("expo-localization");
            const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
            await checkAndTopUpNotifications(getLocaleFromCode(deviceLocale));
          } catch (error) {
            console.error("Error marking fact as shown or topping up:", error);
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

    router.push(`/fact/${fact.id}?source=feed`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    // Track pull-to-refresh
    trackFeedRefresh('pull');

    try {
      // First fetch new content from API
      await forceRefreshContent();
    } catch (error) {
      console.error("Error refreshing content from API:", error);
    }
    // Then reload facts from database
    // loadFacts will set refreshing to false in its finally block
    await loadFacts(false);
  };

  const iconColor = useIconColor();

  const renderHeader = () => (
    <Animated.View entering={FadeIn.duration(300)}>
      <ScreenHeader
        icon={<Clock size={isTablet ? 32 : 24} color={iconColor} />}
        title={t("factsFeed")}
        isTablet={isTablet}
      />
    </Animated.View>
  );

  // Only show loading spinner on initial load when there's no data yet
  if (initialLoading && sections.length === 0) {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  // Render content based on state
  const renderContent = () => {
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
        renderSectionHeader={({ section: { title }, section }) => {
          const sectionIndex = sections.indexOf(section);
          return (
            <Animated.View entering={FadeInDown.delay(sectionIndex * 50).duration(300)}>
              <SectionHeaderContainer tablet={isTablet}>
                <H2 fontSize={isTablet ? tokens.fontSize.h2Tablet : tokens.fontSize.h2}>
                  {title}
                </H2>
              </SectionHeaderContainer>
            </Animated.View>
          );
        }}
        renderItem={({ item, section, index }) => {
          // Use HeroFactCard for the first item in the first section (Today)
          const isFirstItem = sections.indexOf(section) === 0 && index === 0;
          const categoryColor = item.categoryData?.color_hex || "#0066FF";
          const sectionIndex = sections.indexOf(section);
          const animationDelay = sectionIndex * 50 + (index + 1) * 50;

          return (
            <Animated.View entering={FadeInDown.delay(animationDelay).duration(300)}>
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
            </Animated.View>
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
    <ScreenContainer edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      {renderHeader()}
      <YStack flex={1}>
        <YStack flex={1}>
          {isTablet ? (
            <TabletWrapper flex={1}>
              {renderContent()}
            </TabletWrapper>
          ) : (
            renderContent()
          )}
        </YStack>
        {renderLocaleChangeOverlay()}
      </YStack>
    </ScreenContainer>
  );
}


export default HomeScreen;
