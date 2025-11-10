import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SectionList, RefreshControl, ActivityIndicator } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { Clock } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import { tokens } from "../../src/theme/tokens";
import { H1, H2, FeedFactCard, EmptyState } from "../../src/components";
import type { FactWithRelations } from "../../src/services/database";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as database from "../../src/services/database";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const Header = styled(XStack, {
  padding: tokens.space.xl,
  paddingBottom: tokens.space.md,
  alignItems: "center",
  gap: tokens.space.sm,
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

export default function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sections, setSections] = useState<FactSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFacts();
  }, [locale]);

  const loadFacts = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Get facts grouped by date
      const facts = await database.getFactsGroupedByDate(locale);

      // Group facts by date
      const groupedFacts = groupFactsByDate(facts);
      setSections(groupedFacts);
    } catch (error) {
      console.error("Error loading facts:", error);
    } finally {
      setLoading(false);
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
      if (!fact.scheduled_date) return;

      const dateKey = fact.scheduled_date.split("T")[0];
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
          // Format date as "October 24, 2023"
          const date = new Date(dateKey);
          title = date.toLocaleDateString("en-US", {
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

  const handleFactPress = (fact: FactWithRelations) => {
    router.push(`/fact/${fact.id}`);
  };

  const handleRefresh = () => {
    loadFacts(true);
  };

  if (loading) {
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: tokens.space.lg,
        }}
        ListHeaderComponent={() => (
          <Header>
            <Clock
              size={28}
              color={theme === "dark" ? "#FFFFFF" : tokens.color.light.text}
            />
            <H1>{t("recentFacts")}</H1>
          </Header>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <SectionHeader>
            <H2>{title}</H2>
          </SectionHeader>
        )}
        renderItem={({ item }) => (
          <ContentContainer>
            <FeedFactCard
              title={item.title || item.content.substring(0, 80) + "..."}
              summary={item.summary}
              difficulty={item.difficulty}
              onPress={() => handleFactPress(item)}
            />
          </ContentContainer>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        stickySectionHeadersEnabled={true}
      />
    </Container>
  );
}
