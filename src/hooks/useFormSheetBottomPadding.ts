import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useResponsive } from '../utils/useResponsive';

/**
 * Bottom padding for `fitToContents` form sheets (remove-ads, hint-store).
 *
 * On iOS 26 the form sheet FLOATS detached from the screen edge and never
 * overlaps the home indicator, but useSafeAreaInsets inside it still reports
 * the window's bottom inset (34pt) — padding by it again lands in the
 * measured content height and shows up as a dead band at the sheet's bottom.
 * Pre-26 iOS and Android anchor the sheet to the screen edge, where the
 * inset is real and must be respected.
 */
export function useFormSheetBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const { spacing } = useResponsive();
  const sheetFloats = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return sheetFloats ? spacing.lg : Math.max(insets.bottom, spacing.md) + spacing.md;
}
