import { Stack } from 'expo-router';
import { BannerAd } from '../../../src/components/ads';

export default function TriviaTabLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="performance" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="history" />
      </Stack>
      <BannerAd position="home" />
    </>
  );
}
