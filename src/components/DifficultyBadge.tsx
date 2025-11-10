import React from "react";
import { styled } from "@tamagui/core";
import { XStack } from "tamagui";
import { tokens } from "../theme/tokens";
import { LabelText } from "./Typography";
import { useTranslation, translateDifficulty } from "../i18n";

interface DifficultyBadgeProps {
  difficulty: string;
}

const BadgeContainer = styled(XStack, {
  backgroundColor: "rgba(255, 159, 64, 0.15)",
  paddingHorizontal: tokens.space.md,
  paddingVertical: tokens.space.sm,
  borderRadius: tokens.radius.full,
  alignSelf: "flex-start",
});

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  const { t } = useTranslation();
  const translatedDifficulty = translateDifficulty(difficulty, t);

  return (
    <BadgeContainer>
      <LabelText
        fontSize={12}
        fontWeight={tokens.fontWeight.semibold}
        color="#FF9F40"
      >
        {translatedDifficulty}
      </LabelText>
    </BadgeContainer>
  );
}
