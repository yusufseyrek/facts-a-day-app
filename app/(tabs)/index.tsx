import React, { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SectionList, RefreshControl, ActivityIndicator } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { Clock } from "@tamagui/lucide-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { tokens } from "../../src/theme/tokens";
import {
  H1,
  H2,
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
import { trackFactView } from "../../src/services/adManager";
import { checkAndRequestReview } from "../../src/services/appReview";
import { onFeedRefresh } from "../../src/services/contentRefresh";

// Prefetch images for faster loading in modal
const prefetchFactImages = (facts: FactWithRelations[]) => {
  const imageUrls = facts
    .filter((fact) => fact.image_url)
    .map((fact) => fact.image_url!);

  if (imageUrls.length > 0) {
    Image.prefetch(imageUrls);
    console.log(`🖼️ Prefetching ${imageUrls.length} fact images`);
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
});

const SectionHeader = styled(YStack, {
  paddingHorizontal: tokens.space.xl,
  paddingVertical: tokens.space.md,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  paddingHorizontal: tokens.space.lg,
});

const LoadingContainer = styled(YStack, {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  gap: tokens.space.md,
});

interface FactSection {
  title: string;
  data: FactWithRelations[];
}

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sections, setSections] = useState<FactSection[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

      // Debug logging
      console.log(`📊 Loaded ${facts.length} facts for locale: ${locale}`);
      console.log(
        "Facts with shown_in_feed:",
        facts.filter((f) => f.shown_in_feed === 1).length
      );
      console.log(
        "Facts with scheduled_date:",
        facts.filter((f) => f.scheduled_date).length
      );
      if (facts.length > 0) {
        console.log("Sample fact:", {
          id: facts[0].id,
          shown_in_feed: facts[0].shown_in_feed,
          scheduled_date: facts[0].scheduled_date,
          language: facts[0].language,
        });
      }

      // Prefetch images for faster modal loading
      prefetchFactImages(facts);

      // Group facts by date
      const groupedFacts = groupFactsByDate(facts);
      console.log(`📦 Grouped into ${groupedFacts.length} sections`);
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

  const handleRefresh = () => {
    loadFacts(true);
  };

  // Only show loading spinner on initial load when there's no data yet
  if (initialLoading && sections.length === 0) {
    return (
      <Container edges={["top"]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </Container>
    );
  }

  if (sections.length === 0) {
    return (
      <Container edges={["top"]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <EmptyState
          title={t("emptyStateTitle")}
          description={t("emptyStateDescription")}
        />
      </Container>
    );
  }

  return (
    <Container edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <YStack flex={1}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{
            paddingBottom: 70,
          }}
          ListHeaderComponent={() => (
            <Header>
              <XStack alignItems="center" gap={tokens.space.sm}>
                <Clock
                  size={28}
                  color={theme === "dark" ? "#FFFFFF" : tokens.color.light.text}
                />
                <H1>{t("recentFacts")}</H1>
              </XStack>
            </Header>
          )}
          renderSectionHeader={({ section: { title } }) => (
            <SectionHeader>
              <H2>{title}</H2>
            </SectionHeader>
          )}
          renderItem={({ item, section, index }) => {
            // Use HeroFactCard for the first item in the first section (Today)
            const isFirstItem = sections.indexOf(section) === 0 && index === 0;
            const categoryColor = item.categoryData?.color_hex || "#0066FF";

            return (
              <ContentContainer>
                {isFirstItem ? (
                  <HeroFactCard
                    title={item.title || item.content.substring(0, 80) + "..."}
                    summary={item.summary}
                    categoryColor={categoryColor}
                    onPress={() => handleFactPress(item)}
                  />
                ) : (
                  <FeedFactCard
                    title={item.title || item.content.substring(0, 80) + "..."}
                    summary={item.summary}
                    onPress={() => handleFactPress(item)}
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
        <YStack
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          backgroundColor="$background"
          borderTopWidth={1}
          borderTopColor="$borderColor"
        >
          <BannerAd position="home" />
        </YStack>
      </YStack>
    </Container>
  );
}

export default HomeScreen;
