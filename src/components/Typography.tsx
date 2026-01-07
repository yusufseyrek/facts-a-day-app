import React from 'react';
import { Text, styled, GetProps } from '@tamagui/core';
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

const BaseTinyText = styled(Text, {
  fontFamily: FONT_FAMILIES.regular,
  fontWeight: "400",
  color: '$textSecondary',
});

const BaseDisplayText = styled(Text, {
  fontFamily: FONT_FAMILIES.bold,
  fontWeight: "700",
  color: '$text',
});

const BaseHeroText = styled(Text, {
  fontFamily: FONT_FAMILIES.bold,
  fontWeight: "700",
  color: '$text',
});

// Get the base props from Tamagui Text and extend with our custom props
type BaseTextProps = GetProps<typeof Text>;

// Responsive wrapper components - extends all Tamagui Text props
export interface TypographyProps extends Omit<BaseTextProps, 'style'> {
  children: React.ReactNode;
  style?: TextStyle;
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
  const fontSize = customFontSize ?? typography.fontSize.headline;
  const lineHeight = customLineHeight ?? typography.lineHeight.headline;
  
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
  const fontSize = customFontSize ?? typography.fontSize.title;
  const lineHeight = customLineHeight ?? typography.lineHeight.title;
  
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
  const fontSize = customFontSize ?? typography.fontSize.body;
  const lineHeight = customLineHeight ?? typography.lineHeight.body;
  
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
  const fontSize = customFontSize ?? typography.fontSize.title;
  const lineHeight = customLineHeight ?? typography.lineHeight.title;
  
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
  const fontSize = customFontSize ?? typography.fontSize.caption;
  const lineHeight = customLineHeight ?? typography.lineHeight.caption;
  
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

/**
 * Responsive TinyText component
 * Uses fixed font sizes for phone/tablet
 * Use for very small labels, footnotes, and micro UI text
 */
export const TinyText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.tiny;
  const lineHeight = customLineHeight ?? typography.lineHeight.tiny;
  
  return (
    <BaseTinyText
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseTinyText>
  );
});

TinyText.displayName = 'TinyText';

/**
 * Responsive DisplayText component
 * Uses fixed font sizes for phone/tablet
 * Use for large display numbers and prominent text
 */
export const DisplayText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.display;
  const lineHeight = customLineHeight ?? typography.lineHeight.display;
  
  return (
    <BaseDisplayText
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseDisplayText>
  );
});

DisplayText.displayName = 'DisplayText';

/**
 * Responsive HeroText component
 * Uses fixed font sizes for phone/tablet
 * Use for hero sections, splash screens, and very large headings
 */
export const HeroText = React.memo(({ 
  children, 
  fontSize: customFontSize, 
  lineHeight: customLineHeight,
  style,
  fontFamily,
  ...props 
}: TypographyProps) => {
  const { typography } = useResponsive();
  const fontSize = customFontSize ?? typography.fontSize.hero;
  const lineHeight = customLineHeight ?? typography.lineHeight.hero;
  
  return (
    <BaseHeroText
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={style}
      fontFamily={fontFamily}
      {...props}
    >
      {children}
    </BaseHeroText>
  );
});

HeroText.displayName = 'HeroText';
