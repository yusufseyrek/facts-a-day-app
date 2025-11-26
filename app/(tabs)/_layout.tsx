import { Tabs } from "expo-router";
import { Lightbulb, Star, Settings } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";

export default function TabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const isDark = theme === "dark";
  const activeTintColor = tokens.color.light.primary;
  const inactiveTintColor = isDark
    ? tokens.color.dark.textSecondary
    : tokens.color.light.textSecondary;
  const backgroundColor = isDark
    ? tokens.color.dark.surface
    : tokens.color.light.surface;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: inactiveTintColor,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor,
          borderTopColor: isDark
            ? tokens.color.dark.border
            : tokens.color.light.border,
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
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("favorites"),
          tabBarIcon: ({ color }) => <Star size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) => <Settings size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
