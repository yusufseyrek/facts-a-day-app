import FactDetailScreen from '../[id]';

/**
 * Modal-presented variant of the fact detail screen.
 *
 * Identical UI to fact/[id] — the only difference is the native presentation
 * (registered in app/_layout.tsx): this route is presentation:'modal', whereas
 * fact/[id] is presentation:'card'. The story screen is itself a
 * fullScreenModal; on iOS a `card` pushed over a full-screen modal lands BEHIND
 * it (so "read more" appeared to do nothing). A modal presents correctly over
 * it, so the story navigates here instead of to fact/[id].
 */
export default function FactDetailModalRoute() {
  return <FactDetailScreen presentedAsModal />;
}
