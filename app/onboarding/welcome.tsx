import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, StyleSheet, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Button, MockNotificationCard, Text } from '../../src/components';
import { ScreenContainer } from '../../src/components';
import { SampleFactCardLayers } from '../../src/components/SampleFactCard';
import { XStack, YStack } from '../../src/components/Stacks';
import { LAYOUT } from '../../src/config/app';
import { type SampleFact, sampleFactMorphId, sampleFacts } from '../../src/config/sampleFacts';
import { useOnboarding, usePremium } from '../../src/contexts';
import { useFactMorphSource } from '../../src/hooks/useFactMorphSource';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackCarouselSwipe,
  trackOnboardingCategoriesSelected,
  trackScreenView,
} from '../../src/services/analytics';
import * as api from '../../src/services/api';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { SupportedLocale } from '../../src/i18n';

const SKIP_HITSLOP = { top: 12, bottom: 12, left: 24, right: 24 };

/** Immersive 1:1 fact card with image, gradient, category badge, and title */
const FactImageCard = ({
  item,
  index,
  size,
  theme,
  onPress,
}: {
  item: SampleFact;
  index: number;
  size: number;
  theme: 'light' | 'dark';
  onPress: () => void;
}) => {
  const { radius } = useResponsive();
  const factId = sampleFactMorphId(index);
  // Same card → detail morph transition as the home screen fact open:
  // isMorphSourceActive hides this card while its morph presentation is on
  // screen (the expanded preview covers its rect exactly).
  const { registerMorphSource, isMorphSourceActive } = useFactMorphSource(factId);
  const cardRef = useRef<View>(null);

  // Register this card as the morph source on press-IN: measureInWindow is
  // async, so starting here guarantees the rect is registered by the time
  // onPress (touch up) pushes the route. No shimmer guard like
  // ImageFactCard's — the sample images are bundled, always painted.
  const handlePressIn = () => {
    cardRef.current?.measureInWindow((x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      registerMorphSource({
        kind: 'sample-card',
        factId,
        x,
        y,
        width,
        height,
        borderRadius: radius.lg,
        imageUri: null,
        title: item.title,
        fact: item,
      });
    });
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={onPress}
      accessibilityRole="button"
      aria-label={item.title}
      style={({ pressed }) => [
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
        isMorphSourceActive && styles.morphSourceHidden,
      ]}
    >
      <View
        ref={cardRef}
        style={[
          styles.cardShadow,
          {
            width: size,
            height: size,
            borderRadius: radius.lg,
            shadowOpacity: 0.5,
          },
        ]}
      >
        <View
          style={[
            styles.cardContainer,
            {
              borderRadius: radius.lg,
              borderColor: hexColors[theme].border,
            },
          ]}
        >
          <SampleFactCardLayers fact={item} />
        </View>
      </View>
    </Pressable>
  );
};

