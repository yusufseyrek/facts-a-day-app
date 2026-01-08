import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, Easing } from 'react-native';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { Text, FONT_FAMILIES } from './Typography';
import { hexColors, spacing, radius, useTheme, getCategoryNeonColor } from '../theme';
import { getContrastColor } from '../utils/colors';
import { useResponsive } from '../utils/useResponsive';

const Card = styled(YStack, {
  position: 'relative',
  width: '100%',
  aspectRatio: 1,
  borderRadius: radius.phone.lg,
  borderWidth: 2,
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.phone.sm,
});

const IconContainer = styled(YStack, {
  alignItems: 'center',
  justifyContent: 'center',
});

const LabelContainer = styled(YStack, {
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: spacing.phone.xs,
});

// Animated wrapper for the checkmark
const AnimatedCheckmarkContainer = Animated.createAnimatedComponent(View);

export interface CategoryCardProps {
  icon: React.ReactNode;
  label: string;
  slug?: string;
  colorHex?: string;
  selected: boolean;
  onPress: () => void;
  labelFontSize?: number;
}

const CategoryCardComponent = ({ icon, label, slug, colorHex, selected, onPress, labelFontSize }: CategoryCardProps) => {
  const { theme } = useTheme();
  const { isTablet, typography, iconSizes } = useResponsive();

  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const checkmarkAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const isFirstRender = useRef(true);

  // Animate on selection change
  useEffect(() => {
    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      checkmarkAnim.setValue(selected ? 1 : 0);
      return;
    }

    // Scale bounce animation
    Animated.sequence([
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
    ]).start();

    // Checkmark animation - fast and snappy
    Animated.timing(checkmarkAnim, {
      toValue: selected ? 1 : 0,
      duration: 80,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [selected]);

  // Get neon color for this category - prefer colorHex from DB, fallback to theme-based
  const categorySlug = slug || label.toLowerCase().replace(/\s+/g, '-');
  const neonColor = colorHex || getCategoryNeonColor(categorySlug, theme);
  
  // Determine contrast color for selected state
  const contrastColor = getContrastColor(neonColor);

  // Colors based on selection state
  const iconColor = selected
    ? contrastColor
    : theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  const backgroundColor = selected
    ? neonColor
    : theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface;

  const borderColor = selected
    ? neonColor
    : theme === 'dark' ? hexColors.dark.border : hexColors.light.border;

  // Checkmark transform styles
  const checkmarkStyle = {
    opacity: checkmarkAnim,
    transform: [
      {
        scale: checkmarkAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 1],
        }),
      },
      {
        rotate: checkmarkAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['-45deg', '0deg'],
        }),
      },
    ],
  };

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <Animated.View
          style={{
            flex: 1,
            transform: [{ scale: scaleAnim }],
          }}
        >
          <Card
            opacity={pressed ? 0.85 : 1}
            style={{
              backgroundColor,
              borderColor,
            }}
          >
            <AnimatedCheckmarkContainer
              style={[
                {
                  position: 'absolute',
                  top: spacing.phone.sm,
                  right: spacing.phone.sm,
                  width: 24,
                  height: 24,
                  borderRadius: radius.phone.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: contrastColor === '#000000' ? '#00000020' : '#FFFFFF30',
                },
                checkmarkStyle,
              ]}
            >
              <Check size={iconSizes.sm} color={contrastColor} strokeWidth={3} />
            </AnimatedCheckmarkContainer>
            <IconContainer>
              {React.isValidElement(icon)
                ? React.cloneElement(icon as React.ReactElement<any>, {
                    color: iconColor,
                    size: iconSizes.lg,
                  })
                : icon}
            </IconContainer>
            <LabelContainer>
              <Text.Label
                fontFamily={FONT_FAMILIES.semibold}
                color={selected ? contrastColor : '$text'}
                textAlign="center"
                fontSize={labelFontSize ?? typography.fontSize.caption}
                numberOfLines={2}
              >
                {label}
              </Text.Label>
            </LabelContainer>
          </Card>
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
    prevProps.labelFontSize === nextProps.labelFontSize
    // Don't compare icon and onPress as they may be recreated but functionally equivalent
  );
});
