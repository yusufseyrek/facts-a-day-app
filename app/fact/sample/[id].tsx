import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import { CategoryBadge, CloseButton, FONT_FAMILIES, Text } from '../../../src/components';
import { FactMorphContainer } from '../../../src/components/factMorph/FactMorphContainer';
import { useFactMorph } from '../../../src/components/factMorph/FactMorphContext';
import { IMAGE_PLACEHOLDER } from '../../../src/config/images';
import { sampleFactMorphId, sampleFacts } from '../../../src/config/sampleFacts';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import { clearPendingFactMorph, peekPendingFactMorph } from '../../../src/services/factMorph';
import { hexColors, useTheme } from '../../../src/theme';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { SupportedLocale } from '../../../src/i18n';
import type { Category } from '../../../src/services/database';

// Bottom-of-hero gradient so the image blends into the page background
const heroGradientLocations = [0.7, 1] as const;

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };

/**
 * Fact detail preview for the onboarding welcome carousel — the morph twin
 * of the home screen's fact open.
 *
 * Registered on the ROOT stack (not the onboarding one) with the same
 * transparentModal options as fact/morph/[id], for two reasons: the morph
 * must cover the whole window including the onboarding layout's progress bar
 * (on Android a nested-stack screen is clipped to the navigator's frame,
 * below the bar), and the welcome screen must stay visible behind the
 * expanding card. The card registers its rect on press-in; if no fresh
 * source exists (deep link, stale state) the detail renders without a morph.
 *
 * The content mirrors the real FactModal's visual hierarchy (hero image,
 * category badge, title, summary, body) but renders entirely from the
 * bundled sample facts: no database, network, audio, or favorites coupling,
 * so it works before any onboarding step has completed.
 */
export default function SampleFactRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const index = parseInt(id, 10);
  const factId = sampleFactMorphId(index);

  // Peek (don't clear) in the initializer — render paths can run twice under
  // StrictMode. Cleared post-commit below.
  const [morphSource] = useState(() => peekPendingFactMorph(factId));

  useEffect(() => {
    clearPendingFactMorph(factId);
  }, [factId]);

  if (!morphSource) {
    return <SampleFactDetail index={index} />;
  }

  return (
    <FactMorphContainer source={morphSource}>
      <SampleFactDetail index={index} />
    </FactMorphContainer>
  );
}

function SampleFactDetail({ index }: { index: number }) {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const morph = useFactMorph();
  const insets = useSafeAreaInsets();
  const { spacing, typography, isTablet, isLandscape, screenWidth } = useResponsive();

  const facts = sampleFacts[locale as SupportedLocale] ?? sampleFacts.en;
  const fact = facts[index] ?? null;

  const hasTracked = useRef(false);
  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      trackScreenView(Screens.ONBOARDING_FACT_PREVIEW);
    }
  }, []);

  if (!fact) {
    return <Redirect href="/onboarding/welcome" />;
  }

  const backgroundColor = hexColors[theme].background;

  // Mirrors FactModal's hero formula — FactMorphContainer morphs the card
  // replica onto exactly this frame, so the image stays continuous.
  const heroHeight = isTablet ? (isLandscape ? screenWidth * 0.7 : screenWidth * 0.8) : screenWidth;

  // transparentModal draws under the status bar on both platforms.
  const closeButtonTop = insets.top + spacing.sm;

  // Close through the morph controller so the reverse morph plays; without
  // one (deep link fallback) a plain pop is correct.
  const handleClose = () => {
    if (morph) {
      morph.close();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding/welcome');
    }
  };

  const categoryForBadge: Category = {
    id: -1,
    name: fact.category,
    slug: fact.categorySlug,
    color_hex: fact.categoryColor,
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      >
        {/* Hero image */}
        <View style={{ width: '100%', height: heroHeight }}>
          <Image
            source={fact.image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            placeholder={placeholder}
            transition={0}
            aria-label={t('a11y_factImage', { title: fact.title })}
            role="img"
          />
          <LinearGradient
            colors={['transparent', backgroundColor]}
            locations={heroGradientLocations}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* Content */}
        <YStack padding={spacing.xl} paddingTop={spacing.md} gap={spacing.md}>
          <Text.Headline role="heading">{fact.title}</Text.Headline>

          <CategoryBadge category={categoryForBadge} />

          <Text.Body
            color="$text"
            fontFamily={FONT_FAMILIES.semibold}
            marginVertical={typography.fontSize.body}
            fontSize={typography.fontSize.body * 1.1}
          >
            {fact.summary}
          </Text.Body>

          {/* '\n\u200B' + negative margin works around the Fabric iOS last-line
             clipping bug (RN #53450), same as FactModal. */}
          <Text.Body
            color="$text"
            fontFamily={FONT_FAMILIES.regular}
            marginBottom={-typography.lineHeight.body}
          >
            {fact.content + '\n\u200B'}
          </Text.Body>
        </YStack>
      </ScrollView>

      {/* Floating close button */}
      <CloseButton
        onPress={handleClose}
        style={{ position: 'absolute', top: closeButtonTop, right: spacing.lg }}
      />
    </View>
  );
}
