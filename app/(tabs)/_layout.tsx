import React, { useRef, useCallback, useState, useEffect, createContext, useContext } from "react";
import { Pressable, Animated, View, StyleSheet } from "react-native";
import { Tabs, usePathname } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { BottomTabBar } from "@react-navigation/bottom-tabs";
import { Lightbulb, Compass, Brain, Star, Settings } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BannerAd } from "../../src/components/ads";
import { ADS_ENABLED } from "../../src/config/ads";
import { useScrollToTop } from "../../src/contexts";
import { useTranslation } from "../../src/i18n";
import * as triviaService from "../../src/services/trivia";
import { hexColors, useTheme } from "../../src/theme";
import { useResponsive } from "../../src/utils/useResponsive";

import type { BottomTabBarButtonProps, BottomTabBarProps } from "@react-navigation/bottom-tabs";

// Context to share current tab name with tab buttons
const CurrentTabContext = createContext<string>("index");

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

  const handlePress = useCallback((e: any) => {
    // Check if this tab is already the current tab
    const isCurrentTab = tabName === currentTab;
    console.log(`📜 Tab pressed: ${tabName}, currentTab: ${currentTab}, isCurrentTab: ${isCurrentTab}`);
    if (isCurrentTab && tabName) {
      scrollToTop(tabName);
    }
    // Always call original onPress to handle navigation
    onPress?.(e);
  }, [tabName, currentTab, scrollToTop, onPress]);

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
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// Minimal trivia icon with solid background - uses app's primary cyan color
function TriviaTabIcon({ focused, isDark, hasBadge }: { focused: boolean; isDark: boolean; hasBadge: boolean }) {
  const { iconSizes, spacing, radius } = useResponsive();
  // Use the app's primary color for consistency
  const bgColor = isDark
    ? hexColors.dark.primary // #00A3CC - cyan
    : hexColors.light.primary; // #0077A8 - teal

  const shadowColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  
  // Calculate container size: icon + padding on both sides
  const containerPadding = spacing.sm;
  const containerSize = iconSizes.lg + containerPadding * 2;
  const badgeSize = Math.round(containerSize * 0.35);
  const badgeInnerSize = Math.round(badgeSize * 0.7);

  return (
    <View
      style={[
        styles.triviaIconContainer,
        {
          backgroundColor: bgColor,
          shadowColor,
          opacity: focused ? 1 : 0.85,
          padding: containerPadding,
          width: containerSize,
          height: containerSize,
          borderRadius: radius.full,
        },
      ]}
    >
      <Brain size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />
      {hasBadge && (
        <View style={[styles.triviaBadge, { 
          width: badgeSize, 
          height: badgeSize, 
          borderRadius: badgeSize / 2,
          top: -badgeSize * 0.15,
          right: -badgeSize * 0.15,
        }]}>
          <View style={[styles.triviaBadgeInner, {
            width: badgeInnerSize,
            height: badgeInnerSize,
            borderRadius: badgeInnerSize / 2,
          }]} />
        </View>
      )}
    </View>
  );
}


// Custom tab bar that includes banner ad above the tabs
function CustomTabBar(props: BottomTabBarProps) {
  const { theme } = useTheme();
  
  const backgroundColor = theme === "dark"
    ? hexColors.dark.background
    : hexColors.light.background;

  return (
    <View style={[styles.tabBarContainer, { backgroundColor }]}>
      {ADS_ENABLED && (
        <View style={styles.adContainer}>
          <BannerAd position="home" />
        </View>
      )}
      <BottomTabBar {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    // Container for both ad and tab bar
  },
  adContainer: {
    alignItems: "center",
  },
  triviaIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  triviaBadge: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  triviaBadgeInner: {
    backgroundColor: "#FF4757", // Attention-grabbing red
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
  const currentTab = pathname.replace(/^\/(tabs\/)?/, "").split("/")[0] || "index";

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

  const isDark = theme === "dark";
  // Use neon cyan for active tab - subtle but visible
  const activeTintColor = isDark
    ? hexColors.dark.primary // Neon cyan in dark mode
    : hexColors.light.primary; // Toned cyan in light mode
  const inactiveTintColor = isDark
    ? hexColors.dark.textSecondary
    : hexColors.light.textSecondary;
  const backgroundColor = isDark
    ? hexColors.dark.surface
    : hexColors.light.surface;
  const borderColor = isDark
    ? hexColors.dark.border
    : hexColors.light.border;

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
          title: t("home"),
          tabBarIcon: ({ color }) => <Lightbulb size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} tabName="index" testID="tab-home" />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t("discover"),
          tabBarIcon: ({ color }) => <Compass size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} tabName="discover" testID="tab-discover" />,
        }}
      />
      <Tabs.Screen
        name="trivia"
        options={{
          title: t("trivia"),
          tabBarIcon: ({ focused }) => <TriviaTabIcon focused={focused} isDark={isDark} hasBadge={hasDailyTrivia} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} tabName="trivia" testID="tab-trivia" />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("favorites"),
          tabBarIcon: ({ color }) => <Star size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} tabName="favorites" testID="tab-favorites" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) => <Settings size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} tabName="settings" testID="tab-settings" />,
        }}
      />
      </Tabs>
    </CurrentTabContext.Provider>
  );
}
