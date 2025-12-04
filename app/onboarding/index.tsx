import { Redirect } from "expo-router";

/**
 * Onboarding index - redirects to categories screen
 * Language selection has been removed - the app now uses device language settings
 */
export default function OnboardingIndex() {
  return <Redirect href="/onboarding/categories" />;
}

