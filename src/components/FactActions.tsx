import React, { useState, useEffect } from "react";
import { Share, Alert, Pressable } from "react-native";

import { styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { Heart, Share as ShareIcon, Flag } from "@tamagui/lucide-icons";
import { LabelText } from "./Typography";
import * as database from "../services/database";
import * as api from "../services/api";
import { useTranslation } from "../i18n";

interface FactActionsProps {
  factId: number;
  factTitle?: string;
  factContent: string;
}

const Container = styled(YStack, {
  borderTopWidth: 1,
  borderTopColor: "$border",
  backgroundColor: "$background",
});

const ActionsRow = styled(XStack, {
  justifyContent: "space-around",
  alignItems: "center",
  height: 60,
  paddingTop: 10,
});

export function FactActions({
  factId,
  factTitle,
  factContent,
}: FactActionsProps) {
  const { t } = useTranslation();

  const [isFavorited, setIsFavorited] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Check if fact is favorited on mount
  useEffect(() => {
    checkFavoriteStatus();
  }, [factId]);

  const checkFavoriteStatus = async () => {
    try {
      const favorited = await database.isFactFavorited(factId);
      setIsFavorited(favorited);
    } catch (error) {
      console.error("Error checking favorite status:", error);
    }
  };

  const handleLike = async () => {
    try {
      const newFavoriteStatus = await database.toggleFavorite(factId);
      setIsFavorited(newFavoriteStatus);
    } catch (error) {
      console.error("Error toggling favorite:", error);
      Alert.alert(t("error"), t("failedToUpdateFavorite"));
    }
  };

  const handleShare = async () => {
    try {
      const shareContent = factTitle
        ? `${factTitle}\n\n${factContent}\n\n${t("sharedFromApp")}`
        : `${factContent}\n\n${t("sharedFromApp")}`;

      await Share.share({
        message: shareContent,
      });
    } catch (error) {
      console.error("Error sharing fact:", error);
    }
  };

  const handleReport = () => {
    Alert.prompt(
      t("reportFact"),
      t("whatIsWrong"),
      [
        {
          text: t("cancel"),
          style: "cancel",
        },
        {
          text: t("submit"),
          onPress: async (feedbackText?: string) => {
            if (!feedbackText || feedbackText.trim() === "") {
              Alert.alert(t("error"), t("provideFeedback"));
              return;
            }

            const trimmedFeedback = feedbackText.trim();

            if (trimmedFeedback.length < 10) {
              Alert.alert(t("error"), t("feedbackMinLength"));
              return;
            }

            if (trimmedFeedback.length > 1000) {
              Alert.alert(t("error"), t("feedbackMaxLength"));
              return;
            }

            setIsSubmittingReport(true);
            try {
              await api.reportFact(factId, trimmedFeedback);
              Alert.alert(t("success"), t("reportSubmitted"));
            } catch (error) {
              console.error("Error submitting report:", error);
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : t("failedToSubmitReport");
              Alert.alert(t("error"), errorMessage);
            } finally {
              setIsSubmittingReport(false);
            }
          },
        },
      ],
      "plain-text"
    );
  };

  return (
    <Container>
      <ActionsRow>
        {/* Like Button - Red */}
        <Pressable
          onPress={handleLike}
          style={({ pressed }) => ({
            alignItems: "flex-end",
            justifyContent: "flex-end",
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 20,
          })}
        >
          <YStack alignItems="center" gap={4}>
            <Heart
              size={24}
              color={isFavorited ? "#EF4444" : "#EF4444"}
              fill={isFavorited ? "#EF4444" : "none"}
            />
            <LabelText fontSize={11} color="#EF4444">
              {t("like")}
            </LabelText>
          </YStack>
        </Pressable>

        {/* Share Button - Green */}
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => ({
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 20,
          })}
        >
          <YStack alignItems="center" gap={4}>
            <ShareIcon size={24} color="#10B981" />
            <LabelText fontSize={11} color="#10B981">
              {t("share")}
            </LabelText>
          </YStack>
        </Pressable>

        {/* Report Button - Gray */}
        <Pressable
          onPress={handleReport}
          disabled={isSubmittingReport}
          style={({ pressed }) => ({
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : isSubmittingReport ? 0.5 : 1,
            paddingHorizontal: 20,
          })}
        >
          <YStack alignItems="center" gap={4}>
            <Flag size={24} color="#6B7280" />
            <LabelText fontSize={11} color="#6B7280">
              {t("report")}
            </LabelText>
          </YStack>
        </Pressable>
      </ActionsRow>
    </Container>
  );
}
