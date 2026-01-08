import { Tabs } from "expo-router";
import { Lightbulb, Compass, Brain, Star, Settings } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, Animated, View, StyleSheet } from "react-native";
import { useRef, useCallback, useState, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabBarButtonProps, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BottomTabBar } from "@react-navigation/bottom-tabs";
import { hexColors, spacing, radius } from "../../src/theme";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as triviaService from "../../src/services/trivia";
import { BannerAd } from "../../src/components/ads";
import { ADS_ENABLED } from "../../src/config/ads";
import { useResponsive } from "../../src/utils/useResponsive";

function AnimatedTabButton({
  children,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  testID,
}: BottomTabBarButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

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

  return (
    <Pressable
      onPress={onPress}
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
  const { iconSizes, spacing } = useResponsive();
  // Use the app's primary color for consistency
  const bgColor = isDark
    ? hexColors.dark.primary // #00A3CC - cyan
    : hexColors.light.primary; // #0077A8 - teal

  const shadowColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  return (
    <View
      style={[
        styles.triviaIconContainer,
        {
          backgroundColor: bgColor,
          shadowColor,
          opacity: focused ? 1 : 0.85,
          padding: spacing.xl,
          width: iconSizes.lg,
          height: iconSizes.lg,
          borderRadius: radius.phone.full,
        },
      ]}
    >
      <Brain size={iconSizes.lg} color="#FFFFFF" strokeWidth={2} />
      {hasBadge && (
        <View style={styles.triviaBadge}>
          <View style={styles.triviaBadgeInner} />
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
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  triviaBadgeInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF4757", // Attention-grabbing red
  },
});

export default function TabLayout() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const insets = useSafeAreaInsets();
  const { iconSizes,componentSizes } = useResponsive();
  const [hasDailyTrivia, setHasDailyTrivia] = useState(false);

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
          height: componentSizes.tabBarHeight + insets.bottom,
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
          tabBarButton: (props) => <AnimatedTabButton {...props} testID="tab-home" />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t("discover"),
          tabBarIcon: ({ color }) => <Compass size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} testID="tab-discover" />,
        }}
      />
      <Tabs.Screen
        name="trivia"
        options={{
          title: t("trivia"),
          tabBarIcon: ({ focused }) => <TriviaTabIcon focused={focused} isDark={isDark} hasBadge={hasDailyTrivia} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} testID="tab-trivia" />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("favorites"),
          tabBarIcon: ({ color }) => <Star size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} testID="tab-favorites" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) => <Settings size={iconSizes.lg} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} testID="tab-settings" />,
        }}
      />
    </Tabs>
  );
}
