import React, { useEffect, useState, useCallback, useMemo } from "react";
import { StatusBar } from "expo-status-bar";
import { SectionList, RefreshControl, ActivityIndicator } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { Lightbulb } from "@tamagui/lucide-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeIn } from "react-native-reanimated";
import { tokens } from "../../src/theme/tokens";
import {
  H2,
  BodyText,
  EmptyState,
  ScreenContainer,
  ScreenHeader,
  SectionHeaderContainer,
  ContentContainer,
  LoadingContainer,
  useIconColor,
} from "../../src/components";
import { ImageFactCard } from "../../src/components/ImageFactCard";
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
import { FACT_SECTION_LIST_FULL_SETTINGS, MAX_PREFETCH_CACHE_SIZE } from "../../src/config/factListSettings";

// Interface for fact sections
interface FactSection {
  title: string;
  data: FactWithRelations[];
}

// Prefetch cache
const prefetchedImages = new Set<string>();

// Prefetch images for faster loading in modal
const prefetchFactImages = (facts: FactWithRelations[]) => {
  const imageUrls = facts
    .filter((fact) => fact.image_url)
    .map((fact) => fact.image_url!);

  const newImageUrls = imageUrls.filter((url) => !prefetchedImages.has(url));

  if (newImageUrls.length > 0) {
    if (prefetchedImages.size > MAX_PREFETCH_CACHE_SIZE) {
      prefetchedImages.clear();
    }
    Image.prefetch(newImageUrls);
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

// Simple list item component
const FactListItem = React.memo(({ 
  item, 
  onPress 
}: { 
  item: FactWithRelations; 
  onPress: () => void;
}) => (
  <ContentContainer>
    <ImageFactCard
      title={item.title || item.content.substring(0, 80) + "..."}
      imageUrl={item.image_url!}
      factId={item.id}
      category={item.categoryData || item.category}
      categorySlug={item.categoryData?.slug || item.category}
      onPress={onPress}
    />
  </ContentContainer>
));

FactListItem.displayName = 'FactListItem';

// Simple section header
const SectionHeader = React.memo(({ title }: { title: string }) => (
  <SectionHeaderContainer>
    <H2>{title}</H2>
  </SectionHeaderContainer>
));

SectionHeader.displayName = 'SectionHeader';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const iconColor = useIconColor();

  const [sections, setSections] = useState<FactSection[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() => getRefreshStatus());

  // Reload facts when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadFacts();
      trackScreenView(Screens.HOME);
    }, [locale])
  );

  // Auto-refresh feed when new notifications are received
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(
      async (notification) => {
        const factId = notification.request.content.data.factId;
        if (factId) {
          try {
            await database.markFactAsShown(factId as number);
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
    const unsubscribe = onFeedRefresh(() => loadFacts());
    return () => unsubscribe();
  }, []);

  // Auto-refresh feed when preferences change
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => loadFacts());
    return () => unsubscribe();
  }, []);

  // Subscribe to background refresh status
  useEffect(() => {
    const unsubscribe = onRefreshStatusChange(setBackgroundRefreshStatus);
    return () => unsubscribe();
  }, []);

  const loadFacts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      const markedCount = await database.markDeliveredFactsAsShown(locale);
      if (markedCount > 0) {
        console.log(`✅ Marked ${markedCount} delivered facts as shown`);
      }

      const facts = await database.getFactsGroupedByDate(locale);
      prefetchFactImages(facts);
      setSections(groupFactsByDate(facts, t, locale));
    } catch (error) {
      console.error("Error loading facts:", error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [locale, t]);

  const handleFactPress = useCallback(async (fact: FactWithRelations) => {
    await trackFactView();
    checkAndRequestReview();
    router.push(`/fact/${fact.id}?source=feed`);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    trackFeedRefresh('pull');
    try {
      await forceRefreshContent();
    } catch (error) {
      console.error("Error refreshing content:", error);
    }
    await loadFacts(false);
  }, [loadFacts]);

  const keyExtractor = useCallback((item: FactWithRelations, index: number) => 
    item?.id?.toString() ?? `fallback-${index}`, []);

  const renderItem = useCallback(({ item }: { item: FactWithRelations }) => {
    if (!item?.id) return null;
    return (
      <FactListItem
        item={item}
        onPress={() => handleFactPress(item)}
      />
    );
  }, [handleFactPress]);

  const renderSectionHeader = useCallback(({ section: { title } }: { section: FactSection }) => (
    <SectionHeader title={title} />
  ), []);

  const refreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
  ), [refreshing, handleRefresh]);

  // Loading state
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

  return (
    <ScreenContainer edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      
      <Animated.View entering={FadeIn.duration(300)}>
        <ScreenHeader
          icon={<Lightbulb size={24} color={iconColor} />}
          title={t("factsFeed")}
        />
      </Animated.View>

      <YStack flex={1}>
        {sections.length === 0 ? (
          <EmptyState
            title={t("emptyStateTitle")}
            description={t("emptyStateDescription")}
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={keyExtractor}
            renderSectionHeader={renderSectionHeader}
            renderItem={renderItem}
            refreshControl={refreshControl}
            {...FACT_SECTION_LIST_FULL_SETTINGS}
          />
        )}

        {backgroundRefreshStatus === 'locale-change' && (
          <LocaleChangeOverlay>
            <ActivityIndicator size="large" color={tokens.color[theme].primary} />
            <BodyText fontSize={tokens.fontSize.body} color="$textSecondary">
              {t("updatingLanguage")}
            </BodyText>
          </LocaleChangeOverlay>
        )}
      </YStack>
    </ScreenContainer>
  );
}

// Helper function to group facts by date
function groupFactsByDate(
  facts: FactWithRelations[],
  t: (key: "today" | "yesterday") => string,
  locale: string
): FactSection[] {
  const today = new Date();
  const todayString = today.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toISOString().split("T")[0];

  const grouped: { [key: string]: FactWithRelations[] } = {};

  facts.forEach((fact) => {
    let dateKey: string;
    if (fact.shown_in_feed === 1 && !fact.scheduled_date) {
      dateKey = todayString;
    } else if (fact.scheduled_date) {
      dateKey = fact.scheduled_date.split("T")[0];
    } else {
      return;
    }

    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(fact);
  });

  return Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => {
      let title: string;
      if (dateKey === todayString) {
        title = t("today");
      } else if (dateKey === yesterdayString) {
        title = t("yesterday");
      } else {
        title = new Date(dateKey).toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      return {
        title,
        data: grouped[dateKey].filter(item => item?.id),
      };
    })
    .filter(section => section.data.length > 0);
}

export default HomeScreen;
