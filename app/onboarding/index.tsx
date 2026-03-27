import { Redirect } from 'expo-router';

/**
 * Onboarding index - redirects to welcome carousel screen
 * Language selection has been removed - the app now uses device language settings
 */
export default function OnboardingIndex() {
  return <Redirect href="/onboarding/welcome" />;
}
