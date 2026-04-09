import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  Button,
  FONT_FAMILIES,
  MockNotificationCard,
  ProgressIndicator,
  Text,
} from '../../src/components';
import { ScreenContainer } from '../../src/components';
import { LAYOUT } from '../../src/config/app';
import { IMAGE_PLACEHOLDER } from '../../src/config/images';
import { type SampleFact,sampleFacts } from '../../src/config/sampleFacts';
import { useOnboarding } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView } from '../../src/services/analytics';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { SupportedLocale } from '../../src/i18n';

// Gradient for text legibility over images
const gradientColors = ['transparent', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.85)'] as const;
const gradientLocations = [0.3, 0.55, 1] as const;

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };

/** Immersive 1:1 fact card with image, gradient, category badge, and title */
const FactImageCard = ({
  item,
  size,
  theme,
}: {
  item: SampleFact;
  size: number;
  theme: 'light' | 'dark';
}) => {
  const { spacing, radius, config } = useResponsive();

  return (
    <View
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
            borderColor: theme === 'dark' ? '#222222' : '#dfdfdf',
          },
        ]}
      >
        <Image
          source={item.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          placeholder={placeholder}
          transition={300}
        />

        {/* Gradient overlay */}
        <LinearGradient
          colors={gradientColors}
          locations={gradientLocations}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Category badge */}
        <View style={[styles.badge, { top: spacing.md, left: spacing.md }]}>
          <XStack
            paddingHorizontal={spacing.md}
            paddingVertical={spacing.xs}
            borderRadius={radius.full}
            style={{ backgroundColor: item.categoryColor }}
          >
            <Text.Caption color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
              {item.category}
            </Text.Caption>
          </XStack>
        </View>

        {/* Title */}
        <View style={[styles.titleArea, { padding: spacing.lg }]}>
          <Text.Title color="#FFFFFF" numberOfLines={config.maxLines} style={styles.titleShadow}>
            {item.title}
          </Text.Title>
        </View>
      </View>
    </View>
  );
};

export default function WelcomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { screenWidth, screenHeight, spacing, iconSizes, isTablet } = useResponsive();

  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const { isInitialized, isInitializing, initializationError, initializeOnboarding } =
    useOnboarding();

  const facts = sampleFacts[locale as SupportedLocale] ?? sampleFacts.en;

  // Landscape detection for tablets
  const isLandscape = isTablet && screenWidth > screenHeight;

  // On tablets, carousel/notification are 70% of max content width, centered.
  // On phones, the carousel bleeds to screen edges so its width equals screenWidth.
  const carouselWidth = isTablet
    ? LAYOUT.MAX_CONTENT_WIDTH * 0.7
    : screenWidth;

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
    spacing.lg * 2 + spacing.md + // outer YStack padding (top + bottom)
    100 + // header estimate (progress + title + subtitle)
    60 + // CTA button height + marginTop
    dotSize + spacing.lg + // dots row + gap
    spacing.sm + spacing.lg + // carousel item padding (top + bottom)
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
  const progressAnim = useRef(new Animated.Value(0)).current;
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
      stagger(0, progressAnim),
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
      setActiveIndex(viewableItems[0].index);
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

  const renderItem = ({ item }: { item: SampleFact }) => (
    <View
      style={{
        width: carouselWidth,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: spacing.sm,
        paddingBottom: spacing.lg,
      }}
    >
      <FactImageCard item={item} size={cardSize} theme={theme} />
    </View>
  );

  return (
    <ScreenContainer>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack
        flex={1}
        justifyContent="space-between"
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.lg}
        paddingBottom={spacing.lg + spacing.md + spacing.sm}
      >
        {/* Header: progress (full width) + title */}
        <YStack gap={spacing.md}>
          <Animated.View style={{ opacity: progressAnim }}>
            <ProgressIndicator currentStep={1} totalSteps={3} />
          </Animated.View>

          <Animated.View style={{ opacity: titleAnim, marginTop: spacing.sm }}>
            <YStack gap={spacing.xs} alignItems="center">
              <Text.Headline textAlign="center">{t('hereIsWhatYouGet')}</Text.Headline>
            </YStack>
          </Animated.View>
        </YStack>

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
          <Button onPress={() => router.push('/onboarding/categories')}>
            {t('chooseYourInterests')}
          </Button>
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
  badge: {
    position: 'absolute',
    zIndex: 10,
  },
  titleArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  titleShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
});
