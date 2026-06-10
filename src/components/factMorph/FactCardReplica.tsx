import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ChevronRight, Crown } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER } from '../../config/images';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { CategoryBadge } from '../CategoryBadge';
import { FavoriteButton } from '../FavoriteButton';
import { FACT_CARD_GRADIENT, factCardCrownShadow, factCardTitleShadow } from '../ImageFactCard';
import { ImagePlaceholder } from '../ImagePlaceholder';
import { FONT_FAMILIES, Text } from '../Typography';

import type {
  CompactCardMorphSource,
  FactMorphSource,
  ImageCardMorphSource,
  KeepReadingMorphSource,
} from '../../services/factMorph';

/**
 * Static visual clone of the pressed fact card/row, layered inside the morph
 * container. It matches the source pixel-for-pixel at progress 0 (same image
 * URI and visual props, registered by the card itself on press-in) and fades
 * out over the always-opaque detail screen beneath (one-sided dissolve — see
 * FactMorphContainer's Liquid Glass note). Each variant must be opaque at
 * progress 0: the replica is all the frame-0 coverage there is.
 *
 * The whole tree is inert (pointerEvents none on the wrapper) — interactive
 * children like FavoriteButton render purely for visual continuity.
 */
export function FactCardReplica({ source }: { source: FactMorphSource }) {
  switch (source.kind) {
    case 'image-card':
      return <ImageCardReplica source={source} />;
    case 'compact-card':
      return <CompactCardReplica source={source} />;
    case 'keep-reading':
      return <KeepReadingReplica source={source} />;
  }
}

/** Mirrors ImageFactCard: full-bleed image, gradient, badges, title overlay. */
function ImageCardReplica({ source }: { source: ImageCardMorphSource }) {
  const { spacing, config } = useResponsive();
  const Title = source.TitleComponent || Text.Title;

  return (
    <View style={styles.fill} pointerEvents="none">
      {source.imageUri && (
        <Image
          source={{ uri: source.imageUri }}
          aria-hidden
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      )}
      <LinearGradient
        colors={FACT_CARD_GRADIENT.colors}
        locations={FACT_CARD_GRADIENT.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {source.category && (
        <View style={[styles.badge, { top: spacing.md, left: spacing.md }]}>
          <CategoryBadge category={source.category} showLock={source.isPremiumLocked} />
        </View>
      )}
      <View
        style={[
          styles.badge,
          source.favoritePositionStyle ?? { top: spacing.md, right: spacing.md },
        ]}
      >
        {source.isPremiumLocked ? (
          <View style={factCardCrownShadow}>
            <Crown size={22} color="#FFD700" fill="#FFD700" />
          </View>
        ) : (
          <FavoriteButton
            factId={source.factId}
            imageUrl={source.imageUrl}
            categorySlug={source.categorySlug}
          />
        )}
      </View>
      <View
        style={[
          styles.contentOverlay,
          // Pinned to the card's original width so the title never reflows
          // while the container is resizing mid-morph.
          { width: source.width },
          source.contentOverlayStyle ?? {
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            paddingTop: spacing.xl * 1.5,
          },
        ]}
      >
        <Title
          color="#FFFFFF"
          numberOfLines={source.titleNumberOfLines ?? config.maxLines}
          style={factCardTitleShadow}
        >
          {source.title}
        </Title>
      </View>
    </View>
  );
}

/** Mirrors CompactFactCard: rounded surface row, thumbnail + title + badge. */
function CompactCardReplica({ source }: { source: CompactCardMorphSource }) {
  const { theme } = useTheme();
  const { spacing, radius, typography, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  return (
    <View
      style={[
        styles.fill,
        styles.row,
        {
          borderRadius: radius.lg,
          backgroundColor: colors.cardBackground,
          padding: spacing.md,
          gap: spacing.md,
        },
      ]}
      pointerEvents="none"
    >
      <View
        style={{
          width: source.thumbnailSize,
          height: source.thumbnailSize,
          borderRadius: radius.md,
          overflow: 'hidden',
        }}
      >
        {source.imageUri ? (
          <Image
            source={{ uri: source.imageUri }}
            aria-hidden
            style={styles.fillImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            // Same blurhash as the card, so a still-loading thumbnail shows
            // the identical placeholder instead of popping.
            placeholder={{ blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH }}
          />
        ) : (
          <ImagePlaceholder
            width={source.thumbnailSize}
            height={source.thumbnailSize}
            borderRadius={radius.md}
            iconSize={source.thumbnailSize * 0.4}
            categoryIcon={source.categoryIcon}
            categoryColor={source.categoryColor}
          />
        )}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xs }}>
        <Text.Label
          numberOfLines={source.titleLines}
          color={colors.text}
          fontFamily={FONT_FAMILIES.bold}
        >
          {source.title}
        </Text.Label>
        {!source.hideCategoryBadge && source.category && (
          <CategoryBadge category={source.category} fontSize={typography.fontSize.tiny} compact />
        )}
      </View>
      {source.showChevron && <ChevronRight size={iconSizes.md} color={colors.primary} />}
    </View>
  );
}

/**
 * Mirrors KeepReadingItem: category + title left, square thumbnail right.
 *
 * The row itself is transparent (even rows) or translucent (odd rows) over
 * the feed background, so the replica paints that background color as an
 * opaque base: the morph's detail content underneath is always opaque (the
 * Liquid Glass constraint, see FactMorphContainer) and would otherwise show
 * through at frame 0. The composite is pixel-identical to the feed row.
 */
function KeepReadingReplica({ source }: { source: KeepReadingMorphSource }) {
  const { theme } = useTheme();
  const { spacing } = useResponsive();
  const colors = hexColors[theme];

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} pointerEvents="none">
      {source.isOdd && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.cardBackground}70` }]}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.row, { padding: spacing.xl }]}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          {source.categoryName && (
            <Text.Label color={source.categoryColor ?? '$textSecondary'} marginBottom={spacing.xs}>
              {source.categoryName}
            </Text.Label>
          )}
          <Text.Body color="$text" numberOfLines={5} fontFamily={FONT_FAMILIES.semibold}>
            {source.title}
          </Text.Body>
        </View>
        {source.imageUri ? (
          <Image
            source={{ uri: source.imageUri }}
            aria-hidden
            style={{
              width: source.imageSize,
              height: source.imageSize,
              borderRadius: spacing.sm,
              overflow: 'hidden',
            }}
            contentFit="cover"
            transition={0}
          />
        ) : (
          <ImagePlaceholder
            width={source.imageSize}
            height={source.imageSize}
            borderRadius={spacing.sm}
            iconSize={source.imageSize * 0.4}
            categoryIcon={source.categoryIcon}
            categoryColor={source.categoryColor}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    overflow: 'hidden',
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    zIndex: 10,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});
