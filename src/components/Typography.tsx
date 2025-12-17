import React from 'react';
import { Text, styled } from '@tamagui/core';
import { useWindowDimensions, TextStyle } from 'react-native';
import { tokens } from '../theme/tokens';
import { getResponsiveFontSizes, isTabletDevice } from '../utils/responsive';

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
  fontFamily: 'Montserrat_700Bold',
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
});

const BaseH2 = styled(Text, {
  fontFamily: 'Montserrat_700Bold',
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
});

const BaseBodyText = styled(Text, {
  fontFamily: 'Montserrat_400Regular',
  fontWeight: tokens.fontWeight.regular,
  color: '$textSecondary',
});

const BaseLabelText = styled(Text, {
  fontFamily: 'Montserrat_600SemiBold',
  fontWeight: tokens.fontWeight.medium,
  color: '$text',
});

const BaseSerifTitle = styled(Text, {
  fontFamily: 'Montserrat_700Bold',
  color: '$text',
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
  fontFamily?: string;
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
 * Note: fontWeight is omitted because the weight is already in the Montserrat_700Bold font file.
 * Setting fontWeight with a specific weight font file can cause issues on Android.
 */
export const SerifTitle = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
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
      {...props}
    >
      {children}
    </BaseSerifTitle>
  );
});

SerifTitle.displayName = 'SerifTitle';
