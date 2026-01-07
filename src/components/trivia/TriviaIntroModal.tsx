import React from 'react';
import { Modal, Pressable, Dimensions, Platform } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { 
  Zap, 
  Shuffle, 
  Play, 
  X, 
  Clock, 
  HelpCircle,
  Target,
  Trophy,
  CheckCircle,
  CircleCheck,
} from '@tamagui/lucide-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { hexColors, spacing, radius, sizes } from '../../theme';
import { Text, FONT_FAMILIES } from '../Typography';
import { useTheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { getLucideIcon } from '../../utils/iconMapper';
import { getEstimatedTimeMinutes } from '../../services/trivia';
import { useResponsive } from '../../utils/useResponsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const ModalOverlay = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  padding: spacing.phone.md,
});

const ModalContent = styled(YStack, {
  width: '100%',
  borderRadius: radius.phone.xl,
  overflow: 'hidden',
});

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
  masteredCount = 0,
  totalQuestions = 0,
  answeredCount = 0,
  correctCount = 0,
}: TriviaIntroModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { typography: typo } = useResponsive();
  const isDark = theme === 'dark';

  // Colors
  const bgColor = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
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
    const iconSize = 24;
    if (type === 'daily') {
      return <Zap size={iconSize} color="#FFFFFF" strokeWidth={2} />;
    }
    if (type === 'mixed') {
      return <Shuffle size={iconSize} color="#FFFFFF" strokeWidth={2} />;
    }
    return getLucideIcon(categoryIcon, iconSize, '#FFFFFF');
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

  // Calculate remaining to master
  const remainingToMaster = totalQuestions - masteredCount;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <ModalOverlay>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={isDark ? 50 : 70}
            tint={isDark ? 'dark' : 'light'}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
        ) : (
          <YStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            backgroundColor={isDark ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.7)'}
          />
        )}

        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={onClose}
        />

        <Animated.View 
          entering={FadeInUp.duration(300).springify()}
          style={{ 
            width: SCREEN_WIDTH - spacing.phone.md * 2, 
            maxWidth: 400,
            // Shadow for iOS
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: isDark ? 0.5 : 0.25,
            shadowRadius: 24,
            // Elevation for Android
            elevation: 24,
          }}
        >
          <ModalContent backgroundColor={bgColor}>
            {/* Close button */}
            <Pressable
              onPress={onClose}
              style={{
                position: 'absolute',
                top: spacing.phone.md,
                right: spacing.phone.md,
                zIndex: 10,
                padding: spacing.phone.xs,
              }}
            >
              <X size={20} color={secondaryTextColor} />
            </Pressable>

            {/* Header */}
            <YStack 
              paddingTop={spacing.phone.xl} 
              paddingHorizontal={spacing.phone.lg}
              paddingBottom={spacing.phone.md}
              gap={spacing.phone.sm}
              alignItems="center"
            >
              {/* Icon + Title Row */}
              <XStack alignItems="center" justifyContent="center" gap={spacing.phone.md}>
                <YStack
                  width={44}
                  height={44}
                  borderRadius={radius.phone.md}
                  backgroundColor={accentColor}
                  justifyContent="center"
                  alignItems="center"
                >
                  {renderIcon()}
                </YStack>
                <Text.Title
                  color={textColor}
                  numberOfLines={2}
                  textAlign="center"
                >
                  {getTitle()}
                </Text.Title>
              </XStack>
              
              {/* Description */}
              {getDescription() && (
                <Text.Caption
                  color={secondaryTextColor}
                  textAlign="center"
                >
                  {getDescription()}
                </Text.Caption>
              )}
            </YStack>

            {/* Divider */}
            <YStack height={1} backgroundColor={borderColor} marginHorizontal={spacing.phone.lg} />

            {/* Stats Grid - Redesigned */}
            <XStack 
              paddingHorizontal={spacing.phone.lg}
              paddingVertical={spacing.phone.md}
              gap={spacing.phone.md}
            >
              {/* Questions Box */}
              <YStack 
                flex={1}
                backgroundColor={`${accentColor}15`}
                borderRadius={radius.phone.lg}
                padding={spacing.phone.md}
                borderWidth={1}
                borderColor={`${accentColor}30`}
                alignItems="center"
              >
                <XStack alignItems="center" gap={spacing.phone.sm} marginBottom={spacing.phone.xs}>
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={radius.phone.sm}
                    backgroundColor={accentColor}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <HelpCircle size={typo.fontSize.title} color="#FFFFFF" strokeWidth={2.5} />
                  </YStack>
                  <Text.Headline color={textColor}>
                    {questionCount}
                  </Text.Headline>
                </XStack>
                <Text.Caption color={secondaryTextColor} fontFamily={FONT_FAMILIES.medium} textAlign="center">
                  {t('triviaQuestions')}
                </Text.Caption>
              </YStack>

              {/* Time Box */}
              <YStack 
                flex={1}
                backgroundColor={isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'}
                borderRadius={radius.phone.lg}
                padding={spacing.phone.md}
                borderWidth={1}
                borderColor={isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}
                alignItems="center"
              >
                <XStack alignItems="center" gap={spacing.phone.sm} marginBottom={spacing.phone.xs}>
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={radius.phone.sm}
                    backgroundColor={isDark ? '#818CF8' : '#6366F1'}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Clock size={typo.fontSize.title} color="#FFFFFF" strokeWidth={2.5} />
                  </YStack>
                  <Text.Headline color={textColor}>
                    ~{getEstimatedTimeMinutes(questionCount)}
                  </Text.Headline>
                </XStack>
                <Text.Caption color={secondaryTextColor} fontFamily={FONT_FAMILIES.medium} textAlign="center">
                  {t('triviaMinutes')}
                </Text.Caption>
              </YStack>
            </XStack>

            {/* Info Cards */}
            <YStack 
              paddingHorizontal={spacing.phone.lg}
              gap={spacing.phone.xs}
              marginBottom={spacing.phone.md}
            >
              {/* Progress Card (for categories and mixed) */}
              {(type === 'category' || type === 'mixed') && totalQuestions > 0 && (
                <XStack 
                  backgroundColor={surfaceColor}
                  borderRadius={radius.phone.md}
                  padding={spacing.phone.md}
                  alignItems="center"
                  gap={spacing.phone.sm}
                >
                  <Trophy size={typo.fontSize.title} color={successColor} />
                  <YStack flex={1} gap={2}>
                    <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textColor}>
                      {t('triviaTotalQuestions', { count: totalQuestions })}
                    </Text.Caption>
                    <XStack alignItems="center" gap={spacing.phone.sm}>
                      <Text.Caption fontFamily={FONT_FAMILIES.medium} color={secondaryTextColor}>
                        {answeredCount} {t('triviaAnswered')}
                      </Text.Caption>
                      <Text.Caption color={secondaryTextColor}>•</Text.Caption>
                      <Text.Caption fontFamily={FONT_FAMILIES.medium} color={successColor}>
                        {masteredCount} {t('triviaMastered')}
                      </Text.Caption>
                    </XStack>
                  </YStack>
                </XStack>
              )}

              {/* How to Master */}
              <XStack 
                backgroundColor={surfaceColor}
                borderRadius={radius.phone.md}
                padding={spacing.phone.md}
                alignItems="center"
                gap={spacing.phone.sm}
              >
                <Target size={typo.fontSize.title} color={isDark ? '#818CF8' : '#6366F1'} />
                <YStack flex={1}>
                  <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textColor}>
                    {t('triviaHowToMaster')}
                  </Text.Caption>
                  <Text.Tiny color={secondaryTextColor}>
                    {t('triviaHowToMasterDesc')}
                  </Text.Tiny>
                </YStack>
              </XStack>

              {/* Question Types */}
              <XStack 
                backgroundColor={surfaceColor}
                borderRadius={radius.phone.md}
                padding={spacing.phone.md}
                alignItems="center"
                gap={spacing.phone.sm}
              >
                <CheckCircle size={typo.fontSize.title} color={isDark ? '#FBBF24' : '#F59E0B'} />
                <YStack flex={1}>
                  <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textColor}>
                    {t('triviaQuestionType')}
                  </Text.Caption>
                  <Text.Tiny color={secondaryTextColor}>
                    {t('triviaQuestionTypeDesc')}
                  </Text.Tiny>
                </YStack>
              </XStack>
            </YStack>

            {/* Start Button */}
            <YStack paddingHorizontal={spacing.phone.lg} paddingBottom={spacing.phone.lg}>
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
                  paddingVertical={spacing.phone.md}
                  paddingHorizontal={spacing.phone.xl}
                  borderRadius={radius.phone.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={spacing.phone.sm}
                >
                  <Play size={typo.fontSize.title} color="#FFFFFF" fill="#FFFFFF" />
                  <Text.Body
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {t('triviaStartTest')}
                  </Text.Body>
                </XStack>
              </Pressable>
            </YStack>
          </ModalContent>
        </Animated.View>
      </ModalOverlay>
    </Modal>
  );
}
