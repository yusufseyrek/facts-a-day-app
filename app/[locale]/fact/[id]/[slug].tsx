import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Redirect route for deep links with locale prefix and slug.
 * Handles URLs like factsaday://en/fact/123/some-slug
 * The slug is ignored - only the ID is used for routing.
 */
export default function LocaleFactSlugRedirect() {
  const { id } = useLocalSearchParams<{ locale: string; id: string; slug: string }>();

  // Redirect to the actual fact route, ignoring the slug
  return <Redirect href={`/fact/${id}?source=deeplink`} />;
}
