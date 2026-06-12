import React from 'react';
import {
  Platform,
  StyleProp,
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';

import { useThemeName } from '../theme/ThemeProvider';
import { resolveColorToken } from '../theme/tokens';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER, maxFontSizeMultipliers } from '../utils/responsive';
import { useResponsive } from '../utils/useResponsive';

import { COLOR_KEYS, STYLE_KEYS } from './Stacks';

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
  extrabold: 'Montserrat_800ExtraBold',
} as const;

/**
 * Typography preset names
 */
export type TextPreset =
  | 'hero'
  | 'display'
  | 'headline'
  | 'title'
  | 'body'
  | 'label'
  | 'caption'
  | 'tiny';

/**
 * Preset style configurations
 */
const PRESETS: Record<
  TextPreset,
  {
    fontFamily: string;
    fontWeight: string;
    color: string;
    letterSpacing?: number;
  }
> = {
  hero: { fontFamily: FONT_FAMILIES.bold, fontWeight: '700', color: '$text' },
  display: {
    fontFamily: FONT_FAMILIES.bold,
    fontWeight: '700',
    color: '$text',
  },
  headline: {
    fontFamily: FONT_FAMILIES.bold,
    fontWeight: '700',
    color: '$text',
    letterSpacing: 0.2,
  },
  title: { fontFamily: FONT_FAMILIES.bold, fontWeight: '700', color: '$text' },
  body: {
    fontFamily: FONT_FAMILIES.regular,
    fontWeight: '400',
    color: '$textSecondary',
  },
  label: {
    fontFamily: FONT_FAMILIES.semibold,
    fontWeight: '600',
    color: '$text',
  },
  caption: {
    fontFamily: FONT_FAMILIES.regular,
    fontWeight: '400',
    color: '$textSecondary',
  },
  tiny: {
    fontFamily: FONT_FAMILIES.regular,
    fontWeight: '400',
    color: '$textSecondary',
  },
} as const;

/** TextStyle keys accepted as JSX props (the Tamagui style-props convention). */
const TEXT_STYLE_KEYS = new Set([
  ...STYLE_KEYS,
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'includeFontPadding',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textAlignVertical',
  'textDecorationColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textTransform',
  'userSelect',
  'verticalAlign',
  'writingDirection',
]);

const TEXT_COLOR_KEYS = new Set([...COLOR_KEYS, 'color', 'textDecorationColor', 'textShadowColor']);

/**
 * Props for the Text component: RN Text props plus TextStyle keys as direct
 * JSX props, with `$token` color support.
 */
export interface TextProps extends Omit<RNTextProps, 'style'>, Omit<TextStyle, 'fontWeight'> {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  preset?: TextPreset;
  fontWeight?: TextStyle['fontWeight'] | string;
  maxFontSizeMultiplier?: number;
}

/**
 * Base Text component with optional preset support
 *
 * Usage:
 * - With preset: <Text preset="body">Content</Text>
 * - With compound: <Text.Body>Content</Text.Body>
 * - Custom: <Text fontSize={18}>Custom</Text>
 * - Override preset: <Text.Body color="$primary">Colored body</Text.Body>
 */
