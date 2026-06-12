import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER } from '../config/images';
import { useResponsive } from '../utils/useResponsive';

import { XStack } from 'tamagui';
import { FONT_FAMILIES, Text } from './Typography';

import type { SampleFact } from '../config/sampleFacts';

// Gradient for text legibility over images
export const SAMPLE_CARD_GRADIENT = {
  colors: ['transparent', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.85)'] as const,
  locations: [0.3, 0.55, 1] as const,
};

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };

/**
 * Visual layers of an onboarding sample fact card: bundled image, legibility
 * gradient, category badge, title. Fills its parent, which owns size, border
 * radius and clipping. Shared between the welcome-carousel card and the morph
 * transition's card replica so the two are pixel-identical at frame 0.
 *
 * @param titleWidth Pins the title block to a fixed width (the replica sets
 * the pressed card's width so the title never reflows mid-morph).
 * @param imageTransition 0 for the replica — it must be opaque on its first
 * frame, a fade-in would show a hole.
 * @param onImageReady Fired on the image's first paint (the replica's morph
 * container holds the transition until then — see FactCardReplica).
 */
export function SampleFactCardLayers({
  fact,
  titleWidth,
  imageTransition = 300,
  onImageReady,
}: {
  fact: SampleFact;
  titleWidth?: number;
  imageTransition?: number;
  onImageReady?: () => void;
}) {
  const { spacing, radius, config } = useResponsive();

  return (
    <View style={styles.fill} pointerEvents="none">
      <Image
        source={fact.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        placeholder={placeholder}
        transition={imageTransition}
        onLoad={onImageReady}
        onDisplay={onImageReady}
      />

      <LinearGradient
        colors={SAMPLE_CARD_GRADIENT.colors}
        locations={SAMPLE_CARD_GRADIENT.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Category badge */}
      <View style={[styles.badge, { top: spacing.md, left: spacing.md }]}>
        <XStack
          paddingHorizontal={spacing.md}
          paddingVertical={spacing.xs}
          borderRadius={radius.full}
          style={{ backgroundColor: fact.categoryColor }}
        >
          <Text.Caption color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
            {fact.category}
          </Text.Caption>
        </XStack>
      </View>

      {/* Title */}
      <View
        style={[
          styles.titleArea,
          { padding: spacing.lg },
          titleWidth != null ? { right: undefined, width: titleWidth } : null,
        ]}
      >
        <Text.Title color="#FFFFFF" numberOfLines={config.maxLines} style={styles.titleShadow}>
          {fact.title}
        </Text.Title>
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
