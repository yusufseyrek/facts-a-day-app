import { Tabs } from "expo-router";
import { Lightbulb, Compass, Brain, Star, Settings } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, Animated, View, StyleSheet } from "react-native";
import { useRef, useCallback, useState, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { tokens } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import * as triviaService from "../../src/services/trivia";

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
  // Use the app's primary color for consistency
  const bgColor = isDark
    ? tokens.color.dark.primary // #00A3CC - cyan
    : tokens.color.light.primary; // #0077A8 - teal

  const shadowColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;

  return (
    <View
      style={[
        styles.triviaIconContainer,
        {
          backgroundColor: bgColor,
          shadowColor,
          opacity: focused ? 1 : 0.85,
        },
      ]}
    >
      <Brain size={24} color="#FFFFFF" strokeWidth={2} />
      {hasBadge && (
        <View style={styles.triviaBadge}>
          <View style={styles.triviaBadgeInner} />
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  triviaIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  const [hasDailyTrivia, setHasDailyTrivia] = useState(false);

  // Check for daily trivia availability
  const checkDailyTrivia = useCallback(async () => {
    try {
      const [questionsCount, isCompleted] = await Promise.all([
        triviaService.getDailyTriviaQuestionsCount(locale),
        triviaService.isDailyTriviaCompleted(),
      ]);
      setHasDailyTrivia(questionsCount > 0 && !isCompleted);
    } catch (error) {
      console.error("Error checking daily trivia:", error);
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
    ? tokens.color.dark.primary // Neon cyan in dark mode
    : tokens.color.light.primary; // Toned cyan in light mode
  const inactiveTintColor = isDark
    ? tokens.color.dark.textSecondary
    : tokens.color.light.textSecondary;
  const backgroundColor = isDark
    ? tokens.color.dark.surface
    : tokens.color.light.surface;
  const borderColor = isDark
    ? tokens.color.dark.border
    : tokens.color.light.border;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: inactiveTintColor,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor,
          borderTopColor: borderColor,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color }) => <Lightbulb size={28} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t("discover"),
          tabBarIcon: ({ color }) => <Compass size={28} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="trivia"
        options={{
          title: t("trivia"),
          tabBarIcon: ({ focused }) => <TriviaTabIcon focused={focused} isDark={isDark} hasBadge={hasDailyTrivia} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("favorites"),
          tabBarIcon: ({ color }) => <Star size={28} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) => <Settings size={28} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
    </Tabs>
  );
}
