import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      {/* Language selection removed - now handled via device settings */}
      {/* Redirect /onboarding to /onboarding/categories */}
      <Stack.Screen 
        name="index" 
        options={{ headerShown: false }}
      />
      <Stack.Screen name="categories" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
