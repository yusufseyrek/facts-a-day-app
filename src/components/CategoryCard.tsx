import React from 'react';
import { Pressable } from 'react-native';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { BodyText } from './Typography';
import { tokens } from '../theme/tokens';

const Card = styled(YStack, {
  position: 'relative',
  width: '100%',
  aspectRatio: 1,
  borderRadius: tokens.radius.lg,
  borderWidth: 2,
  alignItems: 'center',
  justifyContent: 'center',
  gap: tokens.space.sm,

  variants: {
    selected: {
      true: {
        backgroundColor: '$primary',
        borderColor: '$primary',
      },
      false: {
        backgroundColor: '$surface',
        borderColor: '$border',
      },
    },
  } as const,

  defaultVariants: {
    selected: false,
  },
});

const CheckmarkContainer = styled(View, {
  position: 'absolute',
  top: tokens.space.sm,
  right: tokens.space.sm,
  width: 24,
  height: 24,
  borderRadius: tokens.radius.full,
  backgroundColor: '$primary',
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
  selected: boolean;
  onPress: () => void;
  labelFontSize?: number;
}

const CategoryCardComponent = ({ icon, label, selected, onPress, labelFontSize }: CategoryCardProps) => {
  const iconColor = selected ? '#FFFFFF' : tokens.color.light.textSecondary;

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <Card selected={selected} opacity={pressed ? 0.7 : 1}>
          {selected && (
            <CheckmarkContainer>
              <Check size={16} color="#FFFFFF" strokeWidth={3} />
            </CheckmarkContainer>
          )}
          <IconContainer>
            {React.isValidElement(icon)
              ? React.cloneElement(icon as React.ReactElement<any>, {
                  color: iconColor,
                })
              : icon}
          </IconContainer>
          <LabelContainer>
            <BodyText
              fontWeight={tokens.fontWeight.medium}
              color={selected ? '#FFFFFF' : '$text'}
              textAlign="center"
              fontSize={labelFontSize ?? tokens.fontSize.small}
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
    prevProps.selected === nextProps.selected &&
    prevProps.labelFontSize === nextProps.labelFontSize
    // Don't compare icon and onPress as they may be recreated but functionally equivalent
  );
});
