import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useResponsive } from '../utils/useResponsive';

/**
 * True when iOS presents form sheets as FLOATING cards detached from the
 * screen edge (iOS 26 Liquid Glass). Pre-26 iOS and Android dock the sheet
 * flush to the bottom of the screen.
 *
 * Floating sheets are clipped by UIKit on all four corners with an automatic
 * radius concentric to the display — but ONLY while `sheetCornerRadius` is
 * left unset (see the form-sheet routes in app/_layout.tsx).
 */
export function formSheetFloats(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable();
}

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
  return formSheetFloats() ? spacing.lg : Math.max(insets.bottom, spacing.md) + spacing.md;
}
