import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@tamagui/lucide-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { hexToRgba } from '../utils/colors';
import { useResponsive } from '../utils/useResponsive';

import { GlassSurface } from './GlassSurface';

/**
 * Circular glass back button (same interactive-glass treatment as the paywall
 * close button): Liquid Glass on capable iOS, frosted blur on older iOS, and
 * a soft elevated surface circle on Android.
 */
export function GlassBackButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { iconSizes, spacing } = useResponsive();
  const isDark = theme === 'dark';
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const colors = hexColors[theme];

  const size = iconSizes.xl + spacing.md;
  const inner = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-label={t('goBack')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [styles.shadow, { opacity: pressed ? 0.7 : 1 }]}
    >
      {useGlass ? (
        <GlassSurface
          variant="glass"
          isDark={isDark}
          tint={colors.surface}
          glassTint={hexToRgba(colors.surface, isDark ? 0.5 : 0.55)}
          isInteractive
          borderRadius={size / 2}
          style={inner}
        >
          <ChevronLeft size={iconSizes.md} color={colors.text} />
        </GlassSurface>
      ) : (
        <View style={[inner, { backgroundColor: colors.surface }]}>
          <ChevronLeft size={iconSizes.md} color={colors.text} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    alignSelf: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
});
