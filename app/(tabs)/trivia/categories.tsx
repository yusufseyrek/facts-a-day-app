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
import { tokens } from '../../../src/theme/tokens';
import { H2, LabelText, SmallText, BodyText, FONT_FAMILIES } from '../../../src/components/Typography';
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
        <ChevronLeft size={24} color={primaryColor} />
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
  const { typography: typo } = useResponsive();
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const trackColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const progressColor = category.color_hex || (isDark ? tokens.color.dark.primary : tokens.color.light.primary);
  const percentage = category.accuracy;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(400).springify()}>
      <YStack gap={tokens.space.xs}>
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap={tokens.space.sm}>
            {getLucideIcon(category.icon, typo.fontSize.title, progressColor)}
            <LabelText
              color={textColor}
              fontFamily={FONT_FAMILIES.medium}
            >
              {category.name}
            </LabelText>
          </XStack>
          <SmallText
            color={textColor}
            fontFamily={FONT_FAMILIES.semibold}
          >
            {percentage}%
          </SmallText>
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
  const { typography: typo } = useResponsive();
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
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;

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
          paddingTop={insets.top + tokens.space.sm}
          paddingBottom={tokens.space.md}
          paddingHorizontal={tokens.space.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={isDark ? tokens.color.dark.border : tokens.color.light.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={primaryColor} />
          
          <H2
            color={textColor}
          >
            {t('accuracyByCategory')}
          </H2>
          
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
          padding: tokens.space.lg,
          paddingBottom: insets.bottom + tokens.space.xl,
        }}
      >
        {categories.length > 0 ? (
          <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
            <YStack
              backgroundColor={cardBg}
              borderRadius={tokens.radius.lg}
              padding={tokens.space.lg}
              gap={tokens.space.lg}
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
            <BodyText
              color={isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary}
            >
              {t('noDataYet')}
            </BodyText>
          </YStack>
        )}
      </ScrollView>
    </View>
  );
}

