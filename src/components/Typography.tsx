import React from 'react';
import { Text, styled } from '@tamagui/core';
import { TextStyle } from 'react-native';
import { useResponsive } from '../utils/useResponsive';

/**
 * Font family constants for Montserrat weights.
 * Use these to set the correct font variant for the desired weight.
 */
export const FONT_FAMILIES = {
  regular: 'Montserrat_400Regular',
  regular_italic: 'Montserrat_400Regular_Italic',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

// Base styled components with default sizes
const BaseH1 = styled(Text, {
  fontFamily: FONT_FAMILIES.bold,
  fontWeight: "700",
  color: '$text',
});

const BaseH2 = styled(Text, {
  fontFamily: FONT_FAMILIES.bold,
  fontWeight: "700",
  color: '$text',
});

const BaseBodyText = styled(Text, {
  fontFamily: FONT_FAMILIES.regular,
  fontWeight: "400",
  color: '$textSecondary',
});

const BaseLabelText = styled(Text, {
  fontFamily: FONT_FAMILIES.semibold,
  fontWeight: "600",
  color: '$text',
});

const BaseSerifTitle = styled(Text, {
  fontFamily: FONT_FAMILIES.bold,
  fontWeight: "700",
  color: '$text',
});

const BaseSmallText = styled(Text, {
  fontFamily: FONT_FAMILIES.regular,
  fontWeight: "400",
  color: '$textSecondary',
});

// Responsive wrapper components
interface TypographyProps {
  children: React.ReactNode;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
  style?: TextStyle;
  numberOfLines?: number;
  letterSpacing?: number;
  textAlign?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  /**
   * The font family to use. Use FONT_FAMILIES constants for consistency.
   * Example: fontFamily={FONT_FAMILIES.semibold} or fontFamily="Montserrat_600SemiBold"
   */
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
}

/**
 * Responsive H1 component
 * Uses fixed font sizes for phone/tablet
 */
export const H1 = React.memo(({ 
  children, 
  fontSize: customFontSize,
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.h1;
  const lineHeight = customLineHeight ?? typography.lineHeight.h1;
  
  return (
    <BaseH1
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      letterSpacing={0.2}
      {...props}
    >
      {children}
    </BaseH1>
  );
});

H1.displayName = 'H1';

/**
 * Responsive H2 component
 * Uses fixed font sizes for phone/tablet
 */
export const H2 = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.h2;
  const lineHeight = customLineHeight ?? typography.lineHeight.h2;
  
  return (
    <BaseH2
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseH2>
  );
});

H2.displayName = 'H2';

/**
 * Responsive BodyText component
 * Uses fixed font sizes for phone/tablet
 */
export const BodyText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.body;
  const lineHeight = customLineHeight ?? typography.lineHeight.body;
  
  return (
    <BaseBodyText
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseBodyText>
  );
});

BodyText.displayName = 'BodyText';

/**
 * Responsive LabelText component
 * Uses fixed font sizes for phone/tablet
 */
export const LabelText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.label;
  const lineHeight = customLineHeight ?? typography.lineHeight.label;
  
  return (
    <BaseLabelText
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseLabelText>
  );
});

LabelText.displayName = 'LabelText';

/**
 * Responsive SerifTitle component
 * Uses fixed font sizes for phone/tablet
 */
export const SerifTitle = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.h2;
  const lineHeight = customLineHeight ?? typography.lineHeight.h2;
  
  return (
    <BaseSerifTitle
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseSerifTitle>
  );
});

SerifTitle.displayName = 'SerifTitle';

/**
 * Responsive SmallText component
 * Uses fixed font sizes for phone/tablet
 * Use for captions, footnotes, and small UI text
 */
export const SmallText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.small;
  const lineHeight = customLineHeight ?? typography.lineHeight.small;
  
  return (
    <BaseSmallText
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseSmallText>
  );
});

SmallText.displayName = 'SmallText';
