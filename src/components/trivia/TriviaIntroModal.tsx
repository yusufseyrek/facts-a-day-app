import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { useTranslation } from '../../i18n';
import { getEstimatedTimeMinutes, MIXED_TRIVIA_QUESTIONS } from '../../services/trivia';
import { hexColors, useTheme } from '../../theme';
import { getContrastColor } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import { DialogShell } from '../DialogShell';
import { CheckCircle, Clock, Grid, ListChecks, Play, Shuffle, Trophy, Zap } from '../icons';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import type { TriviaQuestionFormat } from '../../services/api';

export type TriviaType = 'daily' | 'mixed' | 'category';

/** The question-type selector: both formats or a single one. */
type FormatSelection = 'all' | TriviaQuestionFormat;

interface TriviaIntroModalProps {
  visible: boolean;
  /** `format` is set when the user narrowed a mixed or category session to one
      question type via the in-modal selector; undefined = the full batch. */
  onStart: (format?: TriviaQuestionFormat) => void;
  onClose: () => void;
  type: TriviaType;
  categoryName?: string;
  categoryDescription?: string;
  categoryIcon?: string;
  categoryColor?: string;
  questionCount: number;
  /** Per-format slices of the mixed pool (mixed type only) — gate and size the
      mixed selector chips. Category pools have no per-format counts, so
      category chips are never gated by these. */
  trueFalseCount?: number;
  multipleChoiceCount?: number;
  masteredCount?: number;
  totalQuestions?: number;
  answeredCount?: number;
  correctCount?: number;
}

