/**
 * ShareCard Component
 * Renders a branded card for sharing facts
 * This component is rendered off-screen and captured using ViewShot
 */

import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { XStack, YStack } from 'tamagui';

import { i18n } from '../../i18n';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appIcon = require('../../../assets/icon.png');
import {
  SHARE_CARD_BACKGROUND,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_PADDING,
  SHARE_CARD_WIDTH,
  SHARE_DOMAIN_ACCENT_COLOR,
  SHARE_GRADIENT_COLORS,
  SHARE_GRADIENT_LOCATIONS,
  SHARE_IMAGE_FORMAT,
  SHARE_IMAGE_OVERLAY_COLORS,
  SHARE_IMAGE_OVERLAY_LOCATIONS,
  SHARE_IMAGE_QUALITY,
  SHARE_STORE_HINT_FONT_SIZE,
  SHARE_TEXT_COLOR,
  SHARE_TEXT_MUTED,
  SHARE_WATERMARK_FONT_SIZE,
  SHARE_WATERMARK_LOGO_SIZE,
} from '../../services/share/config';
import { getCategoryNeonColor } from '../../theme';
import { getContrastColor } from '../../utils/colors';
import { FONT_FAMILIES, Text } from '../Typography';

import type { Category } from '../../services/database';
import type { ShareableFact } from '../../services/share/types';

interface ShareCardProps {
  fact: ShareableFact;
}

/**
 * Get category display info
 * Category names come from the database already localized
 */
function getCategoryInfo(category: string | Category | undefined) {
  if (!category) return null;

  let displayName: string;
  let backgroundColor: string;

  if (typeof category === 'string') {
    displayName = category;
    backgroundColor = getCategoryNeonColor(category, 'dark');
  } else {
    displayName = category.name;
    backgroundColor = category.color_hex || getCategoryNeonColor(category.slug, 'dark');
  }

  return {
    displayName,
    backgroundColor,
    textColor: getContrastColor(backgroundColor),
  };
}

export const ShareCard = forwardRef<ViewShot, ShareCardProps>(({ fact }, ref) => {
  const title = fact.title || fact.content.substring(0, 200);
  const categoryInfo = getCategoryInfo(fact.category);

  // Adjust font size based on title length - increased ~30%
  const getFontSize = () => {
    if (title.length > 200) return 42;
    if (title.length > 150) return 48;
    if (title.length > 100) return 52;
    return 56;
  };

  const getLineHeight = () => {
    if (title.length > 200) return 56;
    if (title.length > 150) return 64;
    if (title.length > 100) return 68;
    return 74;
  };

  const hasImage = !!fact.imageUri;

  return (
    <ViewShot
      ref={ref}
      options={{
        format: SHARE_IMAGE_FORMAT,
        quality: SHARE_IMAGE_QUALITY,
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
      }}
      style={styles.offscreen}
    >
      <View style={styles.card}>
        {/* Background Image or Gradient */}
        {hasImage ? (
          <>
            <Image
              source={{ uri: fact.imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={[...SHARE_IMAGE_OVERLAY_COLORS]}
              locations={[...SHARE_IMAGE_OVERLAY_LOCATIONS]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <LinearGradient
            colors={[...SHARE_GRADIENT_COLORS]}
            locations={[...SHARE_GRADIENT_LOCATIONS]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Content Container - Category Badge + Title centered */}
        <YStack flex={1} padding={SHARE_CARD_PADDING} justifyContent="center" alignItems="center">
          {/* Category + Fact ID Badge */}
          {categoryInfo && (
            <View style={[styles.categoryBadge, { backgroundColor: categoryInfo.backgroundColor }]}>
              <Text
                fontSize={22}
                fontFamily={FONT_FAMILIES.semibold}
                color={categoryInfo.textColor}
              >
                {categoryInfo.displayName} #{fact.id}
              </Text>
            </View>
          )}

          {/* Fact Title */}
          <Text
            fontSize={getFontSize()}
            lineHeight={getLineHeight()}
            fontFamily={FONT_FAMILIES.bold}
            color={SHARE_TEXT_COLOR}
            textAlign="center"
            style={styles.factText}
            marginTop={categoryInfo ? 24 : 0}
          >
            {title}
          </Text>
        </YStack>

        {/* Bottom Right: Watermark */}
        <View style={styles.watermarkContainer}>
          <XStack alignItems="center" gap={8}>
            <View style={styles.watermarkLogoContainer}>
              <Image
                source={appIcon}
                style={styles.watermarkLogo}
                contentFit="contain"
              />
            </View>
            <Text
              fontSize={SHARE_WATERMARK_FONT_SIZE}
              fontFamily={FONT_FAMILIES.semibold}
              color={SHARE_TEXT_MUTED}
            >
              Facts<Text color={SHARE_DOMAIN_ACCENT_COLOR}>A</Text>Day.com
            </Text>
          </XStack>
          <Text
            fontSize={SHARE_STORE_HINT_FONT_SIZE}
            fontFamily={FONT_FAMILIES.regular}
            color={SHARE_TEXT_MUTED}
            marginTop={4}
          >
            {i18n.t('shareAvailableOn')}
          </Text>
        </View>
      </View>
    </ViewShot>
  );
});

ShareCard.displayName = 'ShareCard';

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: SHARE_CARD_BACKGROUND,
  },
  categoryBadge: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
  },
  watermarkContainer: {
    position: 'absolute',
    bottom: SHARE_CARD_PADDING,
    right: SHARE_CARD_PADDING,
    alignItems: 'flex-end',
  },
  watermarkLogoContainer: {
    width: SHARE_WATERMARK_LOGO_SIZE,
    height: SHARE_WATERMARK_LOGO_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  watermarkLogo: {
    width: SHARE_WATERMARK_LOGO_SIZE,
    height: SHARE_WATERMARK_LOGO_SIZE,
  },
  factText: {
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
