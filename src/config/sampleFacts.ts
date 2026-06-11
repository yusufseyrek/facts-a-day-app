import sampleFactsJson from './sampleFacts.json';

import type { ImageSource } from 'expo-image';
import type { SupportedLocale } from '../i18n';

export interface SampleFact {
  title: string;
  summary: string;
  content: string;
  category: string;
  categorySlug: string;
  categoryColor: string;
  image: ImageSource;
}

// Bundled images — available offline, no network required.
// The fact text lives in sampleFacts.json; images map here because
// require() calls can't live in JSON.
/* eslint-disable @typescript-eslint/no-require-imports */
const SAMPLE_FACT_IMAGES: Record<string, ImageSource> = {
  nature: require('../../assets/onboarding/nature.webp') as ImageSource,
  space: require('../../assets/onboarding/space.webp') as ImageSource,
  culture: require('../../assets/onboarding/culture.webp') as ImageSource,
  history: require('../../assets/onboarding/history.webp') as ImageSource,
  food: require('../../assets/onboarding/food.webp') as ImageSource,
  technology: require('../../assets/onboarding/technology.webp') as ImageSource,
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Sample facts shown in the onboarding welcome carousel and fact preview modal.
 * Sourced from the production database — real article-sourced facts with bundled images.
 */
export const sampleFacts: Record<SupportedLocale, SampleFact[]> = Object.fromEntries(
  Object.entries(sampleFactsJson).map(([locale, facts]) => [
    locale,
    facts.map((fact) => ({ ...fact, image: SAMPLE_FACT_IMAGES[fact.image] })),
  ])
) as Record<SupportedLocale, SampleFact[]>;
