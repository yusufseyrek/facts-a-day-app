import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { Brain, Compass, Heart, Lightbulb, Settings } from '@tamagui/lucide-icons';
import { Tabs, usePathname } from 'expo-router';

import { useScrollToTop } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import * as triviaService from '../../src/services/trivia';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { BottomTabBarButtonProps, BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Context to share current tab name with tab buttons
const CurrentTabContext = createContext<string>('index');

interface AnimatedTabButtonProps extends BottomTabBarButtonProps {
  tabName?: string;
}

function AnimatedTabButton({
  children,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  testID,
  tabName,
}: AnimatedTabButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { scrollToTop } = useScrollToTop();
  const currentTab = useContext(CurrentTabContext);

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.85,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [scale]);

  const handlePress = useCallback(
    (e: any) => {
      // Check if this tab is already the current tab
      const isCurrentTab = tabName === currentTab;
      console.log(
        `📜 Tab pressed: ${tabName}, currentTab: ${currentTab}, isCurrentTab: ${isCurrentTab}`
      );
      if (isCurrentTab && tabName) {
        scrollToTop(tabName);
      }
      // Always call original onPress to handle navigation
      onPress?.(e);
    },
    [tabName, currentTab, scrollToTop, onPress]
  );

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      testID={testID}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// Minimal trivia icon with solid background - uses app's primary cyan color
function TriviaTabIcon({
  focused,
  isDark,
  hasBadge,
}: {
  focused: boolean;
  isDark: boolean;
  hasBadge: boolean;
}) {
  const { iconSizes, spacing, radius } = useResponsive();
  const theme = isDark ? 'dark' : 'light';
  // Use the app's primary color for consistency
  const bgColor = hexColors[theme].primary;
  const glowColor = hexColors[theme].primaryGlow;

  // Calculate container size: icon + padding on both sides
  const containerPadding = spacing.sm;
  const containerSize = iconSizes.lg + containerPadding * 2;
  const badgeSize = Math.round(containerSize * 0.35);

  // Pulse animation - only active when badge is visible
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (hasBadge) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1);
    }
  }, [hasBadge, pulseScale]);

  const pulseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Platform-specific glow styles
  const glowStyle = Platform.select({
    ios: {
      shadowColor: hexColors[theme].primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 10,
    },
    android: {
      elevation: 8,
      borderWidth: 1.5,
      borderColor: glowColor,
    },
  });

  const badgeColor = hexColors[theme].neonRed;

  return (
    <Reanimated.View style={pulseAnimStyle}>
      <View
        style={[
          styles.triviaIconContainer,
          glowStyle,
          {
            backgroundColor: bgColor,
            opacity: focused ? 1 : 0.85,
            padding: containerPadding,
            width: containerSize,
            height: containerSize,
            borderRadius: radius.full,
          },
        ]}
      >
        <Brain size={iconSizes.lg} color="#FFFFFF" strokeWidth={focused ? 2.5 : 1.5} />
        {hasBadge && (
          <View
            style={[
              styles.triviaBadge,
              {
                width: badgeSize,
                height: badgeSize,
                borderRadius: badgeSize / 2,
                top: -badgeSize * 0.15,
                right: -badgeSize * 0.15,
                backgroundColor: badgeColor,
                // Badge glow
                ...Platform.select({
                  ios: {
                    shadowColor: badgeColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 4,
                  },
                  android: {
                    elevation: 4,
                  },
                }),
              },
            ]}
          />
        )}
      </View>
    </Reanimated.View>
  );
}

function CustomTabBar(props: BottomTabBarProps) {
  return <BottomTabBar {...props} />;
}

const styles = StyleSheet.create({
  triviaIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  triviaBadge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function TabLayout() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const insets = useSafeAreaInsets();
  const { iconSizes, media } = useResponsive();
  const [hasDailyTrivia, setHasDailyTrivia] = useState(false);

  // Get current tab from pathname
  const pathname = usePathname();
  // Pathname is like "/(tabs)/index" or "/(tabs)/discover" - extract tab name
  const currentTab = pathname.replace(/^\/(tabs\/)?/, '').split('/')[0] || 'index';

  // Check for daily trivia availability
  const checkDailyTrivia = useCallback(async () => {
    try {
      const [questionsCount, isCompleted] = await Promise.all([
        triviaService.getDailyTriviaQuestionsCount(locale),
        triviaService.isDailyTriviaCompleted(),
      ]);
      setHasDailyTrivia(questionsCount > 0 && !isCompleted);
    } catch {
      // Ignore trivia check errors
    }
  }, [locale]);

  // Check on mount and periodically
  useEffect(() => {
    checkDailyTrivia();
    // Check every 30 seconds in case new facts are shown
    const interval = setInterval(checkDailyTrivia, 30000);
    return () => clearInterval(interval);
  }, [checkDailyTrivia]);

  // Also check when tab is focused
  useFocusEffect(
    useCallback(() => {
      checkDailyTrivia();
    }, [checkDailyTrivia])
  );

  const isDark = theme === 'dark';
  // Use neon cyan for active tab - subtle but visible
  const activeTintColor = isDark
    ? hexColors.dark.primary // Neon cyan in dark mode
    : hexColors.light.primary; // Toned cyan in light mode
  const inactiveTintColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const backgroundColor = isDark ? hexColors.dark.surface : hexColors.light.surface;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;

  return (
    <CurrentTabContext.Provider value={currentTab}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: activeTintColor,
          tabBarInactiveTintColor: inactiveTintColor,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor,
            borderTopColor: borderColor,
            borderTopWidth: 1,
            height: media.tabBarHeight + insets.bottom,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            paddingTop: 10,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('home'),
            tabBarIcon: ({ color, focused }) => (
              <Lightbulb size={iconSizes.lg} color={color} strokeWidth={focused ? 2.5 : 1.5} />
            ),
            tabBarButton: (props) => (
              <AnimatedTabButton {...props} tabName="index" testID="tab-home" />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: t('discover'),
            tabBarIcon: ({ color, focused }) => (
              <Compass size={iconSizes.lg} color={color} strokeWidth={focused ? 2.5 : 1.5} />
            ),
            tabBarButton: (props) => (
              <AnimatedTabButton {...props} tabName="discover" testID="tab-discover" />
            ),
          }}
        />
        <Tabs.Screen
          name="trivia"
          options={{
            title: t('trivia'),
            tabBarIcon: ({ focused }) => (
              <TriviaTabIcon focused={focused} isDark={isDark} hasBadge={hasDailyTrivia} />
            ),
            tabBarButton: (props) => (
              <AnimatedTabButton {...props} tabName="trivia" testID="tab-trivia" />
            ),
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: t('favorites'),
            tabBarIcon: ({ color, focused }) => (
              <Heart size={iconSizes.lg} color={color} strokeWidth={focused ? 2.5 : 1.5} />
            ),
            tabBarButton: (props) => (
              <AnimatedTabButton {...props} tabName="favorites" testID="tab-favorites" />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('settings'),
            tabBarIcon: ({ color, focused }) => (
              <Settings size={iconSizes.lg} color={color} strokeWidth={focused ? 2.5 : 1.5} />
            ),
            tabBarButton: (props) => (
              <AnimatedTabButton {...props} tabName="settings" testID="tab-settings" />
            ),
          }}
        />
      </Tabs>
    </CurrentTabContext.Provider>
  );
}
