import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Redirect route for deep links with locale prefix.
 * Safari converts web URLs like https://factsaday.com/en/fact/123
 * to factsaday://en/fact/123, which needs to redirect to /fact/123
 */
export default function LocaleFactRedirect() {
  const { id } = useLocalSearchParams<{ locale: string; id: string }>();

  // Redirect to the actual fact route
  return <Redirect href={`/fact/${id}?source=deeplink`} />;
}
