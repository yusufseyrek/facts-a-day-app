import { Stack } from "expo-router";

export default function TriviaTabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="performance" />
    </Stack>
  );
}

