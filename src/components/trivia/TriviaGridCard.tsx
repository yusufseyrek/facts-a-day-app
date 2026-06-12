import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { hexColors } from '../../theme';
import { darkenColor, getContrastColor } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import { Check, ChevronRight, Shuffle, Zap } from '../icons';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

export type TriviaGridCardType = 'daily' | 'mixed' | 'category';

interface TriviaGridCardProps {
  type: TriviaGridCardType;
  title: string;
  subtitle?: string;
  icon?: string;
  colorHex?: string;
  isCompleted?: boolean;
  isDisabled?: boolean;
  /** Availability still being fetched: card is inert (not dimmed) and the
      subtitle slot shows a small spinner instead of possibly-stale text. */
  isLoading?: boolean;
  isDark: boolean;
  onPress: () => void;
  centerContent?: boolean;
}

export function TriviaGridCard({
  type,
  title,
  subtitle,
  icon,
  colorHex,
  isCompleted = false,
  isDisabled = false,
  isLoading = false,
  isDark,
  onPress,
  centerContent = false,
}: TriviaGridCardProps) {
  const { iconSizes, spacing, radius, media, typography } = useResponsive();
  const iconContainerSize = media.topicCardSize * 0.7;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;

  // Determine the accent color based on type
  const getAccentColor = () => {
    if (isCompleted) return successColor;
    if (type === 'daily') return primaryColor;
    if (type === 'mixed') return purpleColor;
    return colorHex || primaryColor;
  };

  const accentColor = getAccentColor();
  // Full-color gradient tiles in the discover-screen style: text and icon use
  // the contrast color for the accent, not the theme text color.
  const contrastColor = getContrastColor(accentColor);
  const iconPlateBg = contrastColor === '#000000' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';

  // Render the icon based on type
  const renderIcon = () => {
    if (isCompleted && type === 'daily') {
      return <Check size={iconSizes.lg} color={contrastColor} strokeWidth={2.5} />;
    }

    if (type === 'daily') {
      return <Zap size={iconSizes.lg} color={contrastColor} strokeWidth={2} />;
    }

    if (type === 'mixed') {
      return <Shuffle size={iconSizes.lg} color={contrastColor} strokeWidth={2} />;
    }

    // Category type - use the icon from props
    return getLucideIcon(icon, iconSizes.lg, contrastColor);
  };

  // Generate testID based on type and icon
  const getTestId = () => {
    if (type === 'daily') return 'trivia-card-daily';
    if (type === 'mixed') return 'trivia-card-mixed';
    return `trivia-card-category-${icon || 'unknown'}`;
  };

  const inert = isLoading || isDisabled || (isCompleted && type === 'daily');

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [
        shadowStyles.card,
        {
          flex: 1,
          borderRadius: radius.xl,
          // Accent-colored glow instead of a flat black drop shadow — the
          // tiles read as lit, not boxed (same treatment as discover).
          shadowColor: accentColor,
          opacity: isDisabled ? 0.5 : pressed && !inert ? 0.9 : 1,
          transform: [{ scale: pressed && !inert ? 0.97 : 1 }],
        },
      ]}
      testID={getTestId()}
      accessibilityLabel={title}
    >
      <LinearGradient
        colors={[accentColor, darkenColor(accentColor, 0.22)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: radius.xl, overflow: 'hidden' }}
      >
        {/* Layered decorative circles for depth */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -iconContainerSize * 0.6,
            right: -iconContainerSize * 0.5,
            width: iconContainerSize * 1.8,
            height: iconContainerSize * 1.8,
            borderRadius: iconContainerSize * 0.9,
            backgroundColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -iconContainerSize * 0.7,
            left: -iconContainerSize * 0.4,
            width: iconContainerSize * 1.4,
            height: iconContainerSize * 1.4,
            borderRadius: iconContainerSize * 0.7,
            backgroundColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
          }}
        />
        <YStack
          padding={spacing.lg}
          justifyContent="space-between"
          alignItems={centerContent ? 'center' : 'stretch'}
        >
          {/* Top section: Icon + Chevron */}
          <XStack justifyContent="space-between" alignItems="flex-start" width="100%">
            {centerContent && <View style={{ width: iconSizes.sm }} />}
            <YStack
              width={iconContainerSize}
              height={iconContainerSize}
              borderRadius={iconContainerSize / 2}
              backgroundColor={iconPlateBg}
              justifyContent="center"
              alignItems="center"
            >
              {renderIcon()}
            </YStack>
            <ChevronRight size={iconSizes.md} color={contrastColor} opacity={0.55} />
          </XStack>

          {/* Bottom section: Title + Subtitle */}
          <YStack
            gap={spacing.xs}
            marginTop={spacing.md}
            alignItems={centerContent ? 'center' : 'flex-start'}
          >
            <Text.Label
              fontFamily={FONT_FAMILIES.bold}
              color={contrastColor}
              numberOfLines={1}
              textAlign={centerContent ? 'center' : 'left'}
            >
              {title}
            </Text.Label>
            {/* Only render the subtitle when there's text — an empty caption left
                a blank line under category cards (which carry no subtitle). */}
            {isLoading ? (
              /* Fixed to the caption's line height so the swap to real text
                 doesn't shift the card's layout. */
              <View
                style={{
                  height: typography.lineHeight.caption,
                  justifyContent: 'center',
                  alignSelf: centerContent ? 'center' : 'flex-start',
                }}
              >
                <ActivityIndicator size="small" color={contrastColor} />
              </View>
            ) : subtitle ? (
              <Text.Caption
                color={contrastColor}
                opacity={0.78}
                numberOfLines={1}
                textAlign={centerContent ? 'center' : 'left'}
              >
                {subtitle}
              </Text.Caption>
            ) : null}
          </YStack>
        </YStack>
      </LinearGradient>
    </Pressable>
  );
}

const shadowStyles = StyleSheet.create({
  card: {
    // shadowColor is set per-card (the accent color) at the call site.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
