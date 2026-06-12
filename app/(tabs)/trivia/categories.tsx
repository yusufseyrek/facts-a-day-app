import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ContentContainer } from '../../../src/components';
import { BannerAd } from '../../../src/components/ads';
import { GlassSurface } from '../../../src/components/GlassSurface';
import { XStack, YStack } from '../../../src/components/Stacks';
import { FONT_FAMILIES, Text } from '../../../src/components/Typography';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import * as triviaService from '../../../src/services/trivia';
import { hexColors, useTheme } from '../../../src/theme';
import { hexToRgba } from '../../../src/utils/colors';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import { absoluteFillObject } from '../../../src/utils/styles';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { CategoryWithProgress } from '../../../src/services/trivia';

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
  const { spacing, radius } = useResponsive();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  // iOS 26 Liquid Glass backing for the accuracy card; everywhere else keeps
  // today's opaque card fill.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

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
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor }}>
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <ContentContainer>
          <YStack padding={spacing.lg}>
            {categories.length > 0 ? (
              <>
                <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
                  <YStack
                    backgroundColor={useGlass ? 'transparent' : cardBg}
                    borderRadius={radius.lg}
                    padding={spacing.lg}
                    gap={spacing.lg}
                    overflow={useGlass ? 'hidden' : undefined}
                    borderWidth={useGlass ? 1 : 0}
                    borderColor={isDark ? hexColors.dark.border : hexColors.light.border}
                  >
                    {useGlass && (
                      <GlassSurface
                        variant="glass"
                        isDark={isDark}
                        tint={cardBg}
                        glassTint={hexToRgba(cardBg, isDark ? 0.6 : 0.65)}
                        borderRadius={radius.lg}
                        style={absoluteFillObject}
                      />
                    )}
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
          </YStack>
        </ContentContainer>
      </ScrollView>

      <BannerAd respectBottomInset />
    </View>
  );
}
