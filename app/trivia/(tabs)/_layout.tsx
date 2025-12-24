import { Tabs } from "expo-router";
import { Brain, Trophy } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, Animated, View, StyleSheet } from "react-native";
import { useRef, useCallback } from "react";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { tokens } from "../../../src/theme/tokens";
import { useTheme } from "../../../src/theme";
import { useTranslation } from "../../../src/i18n";

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

export default function TriviaTabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const isDark = theme === "dark";
  const activeTintColor = isDark
    ? tokens.color.dark.primary
    : tokens.color.light.primary;
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
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor,
          borderTopColor: borderColor,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("trivia"),
          tabBarIcon: ({ color }) => <Brain size={24} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="performance"
        options={{
          title: t("performance"),
          tabBarIcon: ({ color }) => <Trophy size={24} color={color} />,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
    </Tabs>
  );
}

