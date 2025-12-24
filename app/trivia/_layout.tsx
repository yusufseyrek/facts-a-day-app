import { Stack } from "expo-router";

export default function TriviaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="performance" />
      <Stack.Screen
        name="game"
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="history" />
    </Stack>
  );
}

