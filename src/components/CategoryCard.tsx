import React from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { BodyText } from './Typography';
import { tokens, useTheme, getCategoryNeonColor } from '../theme';

// Tablet breakpoint
const TABLET_WIDTH = 768;

const Card = styled(YStack, {
  position: 'relative',
  width: '100%',
  aspectRatio: 1,
  borderRadius: tokens.radius.lg,
  borderWidth: 2,
  alignItems: 'center',
  justifyContent: 'center',
  gap: tokens.space.sm,
});

const CheckmarkContainer = styled(View, {
  position: 'absolute',
  top: tokens.space.sm,
  right: tokens.space.sm,
  width: 24,
  height: 24,
  borderRadius: tokens.radius.full,
  alignItems: 'center',
  justifyContent: 'center',
});

const IconContainer = styled(YStack, {
  alignItems: 'center',
  justifyContent: 'center',
});

const LabelContainer = styled(YStack, {
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: tokens.space.xs,
});

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
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_WIDTH;

  // Get neon color for this category - prefer colorHex from DB, fallback to theme-based
  const categorySlug = slug || label.toLowerCase().replace(/\s+/g, '-');
  const neonColor = colorHex || getCategoryNeonColor(categorySlug, theme);

  // Colors based on selection state
  const iconColor = selected
    ? '#FFFFFF'
    : theme === 'dark' ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;

  const backgroundColor = selected
    ? neonColor
    : theme === 'dark' ? tokens.color.dark.surface : tokens.color.light.surface;

  const borderColor = selected
    ? neonColor
    : theme === 'dark' ? tokens.color.dark.border : tokens.color.light.border;

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <Card
            opacity={pressed ? 0.7 : 1}
            style={{
              backgroundColor,
              borderColor,
            }}
          >
            {selected && (
              <CheckmarkContainer style={{ backgroundColor: '#FFFFFF30' }}>
                <Check size={16} color="#FFFFFF" strokeWidth={3} />
              </CheckmarkContainer>
            )}
            <IconContainer>
              {React.isValidElement(icon)
                ? React.cloneElement(icon as React.ReactElement<any>, {
                    color: iconColor,
                    size: isTablet ? 32 : 24,
                  })
                : icon}
            </IconContainer>
            <LabelContainer>
              <BodyText
                fontWeight={tokens.fontWeight.medium}
                color={selected ? '#FFFFFF' : '$text'}
                textAlign="center"
                fontSize={labelFontSize ?? (isTablet ? tokens.fontSize.body : tokens.fontSize.small)}
                numberOfLines={2}
              >
                {label}
              </BodyText>
            </LabelContainer>
          </Card>
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
