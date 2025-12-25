import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { tokens } from "../../src/theme/tokens";

export default function TriviaLayout() {
  const colorScheme = useColorScheme();
  
  // Use system color scheme for initial background (app theme will override via screen styles)
  const backgroundColor = colorScheme === 'dark' 
    ? tokens.color.dark.background 
    : tokens.color.light.background;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="performance" />
      <Stack.Screen
        name="game"
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
          contentStyle: { backgroundColor },
        }}
      />
      <Stack.Screen name="history" />
    </Stack>
  );
}

