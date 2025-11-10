import React from "react";
import { Pressable } from "react-native";
import { styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { ChevronRight } from "@tamagui/lucide-icons";
import { tokens } from "../theme/tokens";
import { BodyText } from "./Typography";
import { useTheme } from "../theme";

interface FeedFactCardProps {
  title: string;
  summary?: string;
  difficulty?: string;
  onPress: () => void;
}

const CardWrapper = styled(YStack, {
  backgroundColor: "$cardBackground",
  borderRadius: tokens.radius.lg,
  padding: tokens.space.lg,
  marginBottom: tokens.space.sm,
});

const ContentRow = styled(XStack, {
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.md,
});

const TextContainer = styled(YStack, {
  flex: 1,
  gap: tokens.space.xs,
});

export function FeedFactCard({
  title,
  summary,
  difficulty,
  onPress,
}: FeedFactCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      android_ripple={{
        color: theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
        borderless: false,
      }}
    >
      <CardWrapper>
        <ContentRow>
          <TextContainer>
            <BodyText
              fontSize={16}
              lineHeight={22}
              color="$text"
              fontWeight={tokens.fontWeight.semibold}
              numberOfLines={2}
            >
              {title}
            </BodyText>
            {summary && (
              <BodyText
                fontSize={14}
                lineHeight={20}
                color="$textSecondary"
                numberOfLines={3}
              >
                {summary}
              </BodyText>
            )}
          </TextContainer>
          <ChevronRight
            size={20}
            color={
              theme === "dark" ? "#8892A6" : tokens.color.light.textSecondary
            }
          />
        </ContentRow>
      </CardWrapper>
    </Pressable>
  );
}
