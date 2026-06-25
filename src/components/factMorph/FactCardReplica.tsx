import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER } from '../../config/images';
import { useResponsive } from '../../utils/useResponsive';
import { CategoryBadge } from '../CategoryBadge';
import { FavoriteButton } from '../FavoriteButton';
import { Crown } from '../icons';
import { FACT_CARD_GRADIENT, factCardCrownShadow, factCardTitleShadow } from '../ImageFactCard';
import { ImagePlaceholder } from '../ImagePlaceholder';
import { OfflineSaveButton } from '../OfflineSaveButton';
import { SampleFactCardLayers } from '../SampleFactCard';
import { Text } from '../Typography';

import type {
  FactMorphSource,
  ImageCardMorphSource,
  SampleCardMorphSource,
  ThumbnailMorphSource,
} from '../../services/factMorph';

/**
 * Static visual clone of the pressed morph source (a full-bleed card, or just
 * the thumbnail of a row source), layered inside the morph container. It
 * matches the source pixel-for-pixel at progress 0 (same image
 * URI and visual props, registered by the card itself on press-in) and fades
 * out over the always-opaque detail screen beneath (one-sided dissolve — see
 * FactMorphContainer's Liquid Glass note). Each variant must be opaque at
 * progress 0: the replica is all the frame-0 coverage there is.
 *
 * The whole tree is inert (pointerEvents none on the wrapper) — interactive
 * children like FavoriteButton render purely for visual continuity.
 *
 * `onReady` reports the replica's frame-0 coverage: fired on the image's
 * first paint (onLoad/onDisplay — expo-image decodes asynchronously even on
 * cache hits), or immediately when there is no image to wait for. The morph
 * container holds the transition (and the source card's hide) until then,
 * otherwise the opening frames flash the blurhash where the image was.
 */
export function FactCardReplica({
  source,
  onReady,
}: {
  source: FactMorphSource;
  onReady?: () => void;
}) {
  switch (source.kind) {
    case 'image-card':
      return <ImageCardReplica source={source} onReady={onReady} />;
    case 'thumbnail':
      return <ThumbnailReplica source={source} onReady={onReady} />;
    case 'sample-card':
      return <SampleCardReplica source={source} onReady={onReady} />;
  }
}

/**
 * Mirrors the onboarding welcome carousel card (same shared layers). The
 * opaque base matches the card's background so frame 0 has full coverage
 * even before the bundled image paints.
 */
function SampleCardReplica({
  source,
  onReady,
}: {
  source: SampleCardMorphSource;
  onReady?: () => void;
}) {
  return (
    <View style={[styles.fill, styles.sampleCardBase]} pointerEvents="none">
      <SampleFactCardLayers
        fact={source.fact}
        titleWidth={source.width}
        imageTransition={0}
        onImageReady={onReady}
      />
    </View>
  );
}

/** Mirrors ImageFactCard: full-bleed image, gradient, badges, title overlay. */
function ImageCardReplica({
  source,
  onReady,
}: {
  source: ImageCardMorphSource;
  onReady?: () => void;
}) {
  const { spacing, config } = useResponsive();
  const Title = source.TitleComponent || Text.Title;

  // No image to wait for — the gradient/badge/title layers paint
  // synchronously, so frame 0 is covered from the first commit.
  useEffect(() => {
    if (!source.imageUri) onReady?.();
  }, [source.imageUri, onReady]);

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
          // Both fire on cache hits; whichever lands first releases the
          // morph's frame-0 gate (idempotent on the container side).
          onLoad={onReady}
          onDisplay={onReady}
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
          styles.actionCluster,
          source.favoritePositionStyle ?? { top: spacing.md, right: spacing.md },
        ]}
      >
        {source.showOfflineSave && !source.isPremiumLocked && (
          <OfflineSaveButton factId={source.factId} />
        )}
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

/**
 * Mirrors the square thumbnail of a row source (CompactFactCard, Keep
 * Reading). The replica IS the image — the morph container starts and ends
 * on the thumbnail rect, so there is no row chrome to clone. With an image
 * the frame morphs onto the detail hero; with a placeholder it stays pinned
 * at its original size and fades in place (see FactMorphContainer).
 */
function ThumbnailReplica({
  source,
  onReady,
}: {
  source: ThumbnailMorphSource;
  onReady?: () => void;
}) {
  // The placeholder branch paints synchronously (View + vector icon), so
  // frame 0 is covered from the first commit.
  useEffect(() => {
    if (!source.imageUri) onReady?.();
  }, [source.imageUri, onReady]);

  if (source.imageUri) {
    return (
      <Image
        source={{ uri: source.imageUri }}
        aria-hidden
        style={styles.fill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        // Same blurhash as the cards, so a still-loading thumbnail shows the
        // identical placeholder instead of popping.
        placeholder={{ blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH }}
        // Both fire on cache hits; whichever lands first releases the
        // morph's frame-0 gate (idempotent on the container side).
        onLoad={onReady}
        onDisplay={onReady}
      />
    );
  }
  return (
    <ImagePlaceholder
      width={source.width}
      height={source.height}
      borderRadius={source.borderRadius}
      iconSize={source.width * 0.4}
      categoryIcon={source.categoryIcon}
      categoryColor={source.categoryColor}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    overflow: 'hidden',
  },
  // Same backdrop as the welcome carousel card's container.
  sampleCardBase: {
    backgroundColor: '#1a1a2e',
  },
  badge: {
    position: 'absolute',
    zIndex: 10,
  },
  // Matches ImageFactCard's right-anchored favorite/offline cluster.
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});
