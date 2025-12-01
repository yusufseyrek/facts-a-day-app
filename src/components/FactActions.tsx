import React, { useState, useEffect } from "react";
import { Share, Alert, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { Heart, Share as ShareIcon, Flag } from "@tamagui/lucide-icons";
import * as database from "../services/database";
import * as api from "../services/api";
import { useTranslation } from "../i18n";
import { ReportFactModal } from "./ReportFactModal";
import { tokens, useTheme } from "../theme";

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
});

export function FactActions({
  factId,
  factTitle,
  factContent,
}: FactActionsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // Neon colors for actions
  const heartColor = theme === "dark" ? tokens.color.dark.neonRed : tokens.color.light.neonRed;
  const shareColor = theme === "dark" ? tokens.color.dark.neonGreen : tokens.color.light.neonGreen;
  const flagColor = theme === "dark" ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;

  const [isFavorited, setIsFavorited] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

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
      // Provide immediate haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newFavoriteStatus = await database.toggleFavorite(factId);
      setIsFavorited(newFavoriteStatus);
    } catch (error) {
      if (__DEV__) {
        console.error("Error toggling favorite:", error);
      }
      Alert.alert(t("error"), t("failedToUpdateFavorite"));
    }
  };

  const handleShare = async () => {
    try {
      // Light haptic feedback for share action
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const shareContent = factTitle
        ? `${factTitle}\n\n${factContent}\n\n${t("sharedFromApp")}`
        : `${factContent}\n\n${t("sharedFromApp")}`;

      await Share.share({
        message: shareContent,
      });
    } catch (error) {
      if (__DEV__) {
        console.error("Error sharing fact:", error);
      }
    }
  };

  const handleReport = () => {
    // Light haptic feedback for opening report modal
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowReportModal(true);
  };

  const handleSubmitReport = async (feedbackText: string) => {
    setIsSubmittingReport(true);
    try {
      await api.reportFact(factId, feedbackText);
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
  };

  return (
    <>
      <Container
        style={{
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 10,
        }}
      >
        <ActionsRow>
          {/* Like Button - Neon Red/Magenta */}
          <Pressable
            onPress={handleLike}
            style={({ pressed }) => ({
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
              padding: 12,
            })}
          >
            <Heart
              size={26}
              color={heartColor}
              fill={isFavorited ? heartColor : "none"}
            />
          </Pressable>

          {/* Share Button - Neon Green */}
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => ({
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
              padding: 12,
            })}
          >
            <ShareIcon size={26} color={shareColor} />
          </Pressable>

          {/* Report Button - Subtle */}
          <Pressable
            onPress={handleReport}
            disabled={isSubmittingReport}
            style={({ pressed }) => ({
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : isSubmittingReport ? 0.5 : 1,
              padding: 12,
            })}
          >
            <Flag size={26} color={flagColor} />
          </Pressable>
        </ActionsRow>
      </Container>

      <ReportFactModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleSubmitReport}
        isSubmitting={isSubmittingReport}
      />
    </>
  );
}
