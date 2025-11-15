import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="language" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
