import React, { useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  ScrollView, 
  RefreshControl, 
  ActivityIndicator,
  Pressable,
  View,
  Animated as RNAnimated,
} from 'react-native';
import { YStack, XStack } from 'tamagui';
import { ChevronLeft } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import { hexColors, spacing, radius } from '../../../src/theme';
import { Text, FONT_FAMILIES } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import * as triviaService from '../../../src/services/trivia';
import type { CategoryWithProgress } from '../../../src/services/trivia';
import { trackScreenView, Screens } from '../../../src/services/analytics';
import { useResponsive } from '../../../src/utils/useResponsive';

// Back Button with press animation
function BackButton({ 
  onPress, 
  primaryColor 
}: { 
  onPress: () => void; 
  primaryColor: string;
}) {
  const { iconSizes } = useResponsive();
  const scale = useRef(new RNAnimated.Value(1)).current;

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
          width: 36,
          height: 36,
          borderRadius: 18,
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
  const { typography: typo, iconSizes } = useResponsive();
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const trackColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const progressColor = category.color_hex || (isDark ? hexColors.dark.primary : hexColors.light.primary);
  const percentage = category.accuracy;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(400).springify()}>
      <YStack gap={spacing.phone.xs}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={spacing.phone.sm}>
          {getLucideIcon(category.icon, typo.fontSize.title, progressColor)}
          <Text.Label
            color={textColor}
            fontFamily={FONT_FAMILIES.medium}
          >
            {category.name}
          </Text.Label>
        </XStack>
        <Text.Caption
          color={textColor}
          fontFamily={FONT_FAMILIES.semibold}
        >
          {percentage}%
        </Text.Caption>
      </XStack>
        <View
          style={{
            width: '100%',
            height: 8,
            backgroundColor: trackColor,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${percentage}%`,
              height: '100%',
              backgroundColor: progressColor,
              borderRadius: 4,
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
  const { typography: typo, iconSizes } = useResponsive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<CategoryWithProgress[]>([]);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      
      const categoriesData = await triviaService.getCategoriesWithProgress(locale);
      
      // Filter categories with accuracy > 0 and sort high to low
      const categoriesWithAccuracy = categoriesData
        .filter(c => c.total > 0 && c.accuracy > 0)
        .sort((a, b) => b.accuracy - a.accuracy);
      
      setCategories(categoriesWithAccuracy);
    } catch (error) {
      console.error('Error loading categories data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale]);

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
          paddingTop={insets.top + spacing.phone.sm}
          paddingBottom={spacing.phone.md}
          paddingHorizontal={spacing.phone.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={isDark ? hexColors.dark.border : hexColors.light.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={primaryColor} />
          
          <Text.Title
            color={textColor}
          >
            {t('accuracyByCategory')}
          </Text.Title>
          
          {/* Empty spacer to balance the header */}
          <View style={{ width: 36, height: 36 }} />
        </XStack>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
        }
        contentContainerStyle={{ 
          padding: spacing.phone.lg,
          paddingBottom: insets.bottom + spacing.phone.xl,
        }}
      >
        {categories.length > 0 ? (
          <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
            <YStack
              backgroundColor={cardBg}
              borderRadius={radius.phone.lg}
              padding={spacing.phone.lg}
              gap={spacing.phone.lg}
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

