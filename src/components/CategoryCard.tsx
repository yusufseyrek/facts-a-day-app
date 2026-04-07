import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, Text as RNText } from 'react-native';

import { Check, Crown, Lock } from '@tamagui/lucide-icons';
import { YStack } from 'tamagui';

import { useTranslation } from '../i18n/useTranslation';
import { getCategoryNeonColor, hexColors, useTheme } from '../theme';
import { getContrastColor } from '../utils/colors';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES } from './Typography';

export interface CategoryCardProps {
  icon: React.ReactNode;
  label: string;
  slug?: string;
  colorHex?: string;
  selected: boolean;
  onPress: () => void;
  labelFontSize?: number;
  disabled?: boolean;
  locked?: boolean;
}

const CategoryCardComponent = ({
  icon,
  label,
  slug,
  colorHex,
  selected,
  onPress,
  labelFontSize,
  disabled = false,
  locked = false,
}: CategoryCardProps) => {
  const { theme } = useTheme();
  const { spacing, radius, typography, iconSizes } = useResponsive();
  const { t } = useTranslation();

  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const checkmarkAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const isFirstRender = useRef(true);
  const runningAnims = useRef<Animated.CompositeAnimation[]>([]);

  // Animate on selection change
  useEffect(() => {
    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      checkmarkAnim.setValue(selected ? 1 : 0);
      return;
    }

    // Stop any in-flight animations to prevent conflicts
    runningAnims.current.forEach((a) => a.stop());
    runningAnims.current = [];

    // Scale bounce animation
    const bounce = Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
    ]);

    // Checkmark animation — use simple easing (no overshoot) so opacity
    // never goes below 0 on deselect
    const checkmark = Animated.timing(checkmarkAnim, {
      toValue: selected ? 1 : 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    runningAnims.current = [bounce, checkmark];
    bounce.start();
    checkmark.start();
  }, [selected]);

  // Get neon color for this category - prefer colorHex from DB, fallback to theme-based
  const categorySlug = slug || label.toLowerCase().replace(/\s+/g, '-');
  const neonColor = colorHex || getCategoryNeonColor(categorySlug, theme);

  // Determine contrast color for selected state
  const contrastColor = getContrastColor(neonColor);

  // Colors based on selection state
  const iconColor = selected
    ? contrastColor
    : theme === 'dark'
      ? hexColors.dark.textSecondary
      : hexColors.light.textSecondary;

  const backgroundColor = selected
    ? neonColor
    : theme === 'dark'
      ? hexColors.dark.surface
      : hexColors.light.surface;

  const borderColor = selected
    ? neonColor
    : theme === 'dark'
      ? hexColors.dark.border
      : hexColors.light.border;

  // Checkmark transform styles
  const checkmarkStyle = {
    opacity: checkmarkAnim,
    transform: [
      {
        scale: checkmarkAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 1],
          extrapolate: 'clamp',
        }),
      },
      {
        rotate: checkmarkAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['-45deg', '0deg'],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  const checkmarkContainerStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      top: spacing.sm,
      right: spacing.sm,
      width: iconSizes.md,
      height: iconSizes.md,
      borderRadius: radius.full,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: contrastColor === '#000000' ? '#00000020' : '#FFFFFF30',
    }),
    [spacing, radius, contrastColor]
  );

  return (
    <Pressable
      onPress={disabled && !locked ? undefined : onPress}
      role="button"
      aria-label={t('a11y_categoryCard', { category: label })}
      aria-disabled={disabled && !locked}
      style={{ flex: 1 }}
      disabled={disabled && !locked}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            flex: 1,
            transform: [{ scale: scaleAnim }],
          }}
        >
          <YStack
            position="relative"
            width="100%"
            aspectRatio={1}
            borderRadius={radius.lg}
            borderWidth={2}
            alignItems="center"
            justifyContent="center"
            gap={spacing.sm}
            opacity={disabled && !locked ? 0.4 : locked ? 0.65 : pressed ? 0.85 : 1}
            style={{
              backgroundColor,
              borderColor,
            }}
          >
            {locked ? (
              <YStack
                position="absolute"
                top={spacing.sm}
                right={spacing.sm}
                width={iconSizes.md}
                height={iconSizes.md}
                borderRadius={radius.full}
                alignItems="center"
                justifyContent="center"
                backgroundColor={theme === 'dark' ? '#FFFFFF15' : '#00000010'}
              >
                <Lock size={iconSizes.xs} color={theme === 'dark' ? '#FFFFFF70' : '#00000050'} strokeWidth={2.5} />
              </YStack>
            ) : (
              <Animated.View style={[checkmarkContainerStyle, checkmarkStyle]}>
                <Check size={iconSizes.sm} color={contrastColor} strokeWidth={3} />
              </Animated.View>
            )}
            <YStack alignItems="center" justifyContent="center">
              {React.isValidElement(icon)
                ? React.cloneElement(icon as React.ReactElement<any>, {
                    color: iconColor,
                    size: iconSizes.lg,
                  })
                : icon}
            </YStack>
            <YStack alignItems="center" justifyContent="center" paddingHorizontal={spacing.sm}>
              <RNText
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                maxFontSizeMultiplier={DEFAULT_MAX_FONT_SIZE_MULTIPLIER}
                style={{
                  fontFamily: FONT_FAMILIES.semibold,
                  color: selected ? contrastColor : theme === 'dark' ? hexColors.dark.text : hexColors.light.text,
                  textAlign: 'center',
                  fontSize: labelFontSize ?? typography.fontSize.caption,
                  lineHeight: (labelFontSize ?? typography.fontSize.caption) * 1.3,
                }}
              >
                {label}
              </RNText>
            </YStack>
          </YStack>
        </Animated.View>
      )}
    </Pressable>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const CategoryCard = React.memo(CategoryCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.label === nextProps.label &&
    prevProps.slug === nextProps.slug &&
    prevProps.colorHex === nextProps.colorHex &&
    prevProps.selected === nextProps.selected &&
    prevProps.labelFontSize === nextProps.labelFontSize &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.locked === nextProps.locked
    // Don't compare icon and onPress as they may be recreated but functionally equivalent
  );
});
