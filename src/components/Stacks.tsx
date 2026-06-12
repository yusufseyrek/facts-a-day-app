import React from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  View as RNView,
  ViewProps,
  ViewStyle,
} from 'react-native';

import { useThemeName } from '../theme/ThemeProvider';
import { resolveColorToken } from '../theme/tokens';

/**
 * Local replacements for Tamagui's XStack/YStack/View: plain RN views that
 * accept ViewStyle keys as JSX props (padding={8}, backgroundColor="$surface",
 * gap={4}, ...), resolve `$token` colors against the app theme, and turn into
 * a Pressable when onPress/pressStyle is set. Only the prop surface this
 * codebase actually uses is supported — no animations, media queries, or
 * variants.
 */

export const COLOR_KEYS = new Set([
  'backgroundColor',
  'borderBlockColor',
  'borderBlockEndColor',
  'borderBlockStartColor',
  'borderBottomColor',
  'borderColor',
  'borderEndColor',
  'borderLeftColor',
  'borderRightColor',
  'borderStartColor',
  'borderTopColor',
  'shadowColor',
]);

export const STYLE_KEYS = new Set([
  // Flexbox / layout
  'alignContent',
  'alignItems',
  'alignSelf',
  'aspectRatio',
  'bottom',
  'columnGap',
  'direction',
  'display',
  'end',
  'flex',
  'flexBasis',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'gap',
  'height',
  'inset',
  'justifyContent',
  'left',
  'margin',
  'marginBottom',
  'marginEnd',
  'marginHorizontal',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginTop',
  'marginVertical',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'overflow',
  'padding',
  'paddingBottom',
  'paddingEnd',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingTop',
  'paddingVertical',
  'position',
  'right',
  'rowGap',
  'start',
  'top',
  'width',
  'zIndex',
  // View styles
  'backfaceVisibility',
  'borderBottomEndRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderBottomStartRadius',
  'borderBottomWidth',
  'borderCurve',
  'borderEndWidth',
  'borderLeftWidth',
  'borderRadius',
  'borderRightWidth',
  'borderStartWidth',
  'borderStyle',
  'borderTopEndRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderTopStartRadius',
  'borderTopWidth',
  'borderWidth',
  'elevation',
  'opacity',
  'transform',
  'transformOrigin',
  // Shadow
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  ...COLOR_KEYS,
]);

/** pressStyle accepts ViewStyle plus Tamagui's `scale` shorthand. */
type PressStyle = ViewStyle & { scale?: number };

type PressableExtras = {
  onPress?: (event: GestureResponderEvent) => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  pressStyle?: PressStyle;
};

export type StackProps = Omit<ViewProps, 'style'> &
  Omit<ViewStyle, 'pointerEvents'> &
  PressableExtras & {
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
  };

export type XStackProps = StackProps;
export type YStackProps = StackProps;
export type ViewStackProps = StackProps;

function resolveStyleValue(theme: 'light' | 'dark', key: string, value: unknown): unknown {
  if (COLOR_KEYS.has(key) && typeof value === 'string' && value.startsWith('$')) {
    return resolveColorToken(theme, value);
  }
  return value;
}

function resolvePressStyle(theme: 'light' | 'dark', pressStyle: PressStyle): ViewStyle {
  const { scale, ...rest } = pressStyle;
  const resolved: Record<string, unknown> = {};
  for (const key of Object.keys(rest)) {
    resolved[key] = resolveStyleValue(theme, key, (rest as Record<string, unknown>)[key]);
  }
  if (scale !== undefined) {
    resolved.transform = [{ scale }];
  }
  return resolved as ViewStyle;
}

function createStack(displayName: string, baseStyle?: ViewStyle) {
  function Stack(props: StackProps) {
    const theme = useThemeName();
    const {
      style,
      pressStyle,
      onPress,
      onPressIn,
      onPressOut,
      onLongPress,
      disabled,
      children,
      ...rest
    } = props;

    const styleFromProps: Record<string, unknown> = {};
    const viewProps: Record<string, unknown> = {};
    for (const key of Object.keys(rest)) {
      const value = (rest as Record<string, unknown>)[key];
      if (STYLE_KEYS.has(key)) {
        styleFromProps[key] = resolveStyleValue(theme, key, value);
      } else {
        viewProps[key] = value;
      }
    }

    if (onPress || onPressIn || onPressOut || onLongPress || pressStyle) {
      const pressed = pressStyle ? resolvePressStyle(theme, pressStyle) : undefined;
      return (
        <Pressable
          {...viewProps}
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onLongPress={onLongPress}
          disabled={disabled}
          style={({ pressed: isPressed }) => [
            baseStyle,
            styleFromProps as ViewStyle,
            style,
            isPressed ? pressed : undefined,
          ]}
        >
          {children}
        </Pressable>
      );
    }

    return (
      <RNView {...viewProps} style={[baseStyle, styleFromProps as ViewStyle, style]}>
        {children}
      </RNView>
    );
  }
  Stack.displayName = displayName;
  return Stack;
}

export const View = createStack('View');
export const XStack = createStack('XStack', { flexDirection: 'row' });
export const YStack = createStack('YStack', { flexDirection: 'column' });

/**
 * Minimal stand-in for Tamagui's styled(): binds a static set of default
 * props (including style props) to a stack component. Instance props win.
 */
export function styled<P extends StackProps>(
  Component: React.ComponentType<P>,
  defaults: Partial<P>
): React.ComponentType<P> {
  function Styled(props: P) {
    return <Component {...defaults} {...props} />;
  }
  Styled.displayName = `Styled(${Component.displayName ?? 'Stack'})`;
  return Styled;
}
