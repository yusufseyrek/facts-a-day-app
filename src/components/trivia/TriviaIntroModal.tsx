import { Pressable } from 'react-native';

import { useTranslation } from '../../i18n';
import { getEstimatedTimeMinutes } from '../../services/trivia';
import { hexColors, useTheme } from '../../theme';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import { DialogShell } from '../DialogShell';
import { CheckCircle, Clock, HelpCircle, Play, Shuffle, Trophy, Zap } from '../icons';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

export type TriviaType = 'daily' | 'mixed' | 'category';

interface TriviaIntroModalProps {
  visible: boolean;
  onStart: () => void;
  onClose: () => void;
  type: TriviaType;
  categoryName?: string;
  categoryDescription?: string;
  categoryIcon?: string;
  categoryColor?: string;
  questionCount: number;
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

  // Determine accent color based on type
  const getAccentColor = () => {
    if (type === 'daily') return primaryColor;
    if (type === 'mixed') return purpleColor;
    return categoryColor || primaryColor;
  };
  const accentColor = getAccentColor();

  // Get the appropriate icon
  const renderIcon = () => {
    if (type === 'daily') {
      return <Zap size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />;
    }
    if (type === 'mixed') {
      return <Shuffle size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />;
    }
    return getLucideIcon(categoryIcon, iconSizes.lg, '#FFFFFF');
  };

  // Get title
  const getTitle = () => {
    if (type === 'daily') return t('dailyTrivia');
    if (type === 'mixed') return t('mixedTrivia');
    return `${categoryName} ${t('trivia')}`;
  };

  // Get description
  const getDescription = () => {
    if (type === 'daily') return t('dailyTriviaDesc');
    if (type === 'mixed') return t('mixedTriviaDesc');
    return categoryDescription || '';
  };

  // Personal accuracy across previously answered questions in this scope.
  const accuracyPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

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

        {/* Description */}
        {getDescription() && (
          <Text.Caption color={secondaryTextColor} textAlign="center">
            {getDescription()}
          </Text.Caption>
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
              <HelpCircle size={typography.fontSize.title} color="#FFFFFF" strokeWidth={2.5} />
            </YStack>
            <Text.Headline color={textColor}>{questionCount}</Text.Headline>
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
              ~{getEstimatedTimeMinutes(questionCount)}
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

        {/* Question Types */}
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
      </YStack>

      {/* Start Button */}
      <YStack paddingHorizontal={spacing.lg} paddingBottom={spacing.lg}>
        <Pressable
          onPress={onStart}
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
