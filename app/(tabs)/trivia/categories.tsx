import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { InlineNativeAd } from '../../../src/components/ads/InlineNativeAd';
import { FONT_FAMILIES, Text } from '../../../src/components/Typography';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import * as triviaService from '../../../src/services/trivia';
import { hexColors, useTheme } from '../../../src/theme';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { CategoryWithProgress } from '../../../src/services/trivia';

// Back Button with press animation
function BackButton({ onPress, primaryColor }: { onPress: () => void; primaryColor: string }) {
  const { iconSizes, media } = useResponsive();
  const scale = useRef(new RNAnimated.Value(1)).current;
  const buttonSize = media.topicCardSize * 0.45;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <RNAnimated.View
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: `${primaryColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
          transform: [{ scale }],
        }}
      >
        <ChevronLeft size={iconSizes.lg} color={primaryColor} />
      </RNAnimated.View>
    </Pressable>
  );
}

// Category Progress Bar - shows accuracy (correct answers percentage)
function CategoryProgressBar({
  category,
  isDark,
  index,
}: {
  category: CategoryWithProgress;
  isDark: boolean;
  index: number;
}) {
  const { typography, spacing } = useResponsive();
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const trackColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const progressColor =
    category.color_hex || (isDark ? hexColors.dark.primary : hexColors.light.primary);
  const percentage = category.accuracy;
  const barHeight = spacing.sm;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50)
        .duration(400)
        .springify()}
    >
      <YStack gap={spacing.xs}>
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap={spacing.sm}>
            {getLucideIcon(category.icon, typography.fontSize.title, progressColor)}
            <Text.Label color={textColor} fontFamily={FONT_FAMILIES.medium}>
              {category.name}
            </Text.Label>
          </XStack>
          <Text.Caption color={textColor} fontFamily={FONT_FAMILIES.semibold}>
            {percentage}%
          </Text.Caption>
        </XStack>
        <View
          style={{
            width: '100%',
            height: barHeight,
            backgroundColor: trackColor,
            borderRadius: barHeight / 2,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${percentage}%`,
              height: '100%',
              backgroundColor: progressColor,
              borderRadius: barHeight / 2,
            }}
          />
        </View>
      </YStack>
    </Animated.View>
  );
}

export default function CategoriesAccuracyScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { spacing, radius, media, typography } = useResponsive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<CategoryWithProgress[]>([]);

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);

        const categoriesData = await triviaService.getCategoriesWithProgress(locale);

        // Filter categories with accuracy > 0 and sort high to low
        const categoriesWithAccuracy = categoriesData
          .filter((c) => c.total > 0 && c.accuracy > 0)
          .sort((a, b) => b.accuracy - a.accuracy);

        setCategories(categoriesWithAccuracy);
      } catch (error) {
        console.error('Error loading categories data:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [locale]
  );

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.TRIVIA_CATEGORIES);
      loadData();
    }, [loadData])
  );

  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={primaryColor} />
        </YStack>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <Animated.View entering={FadeInUp.duration(400).springify()}>
        <XStack
          paddingTop={insets.top + spacing.sm}
          paddingBottom={spacing.md}
          paddingHorizontal={spacing.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={isDark ? hexColors.dark.border : hexColors.light.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={primaryColor} />

          <RNText
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: FONT_FAMILIES.bold,
              fontSize: typography.fontSize.title,
              color: textColor,
            }}
          >
            {t('accuracyByCategory')}
          </RNText>

          {/* Empty spacer to balance the header */}
          <View style={{ width: media.topicCardSize * 0.45, height: media.topicCardSize * 0.45 }} />
        </XStack>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        {categories.length > 0 ? (
          <>
            <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
              <YStack
                backgroundColor={cardBg}
                borderRadius={radius.lg}
                padding={spacing.lg}
                gap={spacing.lg}
              >
                {categories.map((category, index) => (
                  <CategoryProgressBar
                    key={category.slug}
                    category={category}
                    isDark={isDark}
                    index={index}
                  />
                ))}
              </YStack>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(100).duration(400).springify()}>
              <YStack marginTop={spacing.lg}>
                <InlineNativeAd />
              </YStack>
            </Animated.View>
          </>
        ) : (
          <YStack flex={1} justifyContent="center" alignItems="center" paddingTop={100}>
            <Text.Body
              color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
            >
              {t('noDataYet')}
            </Text.Body>
          </YStack>
        )}
      </ScrollView>
    </View>
  );
}
