import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { X } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import { CategoryBadge, FONT_FAMILIES, Text } from '../../src/components';
import { IMAGE_PLACEHOLDER } from '../../src/config/images';
import { sampleFacts } from '../../src/config/sampleFacts';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView } from '../../src/services/analytics';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { SupportedLocale } from '../../src/i18n';
import type { Category } from '../../src/services/database';

// Bottom-of-hero gradient so the image blends into the page background
const heroGradientLocations = [0.7, 1] as const;

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };

/**
 * Fact detail preview for the onboarding welcome carousel.
 *
 * Mirrors the real FactModal's visual hierarchy (hero image, category badge,
 * title, summary, body) but renders entirely from the bundled sample facts:
 * no database, network, audio, or favorites coupling, so it works before any
 * onboarding step has completed.
 */
export default function OnboardingFactPreview() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    spacing,
    radius,
    iconSizes,
    typography,
    isTablet,
    screenWidth,
    screenHeight,
  } = useResponsive();

  const { index } = useLocalSearchParams<{ index?: string }>();
  const facts = sampleFacts[locale as SupportedLocale] ?? sampleFacts.en;
  const fact = facts[Number(index)] ?? null;

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

  // Square hero on phones (matches FactModal), shorter banner on tablets.
  const heroHeight = isTablet
    ? Math.min(screenHeight * 0.4, 480)
    : Math.min(screenWidth, screenHeight * 0.5);

  // iOS modal sheets are laid out below the status bar; Android draws under it.
  const closeButtonTop = Platform.OS === 'ios' ? spacing.lg : insets.top + spacing.sm;

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
            transition={200}
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
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        aria-label={t('a11y_closeButton')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.closeButton,
          {
            top: closeButtonTop,
            right: spacing.lg,
            width: iconSizes.xl + spacing.md,
            height: iconSizes.xl + spacing.md,
            borderRadius: radius.full,
            backgroundColor: theme === 'dark' ? 'rgba(20,24,48,0.7)' : 'rgba(255,255,255,0.75)',
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <X size={iconSizes.md} color={hexColors[theme].text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
});
