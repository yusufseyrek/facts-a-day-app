import { createTamagui, createTokens } from '@tamagui/core';
import { tokens } from './tokens';

const tamaguiTokens = createTokens({
  color: {
    // Light theme colors
    lightPrimary: tokens.color.light.primary,
    lightPrimaryLight: tokens.color.light.primaryLight,
    lightNeutral: tokens.color.light.neutral,
    lightNeutralLight: tokens.color.light.neutralLight,
    lightBackground: tokens.color.light.background,
    lightSurface: tokens.color.light.surface,
    lightCardBackground: tokens.color.light.cardBackground,
    lightText: tokens.color.light.text,
    lightTextSecondary: tokens.color.light.textSecondary,
    lightBorder: tokens.color.light.border,

    // Dark theme colors
    darkPrimary: tokens.color.dark.primary,
    darkPrimaryLight: tokens.color.dark.primaryLight,
    darkNeutral: tokens.color.dark.neutral,
    darkNeutralLight: tokens.color.dark.neutralLight,
    darkBackground: tokens.color.dark.background,
    darkSurface: tokens.color.dark.surface,
    darkCardBackground: tokens.color.dark.cardBackground,
    darkText: tokens.color.dark.text,
    darkTextSecondary: tokens.color.dark.textSecondary,
    darkBorder: tokens.color.dark.border,

    // Design system specific colors
    primary: tokens.color.light.primary,
    neutral: tokens.color.light.neutral,
  },
  space: {
    xs: tokens.space.xs,
    sm: tokens.space.sm,
    md: tokens.space.md,
    lg: tokens.space.lg,
    xl: tokens.space.xl,
    xxl: tokens.space.xxl,
  },
  size: {
    buttonHeight: tokens.size.buttonHeight,
    topicCard: tokens.size.topicCardSize,
    colorSwatch: tokens.size.colorSwatchSize,
    toggle: tokens.size.toggleSize,
  },
  radius: {
    sm: tokens.radius.sm,
    md: tokens.radius.md,
    lg: tokens.radius.lg,
    xl: tokens.radius.xl,
    full: tokens.radius.full,
  },
  zIndex: {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
  },
});

const lightTheme = {
  primary: tokens.color.light.primary,
  primaryLight: tokens.color.light.primaryLight,
  neutral: tokens.color.light.neutral,
  neutralLight: tokens.color.light.neutralLight,
  background: tokens.color.light.background,
  surface: tokens.color.light.surface,
  cardBackground: tokens.color.light.cardBackground,
  text: tokens.color.light.text,
  textSecondary: tokens.color.light.textSecondary,
  border: tokens.color.light.border,
};

const darkTheme = {
  primary: tokens.color.dark.primary,
  primaryLight: tokens.color.dark.primaryLight,
  neutral: tokens.color.dark.neutral,
  neutralLight: tokens.color.dark.neutralLight,
  background: tokens.color.dark.background,
  surface: tokens.color.dark.surface,
  cardBackground: tokens.color.dark.cardBackground,
  text: tokens.color.dark.text,
  textSecondary: tokens.color.dark.textSecondary,
  border: tokens.color.dark.border,
};

export const config = createTamagui({
  tokens: tamaguiTokens,
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  media: {
    xs: { maxWidth: 660 },
    sm: { maxWidth: 800 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
    xxl: { maxWidth: 1600 },
    gtXs: { minWidth: 660 + 1 },
    gtSm: { minWidth: 800 + 1 },
    gtMd: { minWidth: 1020 + 1 },
    gtLg: { minWidth: 1280 + 1 },
    short: { maxHeight: 820 },
    tall: { minHeight: 820 },
    hoverNone: { hover: 'none' },
    pointerCoarse: { pointer: 'coarse' },
  },
  shorthands: {
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    bc: 'backgroundColor',
    br: 'borderRadius',
    bw: 'borderWidth',
    col: 'color',
    f: 'flex',
    m: 'margin',
    w: 'width',
    h: 'height',
  } as const,
});

export type AppConfig = typeof config;

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}
