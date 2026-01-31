import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, ChevronRight, Timer, X } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
import { XStack, YStack } from 'tamagui';

import { hexColors } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

type TranslationFunction = (key: any, params?: any) => string;

export interface TriviaNativeAdViewProps {
  nativeAd: NativeAd;
  progressWidth: SharedValue<number>;
  triviaTitle: string;
  timeRemaining: number;
  onContinue: () => void;
  onPrevQuestion: () => void;
  onExit: () => void;
  isDark: boolean;
  t: TranslationFunction;
}

const gradientColors = ['transparent', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.85)'] as const;
const gradientLocations = [0.25, 0.55, 1] as const;

export function TriviaNativeAdView({
  nativeAd,
  progressWidth,
  triviaTitle,
  timeRemaining,
  onContinue,
  onPrevQuestion,
  onExit,
  isDark,
  t,
}: TriviaNativeAdViewProps) {
  const insets = useSafeAreaInsets();
  const { borderWidths, media, typography, iconSizes, spacing, radius } = useResponsive();

  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const surfaceColor = isDark ? hexColors.dark.surface : hexColors.light.surface;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handlePressWithHaptics = (callback: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    callback();
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bgColor,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header - identical to TriviaGameView */}
      <XStack
        paddingHorizontal={spacing.lg}
        alignItems="center"
        justifyContent="space-between"
        position="relative"
      >
        <Pressable
          onPress={() => handlePressWithHaptics(onExit)}
          hitSlop={12}
          style={({ pressed }) => [{ zIndex: 1 }, pressed && { opacity: 0.6 }]}
        >
          <X size={iconSizes.lg} color={textColor} />
        </Pressable>

        {/* Trivia Mode Title - Centered */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            paddingBottom: spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text.Body fontFamily={FONT_FAMILIES.bold} color={textColor} numberOfLines={1}>
            {triviaTitle}
          </Text.Body>
        </View>

        {/* Timer */}
        <XStack
          backgroundColor={surfaceColor}
          paddingHorizontal={spacing.md}
          paddingVertical={spacing.sm}
          borderRadius={radius.full}
          alignItems="center"
          gap={spacing.sm}
          zIndex={1}
        >
          <Timer
            size={typography.fontSize.title}
            color={timeRemaining < 30 ? errorColor : primaryColor}
          />
          <Text.Label
            fontFamily={FONT_FAMILIES.bold}
            color={timeRemaining < 30 ? errorColor : textColor}
          >
            {formatTime(timeRemaining)}
          </Text.Label>
        </XStack>
      </XStack>

      {/* Progress section - hide question index, show "Advertisement" instead of category */}
      <YStack paddingHorizontal={spacing.lg} paddingTop={spacing.lg} gap={spacing.sm}>
        <XStack justifyContent="flex-end" alignItems="center">
          <Text.Label fontFamily={FONT_FAMILIES.semibold} color={secondaryTextColor}>
            {t('sponsored') || 'Advertisement'}
          </Text.Label>
        </XStack>

        {/* Progress bar */}
        <View
          style={{
            height: borderWidths.extraHeavy,
            backgroundColor: borderColor,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={[
              {
                height: '100%',
                backgroundColor: primaryColor,
                borderRadius: 3,
              },
              progressAnimatedStyle,
            ]}
          />
        </View>
      </YStack>

      {/* Native Ad Content */}
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <NativeAdView nativeAd={nativeAd} style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              borderRadius: radius.xl,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Media content */}
            <NativeMediaView
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />

            {/* Gradient overlay */}
            <LinearGradient
              colors={gradientColors}
              locations={gradientLocations}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Headline */}
            <View
              style={[
                styles.contentOverlay,
                {
                  paddingHorizontal: spacing.lg,
                  paddingBottom: spacing.lg,
                  paddingTop: spacing.xl * 1.5,
                },
              ]}
            >
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text.Title color="#FFFFFF" numberOfLines={3} style={styles.titleShadow}>
                  {nativeAd.headline}
                </Text.Title>
              </NativeAsset>
            </View>
          </View>
        </NativeAdView>
      </View>

      {/* Navigation buttons - same as TriviaGameView */}
      <XStack
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.md}
        paddingBottom={spacing.lg}
        gap={spacing.md}
      >
        {/* Previous button */}
        <Pressable
          onPress={() => handlePressWithHaptics(onPrevQuestion)}
          role="button"
          aria-label={t('a11y_previousButton')}
          style={({ pressed }) => [
            pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          ]}
        >
          <XStack
            backgroundColor={primaryColor}
            height={media.buttonHeight}
            paddingHorizontal={spacing.lg}
            borderRadius={radius.lg}
            justifyContent="center"
            alignItems="center"
          >
            <ChevronLeft size={iconSizes.lg} color="#FFFFFF" />
          </XStack>
        </Pressable>

        {/* Next button */}
        <Pressable
          onPress={() => handlePressWithHaptics(onContinue)}
          role="button"
          aria-label={t('a11y_nextButton')}
          style={({ pressed }) => [
            { flex: 1 },
            pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          ]}
        >
          <XStack
            backgroundColor={primaryColor}
            height={media.buttonHeight}
            borderRadius={radius.lg}
            justifyContent="center"
            alignItems="center"
            gap={spacing.sm}
          >
            <Text.Body color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
              {t('nextQuestion')}
            </Text.Body>
            <ChevronRight size={typography.fontSize.title} color="#FFFFFF" />
          </XStack>
        </Pressable>
      </XStack>
    </View>
  );
}

const styles = StyleSheet.create({
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  titleShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});
