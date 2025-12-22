import React from 'react';
import { Modal, Pressable, Dimensions, Platform } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
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
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import { useTheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { getLucideIcon } from '../../utils/iconMapper';
import { getEstimatedTimeMinutes } from '../../services/trivia';

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

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

const ModalOverlay = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  padding: tokens.space.md,
});

const ModalContent = styled(YStack, {
  width: '100%',
  borderRadius: tokens.radius.xl,
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
  const isDark = theme === 'dark';

  // Colors
  const bgColor = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const surfaceColor = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const purpleColor = isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;

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
            width: SCREEN_WIDTH - tokens.space.md * 2, 
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
                top: tokens.space.md,
                right: tokens.space.md,
                zIndex: 10,
                padding: tokens.space.xs,
              }}
            >
              <X size={20} color={secondaryTextColor} />
            </Pressable>

            {/* Header */}
            <YStack 
              paddingTop={tokens.space.xl} 
              paddingHorizontal={tokens.space.lg}
              paddingBottom={tokens.space.md}
              gap={tokens.space.sm}
              alignItems="center"
            >
              {/* Icon + Title Row */}
              <XStack alignItems="center" justifyContent="center" gap={tokens.space.md}>
                <YStack
                  width={44}
                  height={44}
                  borderRadius={tokens.radius.md}
                  backgroundColor={accentColor}
                  justifyContent="center"
                  alignItems="center"
                >
                  {renderIcon()}
                </YStack>
                <Text
                  fontSize={20}
                  fontFamily={FONT_FAMILIES.bold}
                  color={textColor}
                  numberOfLines={2}
                  textAlign="center"
                >
                  {getTitle()}
                </Text>
              </XStack>
              
              {/* Description */}
              {getDescription() && (
                <Text
                  fontSize={14}
                  color={secondaryTextColor}
                  lineHeight={20}
                  textAlign="center"
                >
                  {getDescription()}
                </Text>
              )}
            </YStack>

            {/* Divider */}
            <YStack height={1} backgroundColor={borderColor} marginHorizontal={tokens.space.lg} />

            {/* Stats Grid - Redesigned */}
            <XStack 
              paddingHorizontal={tokens.space.lg}
              paddingVertical={tokens.space.md}
              gap={tokens.space.md}
            >
              {/* Questions Box */}
              <YStack 
                flex={1}
                backgroundColor={`${accentColor}15`}
                borderRadius={tokens.radius.lg}
                padding={tokens.space.md}
                borderWidth={1}
                borderColor={`${accentColor}30`}
                alignItems="center"
              >
                <XStack alignItems="center" gap={tokens.space.sm} marginBottom={tokens.space.xs}>
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={tokens.radius.sm}
                    backgroundColor={accentColor}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <HelpCircle size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </YStack>
                  <Text fontSize={26} fontFamily={FONT_FAMILIES.bold} color={textColor}>
                    {questionCount}
                  </Text>
                </XStack>
                <Text fontSize={14} color={secondaryTextColor} fontFamily={FONT_FAMILIES.medium} textAlign="center">
                  {t('triviaQuestions')}
                </Text>
              </YStack>

              {/* Time Box */}
              <YStack 
                flex={1}
                backgroundColor={isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'}
                borderRadius={tokens.radius.lg}
                padding={tokens.space.md}
                borderWidth={1}
                borderColor={isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}
                alignItems="center"
              >
                <XStack alignItems="center" gap={tokens.space.sm} marginBottom={tokens.space.xs}>
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={tokens.radius.sm}
                    backgroundColor={isDark ? '#818CF8' : '#6366F1'}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Clock size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </YStack>
                  <Text fontSize={26} fontFamily={FONT_FAMILIES.bold} color={textColor}>
                    ~{getEstimatedTimeMinutes(questionCount)}
                  </Text>
                </XStack>
                <Text fontSize={14} color={secondaryTextColor} fontFamily={FONT_FAMILIES.medium} textAlign="center">
                  {t('triviaMinutes')}
                </Text>
              </YStack>
            </XStack>

            {/* Info Cards */}
            <YStack 
              paddingHorizontal={tokens.space.lg}
              gap={tokens.space.xs}
              marginBottom={tokens.space.md}
            >
              {/* Progress Card (for categories and mixed) */}
              {(type === 'category' || type === 'mixed') && totalQuestions > 0 && (
                <XStack 
                  backgroundColor={surfaceColor}
                  borderRadius={tokens.radius.md}
                  padding={tokens.space.md}
                  alignItems="center"
                  gap={tokens.space.sm}
                >
                  <Trophy size={18} color={successColor} />
                  <YStack flex={1} gap={2}>
                    <Text fontSize={13} fontFamily={FONT_FAMILIES.medium} color={textColor}>
                      {totalQuestions} {t('triviaTotal')}
                    </Text>
                    <XStack alignItems="center" gap={tokens.space.sm}>
                      <Text fontSize={12} fontFamily={FONT_FAMILIES.medium} color={secondaryTextColor}>
                        {answeredCount} {t('triviaAnswered')}
                      </Text>
                      <Text fontSize={12} color={secondaryTextColor}>•</Text>
                      <Text fontSize={12} fontFamily={FONT_FAMILIES.medium} color={successColor}>
                        {masteredCount} {t('triviaMastered')}
                      </Text>
                    </XStack>
                  </YStack>
                </XStack>
              )}

              {/* How to Master */}
              <XStack 
                backgroundColor={surfaceColor}
                borderRadius={tokens.radius.md}
                padding={tokens.space.md}
                alignItems="center"
                gap={tokens.space.sm}
              >
                <Target size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                <YStack flex={1}>
                  <Text fontSize={13} fontFamily={FONT_FAMILIES.medium} color={textColor}>
                    {t('triviaHowToMaster')}
                  </Text>
                  <Text fontSize={11} color={secondaryTextColor}>
                    {t('triviaHowToMasterDesc')}
                  </Text>
                </YStack>
              </XStack>

              {/* Question Types */}
              <XStack 
                backgroundColor={surfaceColor}
                borderRadius={tokens.radius.md}
                padding={tokens.space.md}
                alignItems="center"
                gap={tokens.space.sm}
              >
                <CheckCircle size={18} color={isDark ? '#FBBF24' : '#F59E0B'} />
                <YStack flex={1}>
                  <Text fontSize={13} fontFamily={FONT_FAMILIES.medium} color={textColor}>
                    {t('triviaQuestionType')}
                  </Text>
                  <Text fontSize={11} color={secondaryTextColor}>
                    {t('triviaQuestionTypeDesc')}
                  </Text>
                </YStack>
              </XStack>
            </YStack>

            {/* Start Button */}
            <YStack paddingHorizontal={tokens.space.lg} paddingBottom={tokens.space.lg}>
              <Pressable 
                onPress={onStart}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <XStack
                  backgroundColor={accentColor}
                  paddingVertical={tokens.space.md}
                  paddingHorizontal={tokens.space.xl}
                  borderRadius={tokens.radius.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={tokens.space.sm}
                >
                  <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
                  <Text
                    fontSize={16}
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {t('triviaStartTest')}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          </ModalContent>
        </Animated.View>
      </ModalOverlay>
    </Modal>
  );
}