export default function WelcomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { screenWidth, screenHeight, spacing, iconSizes, isTablet } = useResponsive();

  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSkipping, setIsSkipping] = useState(false);
  const {
    isInitialized,
    isInitializing,
    initializationError,
    initializeOnboarding,
    setSelectedCategories,
  } = useOnboarding();
  const { isPremium } = usePremium();

  const facts = sampleFacts[locale as SupportedLocale] ?? sampleFacts.en;

  // Landscape detection for tablets
  const isLandscape = isTablet && screenWidth > screenHeight;

  // On tablets, carousel/notification are 70% of max content width, centered.
  // On phones, the carousel bleeds to screen edges so its width equals screenWidth.
  const carouselWidth = isTablet ? LAYOUT.MAX_CONTENT_WIDTH * 0.7 : screenWidth;

  // Dot dimensions from spacing scale
  const dotSize = spacing.sm;
  const activeDotWidth = spacing.xl;

  // Notification mockup fixed height — header line + body (2 lines) + padding + gap
  const notifFixedHeight = iconSizes.xxl + spacing.lg * 4;

  // Derive card size from width, capped by available height on small screens
  const widthBasedCardSize = carouselWidth - spacing.xxl * 2;
  const safeHeight = screenHeight - insets.top - insets.bottom;
  // Reserve: outer padding + header + button + dots + carousel item padding + notification + breathing room
  const reservedHeight =
    spacing.lg * 2 +
    spacing.md + // outer YStack padding (top + bottom)
    100 + // header estimate (progress + title + subtitle)
    60 + // CTA button height + marginTop
    spacing.md + 20 + // "Skip for now" link + gap
    dotSize +
    spacing.lg + // dots row + gap
    20 +
    spacing.md + // tap-to-preview hint + gap
    spacing.sm +
    spacing.lg + // carousel item padding (top + bottom)
    notifFixedHeight + // notification mockup
    spacing.xl * 4; // breathing room between header/notif, notif/carousel, carousel/dots, dots/button
  const maxCardFromHeight = safeHeight - reservedHeight;
  const cardSize = isTablet
    ? widthBasedCardSize
    : Math.min(widthBasedCardSize, Math.max(180, maxCardFromHeight));

  // Pre-fetch metadata (categories) while user browses the carousel
  // so the categories screen loads instantly
  useEffect(() => {
    if (!isInitialized && !isInitializing && !initializationError) {
      initializeOnboarding(locale as SupportedLocale);
    }
  }, [isInitialized, isInitializing, initializationError, locale, initializeOnboarding]);

  // === Entrance animations ===
  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const dotsAnim = useRef(new Animated.Value(0)).current;
  const notifAnim = useRef(new Animated.Value(0)).current;
  const notifSlide = useRef(new Animated.Value(spacing.xl)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const buttonSlide = useRef(new Animated.Value(spacing.xxl)).current;

  const hasTracked = useRef(false);
  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      trackScreenView(Screens.ONBOARDING_WELCOME);
    }

    const stagger = (
      delay: number,
      opacity: Animated.Value,
      extras?: Animated.CompositeAnimation[]
    ) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        ...(extras ?? []),
      ]);

    // Orchestrated entrance
    Animated.parallel([
      stagger(120, titleAnim),
      stagger(250, cardAnim, [
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          delay: 250,
          useNativeDriver: true,
        }),
      ]),
      stagger(450, dotsAnim),
      stagger(550, notifAnim, [
        Animated.spring(notifSlide, {
          toValue: 0,
          tension: 50,
          friction: 8,
          delay: 550,
          useNativeDriver: true,
        }),
      ]),
      stagger(650, buttonAnim, [
        Animated.spring(buttonSlide, {
          toValue: 0,
          tension: 50,
          friction: 8,
          delay: 650,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // === Carousel viewability ===
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const index = viewableItems[0].index;
      setActiveIndex(index);
      trackCarouselSwipe({
        section: 'onboarding_welcome',
        index,
        factId: sampleFactMorphId(index),
      });
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // Format first notification time for the mockup
  const mockTimeLabel = useMemo(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0); // Default 9:00 AM
    const h = d.getHours() % 12 || 12;
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${h}:00 ${ampm}`;
  }, []);

  // "Skip for now" selects every category the user can access and jumps
  // straight to the success screen, which persists the selection and finishes
  // onboarding. Premium-only categories are dropped for non-premium users,
  // matching the quiz's deriveCategories. Metadata is already warmed by
  // initializeOnboarding on mount; if it isn't ready, fall back to the quiz.
  const handleSkip = async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      const metadata = await api.getMetadata(locale);
      const allSlugs = (metadata.categories ?? [])
        .filter((category) => isPremium || !category.is_premium)
        .map((category) => category.slug);
      if (allSlugs.length === 0) {
        router.push('/onboarding/questions');
        return;
      }
      trackOnboardingCategoriesSelected(allSlugs);
      setSelectedCategories(allSlugs);
      router.push('/onboarding/success');
    } catch {
      router.push('/onboarding/questions');
    } finally {
      setIsSkipping(false);
    }
  };

  const renderItem = ({ item, index }: { item: SampleFact; index: number }) => (
    <View
      style={{
        width: carouselWidth,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: spacing.sm,
        paddingBottom: spacing.lg,
      }}
    >
      <FactImageCard
        item={item}
        index={index}
        size={cardSize}
        theme={theme}
        onPress={() =>
          router.push({ pathname: '/fact/sample/[id]', params: { id: String(index) } })
        }
      />
    </View>
  );

  return (
    <ScreenContainer edges={['bottom', 'left', 'right']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack
        flex={1}
        justifyContent="space-between"
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.lg}
        paddingBottom={spacing.lg + spacing.md + spacing.sm}
      >
        {/* Header: title (progress bar lives in the onboarding layout) */}
        <Animated.View style={{ opacity: titleAnim, marginTop: spacing.sm }}>
          <YStack gap={spacing.xs} alignItems="center">
            <Text.Headline textAlign="center">{t('hereIsWhatYouGet')}</Text.Headline>
          </YStack>
        </Animated.View>

        {/* Center content: notification mockup + card carousel + dots */}
        {isLandscape ? (
          /* Landscape tablet: notification and carousel side by side */
          <XStack alignSelf="center" alignItems="center" gap={spacing.xl} flex={1}>
            {/* Left: Notification mockup */}
            <Animated.View
              style={{
                width: carouselWidth,
                opacity: notifAnim,
                transform: [{ translateY: notifSlide }],
              }}
            >
              <MockNotificationCard
                appName={t('appName')}
                timeLabel={mockTimeLabel}
                factText={facts[activeIndex]?.title ?? facts[0].title}
              />
            </Animated.View>

            {/* Right: Carousel + dots */}
            <YStack alignItems="center">
              <Animated.View
                style={{
                  width: carouselWidth,
                  opacity: cardAnim,
                  transform: [{ scale: cardScale }],
                }}
              >
                <FlatList
                  key={carouselWidth}
                  data={facts}
                  renderItem={renderItem}
                  keyExtractor={(_, index) => index.toString()}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  overScrollMode="never"
                  snapToInterval={carouselWidth}
                  decelerationRate="fast"
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                />
              </Animated.View>

              {/* Dot pagination */}
              <Animated.View style={{ opacity: dotsAnim }}>
                <YStack gap={spacing.md} alignItems="center">
                  <XStack justifyContent="center" gap={spacing.sm}>
                    {facts.map((_, index) => (
                      <View
                        key={index}
                        style={{
                          height: dotSize,
                          borderRadius: dotSize / 2,
                          width: index === activeIndex ? activeDotWidth : dotSize,
                          backgroundColor:
                            index === activeIndex
                              ? theme === 'dark'
                                ? hexColors.dark.neonCyan
                                : hexColors.light.primary
                              : theme === 'dark'
                                ? 'rgba(255,255,255,0.2)'
                                : 'rgba(0,0,0,0.12)',
                        }}
                      />
                    ))}
                  </XStack>
                  <Text.Caption color="$textSecondary" textAlign="center">
                    {t('tapCardToPreview')}
                  </Text.Caption>
                </YStack>
              </Animated.View>
            </YStack>
          </XStack>
        ) : (
          /* Portrait (phones + portrait tablets): stacked vertically */
          <YStack
            flex={1}
            justifyContent="center"
            gap={spacing.md}
            {...(isTablet && {
              maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
              alignSelf: 'center' as const,
              alignItems: 'center' as const,
            })}
            width="100%"
          >
            {/* Notification mockup */}
            <Animated.View
              style={{
                ...(isTablet && { width: carouselWidth, alignSelf: 'center' }),
                height: notifFixedHeight,
                opacity: notifAnim,
                transform: [{ translateY: notifSlide }],
              }}
            >
              <MockNotificationCard
                appName={t('appName')}
                timeLabel={mockTimeLabel}
                factText={facts[activeIndex]?.title ?? facts[0].title}
              />
            </Animated.View>

            {/* Carousel */}
            <Animated.View
              style={{
                ...(isTablet && { width: carouselWidth, alignSelf: 'center' }),
                opacity: cardAnim,
                transform: [{ scale: cardScale }],
                marginHorizontal: isTablet ? 0 : -spacing.lg, // bleed to screen edges on phones only
              }}
            >
              <FlatList
                data={facts}
                renderItem={renderItem}
                keyExtractor={(_, index) => index.toString()}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                overScrollMode="never"
                snapToInterval={carouselWidth}
                decelerationRate="fast"
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
              />
            </Animated.View>

            {/* Dot pagination */}
            <Animated.View style={{ opacity: dotsAnim }}>
              <YStack gap={spacing.md} alignItems="center">
                <XStack justifyContent="center" gap={spacing.sm}>
                  {facts.map((_, index) => (
                    <View
                      key={index}
                      style={{
                        height: dotSize,
                        borderRadius: dotSize / 2,
                        width: index === activeIndex ? activeDotWidth : dotSize,
                        backgroundColor:
                          index === activeIndex
                            ? theme === 'dark'
                              ? hexColors.dark.neonCyan
                              : hexColors.light.primary
                            : theme === 'dark'
                              ? 'rgba(255,255,255,0.2)'
                              : 'rgba(0,0,0,0.12)',
                      }}
                    />
                  ))}
                </XStack>
                <Text.Caption color="$textSecondary" textAlign="center">
                  {t('tapCardToPreview')}
                </Text.Caption>
              </YStack>
            </Animated.View>
          </YStack>
        )}

        {/* CTA button (full width) */}
        <Animated.View
          style={{
            opacity: buttonAnim,
            transform: [{ translateY: buttonSlide }],
            marginTop: spacing.xl,
          }}
        >
          <Button onPress={() => router.push('/onboarding/questions')}>
            {t('personalizeMyFeed')}
          </Button>
          <Pressable
            disabled={isSkipping}
            onPress={handleSkip}
            hitSlop={SKIP_HITSLOP}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              marginTop: spacing.md,
              alignItems: 'center',
            })}
          >
            <Text.Caption color="$textSecondary">{t('skipForNow')}</Text.Caption>
          </Pressable>
        </Animated.View>
      </YStack>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
    elevation: 5,
  },
  cardContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
  },
  // Hides the card while it is the active morph source (the expanded preview
  // covers its rect exactly), mirroring ImageFactCard.
  morphSourceHidden: {
    opacity: 0,
  },
});