export function TriviaIntroModal({
  visible,
  onStart,
  onClose,
  type,
  categoryName,
  categoryDescription,
  categoryIcon,
  categoryColor,
  questionCount,
  trueFalseCount = 0,
  multipleChoiceCount = 0,
  masteredCount: _masteredCount = 0,
  totalQuestions = 0,
  answeredCount = 0,
  correctCount = 0,
}: TriviaIntroModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { typography, iconSizes, spacing, radius, media } = useResponsive();
  const isDark = theme === 'dark';
  const iconContainerSize = media.topicCardSize * 0.55;
  const smallIconSize = media.topicCardSize * 0.4;

  // Colors
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const surfaceColor = isDark ? hexColors.dark.surface : hexColors.light.surface;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;

  // Question-type selection (mixed + category). Reset on every open: a fresh
  // modal always offers the full batch, never a leftover narrowing.
  const [format, setFormat] = useState<FormatSelection>('all');
  useEffect(() => {
    if (visible) setFormat('all');
  }, [visible]);

  const selectedFormat: TriviaQuestionFormat | undefined =
    (type === 'mixed' || type === 'category') && format !== 'all' ? format : undefined;

  // Narrowing to one format swaps in that format's slice of the pool — mixed
  // only: category sessions have no per-format counts, so they keep showing
  // the session size (the fetch clamps to what the category actually has).
  const displayQuestionCount =
    type === 'mixed' && selectedFormat === 'true_false'
      ? Math.min(trueFalseCount, MIXED_TRIVIA_QUESTIONS)
      : type === 'mixed' && selectedFormat === 'multiple_choice'
        ? Math.min(multipleChoiceCount, MIXED_TRIVIA_QUESTIONS)
        : questionCount;

  // Accent color is fixed per modal type (mixed keeps the purple its grid
  // card owns) — deliberately NOT swapped when the format selection changes,
  // so narrowing never re-tints the dialog.
  const accentColor =
    type === 'daily'
      ? primaryColor
      : type === 'mixed'
        ? purpleColor
        : categoryColor || primaryColor;

  // Get the appropriate icon
  const renderIcon = () => {
    if (type === 'daily') {
      return <Zap size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />;
    }
    if (type === 'mixed') {
      if (selectedFormat === 'true_false') {
        return <CheckCircle size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />;
      }
      if (selectedFormat === 'multiple_choice') {
        return <Grid size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />;
      }
      return <Shuffle size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />;
    }
    return getLucideIcon(categoryIcon, iconSizes.lg, '#FFFFFF');
  };

  // Get title
  const getTitle = () => {
    if (type === 'daily') return t('dailyTrivia');
    if (type === 'mixed') {
      if (selectedFormat === 'true_false') return t('trueFalseTrivia');
      if (selectedFormat === 'multiple_choice') return t('multipleChoiceTrivia');
      return t('mixedTrivia');
    }
    return `${categoryName} ${t('trivia')}`;
  };

  // Get description
  const getDescription = () => {
    if (type === 'daily') return t('dailyTriviaDesc');
    if (type === 'mixed') {
      if (selectedFormat === 'true_false') return t('trueFalseTriviaDesc');
      if (selectedFormat === 'multiple_choice') return t('multipleChoiceTriviaDesc');
      return t('mixedTriviaDesc');
    }
    return categoryDescription || '';
  };

  // Personal accuracy across previously answered questions in this scope.
  const accuracyPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  // Selector chips. All share the modal's accent so a selection never shifts
  // the dialog's colors. Mixed gates a format with no unanswered questions
  // left (offered but inert); category pools have no per-format counts, so
  // category chips stay enabled and an empty narrowing surfaces at fetch time.
  const formatOptions = [
    { key: 'all', label: t('triviaFormatAll'), enabled: true },
    {
      key: 'true_false',
      label: t('trueFalseTrivia'),
      enabled: type !== 'mixed' || trueFalseCount > 0,
    },
    {
      key: 'multiple_choice',
      label: t('multipleChoiceTrivia'),
      enabled: type !== 'mixed' || multipleChoiceCount > 0,
    },
  ] as const;

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      // Lighter-than-default dim: keep the trivia hub clearly visible through
      // the Liquid Glass behind the start dialog.
      dimOverride={isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'}
      showClose
    >
      {/* Header (bespoke icon+title row, so it lives in children rather than
          the shell's centered-circle header slot) */}
      <YStack
        paddingTop={spacing.xl}
        paddingHorizontal={spacing.lg}
        paddingBottom={spacing.md}
        gap={spacing.sm}
        alignItems="center"
      >
        {/* Icon + Title Row */}
        <XStack alignItems="center" justifyContent="center" gap={spacing.md}>
          <YStack
            width={iconContainerSize}
            height={iconContainerSize}
            borderRadius={radius.md}
            backgroundColor={accentColor}
            justifyContent="center"
            alignItems="center"
          >
            {renderIcon()}
          </YStack>
          <Text.Title color={textColor} numberOfLines={2} textAlign="center">
            {getTitle()}
          </Text.Title>
        </XStack>

        {/* Description. Mixed swaps this text with the format selection, and
            the longest localized variants wrap to a second line on narrow
            phones — reserving two caption lines keeps the dialog height
            steady across chip taps. */}
        {getDescription() && (
          <YStack
            minHeight={type === 'mixed' ? typography.lineHeight.caption * 2 : undefined}
            justifyContent="center"
          >
            <Text.Caption color={secondaryTextColor} textAlign="center">
              {getDescription()}
            </Text.Caption>
          </YStack>
        )}
      </YStack>

      {/* Divider */}
      <YStack height={1} backgroundColor={borderColor} marginHorizontal={spacing.lg} />

      {/* Stats Grid - Redesigned */}
      <XStack paddingHorizontal={spacing.lg} paddingVertical={spacing.md} gap={spacing.md}>
        {/* Questions Box */}
        <YStack
          flex={1}
          backgroundColor={`${accentColor}15`}
          borderRadius={radius.lg}
          padding={spacing.md}
          borderWidth={1}
          borderColor={`${accentColor}30`}
          alignItems="center"
        >
          <XStack alignItems="center" gap={spacing.sm} marginBottom={spacing.xs}>
            <YStack
              width={smallIconSize}
              height={smallIconSize}
              borderRadius={radius.sm}
              backgroundColor={accentColor}
              justifyContent="center"
              alignItems="center"
            >
              <ListChecks size={typography.fontSize.title} color="#FFFFFF" strokeWidth={2.5} />
            </YStack>
            <Text.Headline color={textColor}>{displayQuestionCount}</Text.Headline>
          </XStack>
          <Text.Caption
            color={secondaryTextColor}
            fontFamily={FONT_FAMILIES.medium}
            textAlign="center"
          >
            {t('triviaQuestions')}
          </Text.Caption>
        </YStack>

        {/* Time Box */}
        <YStack
          flex={1}
          backgroundColor={isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'}
          borderRadius={radius.lg}
          padding={spacing.md}
          borderWidth={1}
          borderColor={isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}
          alignItems="center"
        >
          <XStack alignItems="center" gap={spacing.sm} marginBottom={spacing.xs}>
            <YStack
              width={smallIconSize}
              height={smallIconSize}
              borderRadius={radius.sm}
              backgroundColor={isDark ? '#818CF8' : '#6366F1'}
              justifyContent="center"
              alignItems="center"
            >
              <Clock size={typography.fontSize.title} color="#FFFFFF" strokeWidth={2.5} />
            </YStack>
            <Text.Headline color={textColor}>
              ~{getEstimatedTimeMinutes(displayQuestionCount, selectedFormat)}
            </Text.Headline>
          </XStack>
          <Text.Caption
            color={secondaryTextColor}
            fontFamily={FONT_FAMILIES.medium}
            textAlign="center"
          >
            {t('triviaMinutes')}
          </Text.Caption>
        </YStack>
      </XStack>

      {/* Info Cards */}
      <YStack paddingHorizontal={spacing.lg} gap={spacing.xs} marginBottom={spacing.md}>
        {/* Personal accuracy (replaces the answered/mastered progress
            card — accuracy is the number players actually chase) */}
        {(type === 'category' || type === 'mixed') && answeredCount > 0 && (
          <XStack
            backgroundColor={surfaceColor}
            borderRadius={radius.md}
            padding={spacing.md}
            alignItems="center"
            gap={spacing.sm}
          >
            <Trophy size={typography.fontSize.title} color={successColor} />
            <YStack flex={1} gap={2}>
              <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textColor}>
                {t('accuracy')}: {accuracyPct}%
              </Text.Caption>
              <Text.Tiny color={secondaryTextColor}>
                {totalQuestions > 0
                  ? `${answeredCount}/${totalQuestions} ${t('triviaAnswered')}`
                  : `${answeredCount} ${t('triviaAnswered')}`}
              </Text.Tiny>
            </YStack>
          </XStack>
        )}

        {/* Question Types: an interactive format selector for mixed and
            category (both formats / T/F-only / MC-only — the old dedicated
            cards folded into this dialog), a static note for daily (the
            curated daily batch isn't format-filterable). */}
        {type !== 'daily' ? (
          <YStack
            backgroundColor={surfaceColor}
            borderRadius={radius.md}
            padding={spacing.md}
            gap={spacing.sm}
          >
            <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textColor}>
              {t('triviaQuestionType')}
            </Text.Caption>
            {/* Chips size from their label, NOT equal thirds — squeezed into
                thirds the wordiest locales ('Doğru mu Yanlış mı', 'Verdadero
                o Falso') ellipsize on 360dp phones even at the font-shrink
                floor. A locale that overflows the row wraps its longest chip
                to a full-width line instead. */}
            <XStack gap={spacing.xs} flexWrap="wrap">
              {formatOptions.map((option) => {
                const selected = format === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setFormat(option.key)}
                    disabled={!option.enabled}
                    // Lifts the ~35pt pill to the 44pt touch-target guideline.
                    hitSlop={{ top: 6, bottom: 6 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !option.enabled }}
                    accessibilityLabel={option.label}
                    testID={`trivia-format-${option.key}`}
                    style={({ pressed }) => ({
                      flexGrow: 1,
                      opacity: !option.enabled ? 0.35 : pressed ? 0.8 : 1,
                    })}
                  >
                    <YStack
                      paddingVertical={spacing.sm}
                      paddingHorizontal={spacing.sm}
                      borderRadius={radius.full}
                      borderWidth={1}
                      borderColor={selected ? accentColor : borderColor}
                      backgroundColor={selected ? accentColor : 'transparent'}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text.Caption
                        fontFamily={FONT_FAMILIES.semibold}
                        color={selected ? getContrastColor(accentColor) : secondaryTextColor}
                        numberOfLines={1}
                        textAlign="center"
                      >
                        {option.label}
                      </Text.Caption>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
          </YStack>
        ) : (
          <XStack
            backgroundColor={surfaceColor}
            borderRadius={radius.md}
            padding={spacing.md}
            alignItems="center"
            gap={spacing.sm}
          >
            <CheckCircle size={typography.fontSize.title} color={isDark ? '#FBBF24' : '#F59E0B'} />
            <YStack flex={1}>
              <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textColor}>
                {t('triviaQuestionType')}
              </Text.Caption>
              <Text.Tiny color={secondaryTextColor}>{t('triviaQuestionTypeDesc')}</Text.Tiny>
            </YStack>
          </XStack>
        )}
      </YStack>

      {/* Start Button */}
      <YStack paddingHorizontal={spacing.lg} paddingBottom={spacing.lg}>
        <Pressable
          onPress={() => onStart(selectedFormat)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
          testID="trivia-start-button"
          accessibilityLabel={t('triviaStartTest')}
        >
          <XStack
            backgroundColor={accentColor}
            paddingVertical={spacing.md}
            paddingHorizontal={spacing.xl}
            borderRadius={radius.full}
            alignItems="center"
            justifyContent="center"
            gap={spacing.sm}
          >
            <Play size={typography.fontSize.title} color="#FFFFFF" fill="#FFFFFF" />
            <Text.Body fontFamily={FONT_FAMILIES.semibold} color="#FFFFFF">
              {t('triviaStartTest')}
            </Text.Body>
          </XStack>
        </Pressable>
      </YStack>
    </DialogShell>
  );
}
