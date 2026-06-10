import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Crown } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useResponsive } from '../../utils/useResponsive';
import { CategoryBadge } from '../CategoryBadge';
import { FavoriteButton } from '../FavoriteButton';
import { FACT_CARD_GRADIENT, factCardCrownShadow, factCardTitleShadow } from '../ImageFactCard';
import { Text } from '../Typography';

import type { FactMorphSource } from '../../services/factMorph';

/**
 * Static visual clone of the pressed ImageFactCard, layered inside the morph
 * container. It matches the card pixel-for-pixel at progress 0 (same image
 * URI, gradient, badge, favorite/crown, title styling registered by the card
 * itself) and cross-fades out as the real detail screen fades in underneath.
 *
 * The whole tree is inert (pointerEvents none on the wrapper) — interactive
 * children like FavoriteButton render purely for visual continuity.
 */
export function FactCardReplica({ source }: { source: FactMorphSource }) {
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

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    overflow: 'hidden',
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
