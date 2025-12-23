import React from 'react';
import { Text, styled } from '@tamagui/core';
import { useWindowDimensions, TextStyle } from 'react-native';
import { tokens } from '../theme/tokens';
import { getResponsiveFontSizes, isTabletDevice } from '../utils/responsive';

/**
 * Font family constants for Montserrat weights.
 * Use these to set the correct font variant for the desired weight.
 */
export const FONT_FAMILIES = {
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
  extrabold: 'Montserrat_800ExtraBold',
  black: 'Montserrat_900Black',
  regular_italic: 'Montserrat_400Regular_Italic',
} as const;

/**
 * Get responsive font sizes based on current screen width
 * This is used by styled components that need dynamic sizing
 */
const useTypographySize = () => {
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const fontSizes = getResponsiveFontSizes(width);
  return { fontSizes, isTablet, width };
};

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
 * Automatically scales font size based on screen width
 */
export const H1 = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { fontSizes } = useTypographySize();
  const fontSize = customFontSize ?? fontSizes.h1;
  const lineHeight = customLineHeight ?? Math.round(fontSize * 1.25);
  
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
 * Automatically scales font size based on screen width
 */
export const H2 = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { fontSizes } = useTypographySize();
  const fontSize = customFontSize ?? fontSizes.h2;
  const lineHeight = customLineHeight ?? Math.round(fontSize * 1.25);
  
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
 * Automatically scales font size based on screen width
 */
export const BodyText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { fontSizes } = useTypographySize();
  const fontSize = customFontSize ?? fontSizes.body;
  const lineHeight = customLineHeight ?? Math.round(fontSize * 1.6);
  
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
 * Automatically scales font size based on screen width
 */
export const LabelText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { fontSizes } = useTypographySize();
  const fontSize = customFontSize ?? fontSizes.label;
  const lineHeight = customLineHeight ?? Math.round(fontSize * 1.4);
  
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
 * Automatically scales font size based on screen width
 */
export const SerifTitle = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { fontSizes } = useTypographySize();
  const fontSize = customFontSize ?? fontSizes.h2;
  const lineHeight = customLineHeight ?? Math.round(fontSize * 1.35);
  
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
 * Automatically scales font size based on screen width
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
  const { fontSizes } = useTypographySize();
  const fontSize = customFontSize ?? fontSizes.small;
  const lineHeight = customLineHeight ?? Math.round(fontSize * 1.4);
  
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
