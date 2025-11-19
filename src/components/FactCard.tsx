import React from "react";
import { ScrollView, Image, Linking, Pressable } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { tokens } from "../theme/tokens";
import { BodyText } from "./Typography";
import { CategoryBadge } from "./CategoryBadge";
import { useTheme } from "../theme";
import { useTranslation } from "../i18n";
import type { FactWithRelations, Category } from "../services/database";

// Re-export FactWithRelations as Fact for backward compatibility
export type { FactWithRelations as Fact } from "../services/database";

interface FactCardProps {
  fact: FactWithRelations;
  onReadMore?: () => void;
}

const CardContainer = styled(YStack, {
  backgroundColor: "$cardBackground",
  borderRadius: tokens.radius.lg,
  flex: 1,
});

const ContentScrollView = styled(ScrollView, {
  flex: 1,
  paddingHorizontal: tokens.space.xl,
});

const ContentInner = styled(YStack, {
  gap: tokens.space.lg,
  paddingTop: tokens.space.xl,
  paddingBottom: tokens.space.xl,
});

const FactImage = styled(Image, {
  width: "100%",
  height: 200,
  borderRadius: tokens.radius.md,
});

const BadgesRow = styled(XStack, {
  gap: tokens.space.sm,
  flexWrap: "wrap",
});

const SourceSection = styled(YStack, {
  gap: tokens.space.xs,
  paddingTop: tokens.space.md,
});

// Helper function to format slug to title case
function slugToTitleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function FactCard({ fact, onReadMore }: FactCardProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  // Determine what to pass to CategoryBadge
  let categoryForBadge: string | Category | null = null;
  if (fact.categoryData) {
    // Pass the full Category object to leverage color_hex
    categoryForBadge = fact.categoryData;
  } else if (fact.category) {
    // Fall back to parsing the category slug
    try {
      const parsed = JSON.parse(fact.category);
      categoryForBadge = parsed.name || parsed.slug || fact.category;
    } catch {
      categoryForBadge = slugToTitleCase(fact.category);
    }
  }

  const handleSourcePress = () => {
    if (fact.source_url) {
      Linking.openURL(fact.source_url).catch((err) => {
        console.error("Failed to open URL:", err);
      });
    }
  };

  return (
    <CardContainer>
      {/* Single ScrollView for all content */}
      <ContentScrollView showsVerticalScrollIndicator={false}>
        <ContentInner>
          {/* Main Content */}
          <BodyText fontSize={16} lineHeight={26} color="$text">
            {fact.content}
          </BodyText>

          {/* Image */}
          {fact.image_url && (
            <FactImage source={{ uri: fact.image_url }} resizeMode="cover" />
          )}

          {/* Badges */}
          {categoryForBadge && (
            <BadgesRow>
              <CategoryBadge category={categoryForBadge} />
            </BadgesRow>
          )}

          {/* Source Link */}
          {fact.source_url && (
            <SourceSection>
              <Pressable onPress={handleSourcePress}>
                <BodyText
                  fontSize={14}
                  color="$primary"
                  textDecorationLine="underline"
                >
                  {t("sourcePrefix")}
                  {extractDomain(fact.source_url, t)}
                </BodyText>
              </Pressable>
            </SourceSection>
          )}
        </ContentInner>
      </ContentScrollView>
    </CardContainer>
  );
}

// Helper to extract domain from URL
function extractDomain(url: string, t: ReturnType<typeof useTranslation>['t']): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return t("externalLink");
  }
}