const TextBase = React.memo(
  ({
    children,
    preset,
    fontSize: customFontSize,
    lineHeight: customLineHeight,
    letterSpacing: customLetterSpacing,
    fontFamily: customFontFamily,
    fontWeight: customFontWeight,
    color: customColor,
    maxFontSizeMultiplier: customMaxFontSizeMultiplier,
    style,
    ...props
  }: TextProps) => {
    const { typography } = useResponsive();
    const theme = useThemeName();

    // Get preset styles if preset is provided
    const presetStyles = preset ? PRESETS[preset] : null;

    // Compute responsive fontSize and lineHeight based on preset
    const responsiveFontSize = preset ? typography.fontSize[preset] : undefined;
    const responsiveLineHeight = preset ? typography.lineHeight[preset] : undefined;
    const responsiveLetterSpacing = preset ? typography.letterSpacing[preset] : undefined;

    // Props override preset values
    const fontSize = customFontSize ?? responsiveFontSize;
    const lineHeight = customLineHeight ?? responsiveLineHeight;
    const letterSpacing =
      customLetterSpacing ?? presetStyles?.letterSpacing ?? responsiveLetterSpacing;
    const fontFamily = customFontFamily ?? presetStyles?.fontFamily;
    // On Android, setting fontWeight alongside a custom fontFamily causes the
    // system to ignore the custom font. The weight is already encoded in the
    // font file name (e.g. Montserrat_700Bold), so we skip fontWeight there.
    const fontWeight =
      Platform.OS === 'android' && fontFamily
        ? undefined
        : (customFontWeight ?? presetStyles?.fontWeight);
    const rawColor = (customColor as string | undefined) ?? presetStyles?.color;
    const color = rawColor === undefined ? undefined : resolveColorToken(theme, rawColor);
    const resolvedMaxFontSizeMultiplier =
      customMaxFontSizeMultiplier ??
      (preset ? maxFontSizeMultipliers[preset] : DEFAULT_MAX_FONT_SIZE_MULTIPLIER);

    // Partition remaining props into style keys vs RN Text props
    const styleFromProps: Record<string, unknown> = {};
    const textProps: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      const value = (props as Record<string, unknown>)[key];
      if (TEXT_STYLE_KEYS.has(key)) {
        styleFromProps[key] =
          TEXT_COLOR_KEYS.has(key) && typeof value === 'string' && value.startsWith('$')
            ? resolveColorToken(theme, value)
            : value;
      } else {
        textProps[key] = value;
      }
    }

    return (
      <RNText
        maxFontSizeMultiplier={resolvedMaxFontSizeMultiplier}
        {...textProps}
        style={[
          {
            userSelect: 'text',
            fontSize,
            lineHeight,
            letterSpacing,
            fontFamily,
            fontWeight: fontWeight as TextStyle['fontWeight'],
            color,
            // Fix for cut words
            paddingHorizontal: 1,
          },
          styleFromProps as TextStyle,
          style,
        ]}
      >
        {children}
      </RNText>
    );
  }
);

TextBase.displayName = 'Text';

/**
 * Props for preset variant components (no preset prop needed)
 */
type PresetTextProps = Omit<TextProps, 'preset'>;

/**
 * Create a preset variant component
 */
const createPresetComponent = (preset: TextPreset, displayName: string) => {
  const Component = React.memo((props: PresetTextProps) => <TextBase preset={preset} {...props} />);
  Component.displayName = displayName;
  return Component;
};

/**
 * Text component with preset variants
 *
 * Variants (use responsive typography):
 * - Text.Hero: 48px phone, 72px tablet - Hero sections, splash screens
 * - Text.Display: 32px phone, 48px tablet - Large display numbers
 * - Text.Headline: 24px phone, 36px tablet - Main headings
 * - Text.Title: 20px phone, 30px tablet - Section titles
 * - Text.Body: 17px phone, 25px tablet - Main content
 * - Text.Label: 14px phone, 21px tablet - Form labels, buttons
 * - Text.Caption: 12px phone, 18px tablet - Captions, footnotes
 * - Text.Tiny: 11px phone, 16px tablet - Very small text
 *
 * All variants accept the same props and allow overriding any preset value.
 *
 * @example
 * // Using preset variants
 * <Text.Body>Regular body text</Text.Body>
 * <Text.Headline color="$primary">Colored headline</Text.Headline>
 *
 * // Using base component with preset prop
 * <Text preset="body">Same as Text.Body</Text>
 *
 * // Fully custom (no preset)
 * <Text fontSize={22} fontFamily={FONT_FAMILIES.bold}>Custom text</Text>
 */
export const Text = Object.assign(TextBase, {
  Hero: createPresetComponent('hero', 'Text.Hero'),
  Display: createPresetComponent('display', 'Text.Display'),
  Headline: createPresetComponent('headline', 'Text.Headline'),
  Title: createPresetComponent('title', 'Text.Title'),
  Body: createPresetComponent('body', 'Text.Body'),
  Label: createPresetComponent('label', 'Text.Label'),
  Caption: createPresetComponent('caption', 'Text.Caption'),
  Tiny: createPresetComponent('tiny', 'Text.Tiny'),
});

// Export type for the compound component
export type TextComponent = typeof Text;
