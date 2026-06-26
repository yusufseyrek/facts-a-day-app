import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import * as Haptics from 'expo-haptics';

import { usePremium } from '../contexts';
import { useTranslation } from '../i18n';
import { getIsConnected } from '../services/network';
import {
  isFactSavedOfflineSync,
  removeFactFromOffline,
  saveFactToOffline,
  subscribeOfflineIndex,
} from '../services/offlineLibrary';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { CheckCircle, Download } from './icons';

interface OfflineSaveButtonProps {
  factId: number;
  /**
   * 'overlay' (default) — a dark translucent circle for use over a card image.
   * 'plain' — a bordered surface circle with themed glyphs, for content areas
   * like the fact-detail title row where there is no image behind it.
   */
  variant?: 'overlay' | 'plain';
}

/**
 * Control that pins a single fact for offline reading/listening. Premium only —
 * hidden for everyone else. The saved state IS the "downloaded" remark: a cyan
 * check once the fact lives in the offline library, a download glyph otherwise,
 * and a spinner while the media downloads. It reads its own state from the
 * offline index (useSyncExternalStore) so it flips the moment a fact is
 * saved/removed anywhere, without the host re-rendering.
 */
const OfflineSaveButtonComponent = ({ factId, variant = 'overlay' }: OfflineSaveButtonProps) => {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { isPremium } = usePremium();
  const { iconSizes, spacing } = useResponsive();
  const colors = hexColors[theme];

  const saved = React.useSyncExternalStore(
    subscribeOfflineIndex,
    () => isFactSavedOfflineSync(factId),
    () => isFactSavedOfflineSync(factId)
  );

  const [busy, setBusy] = useState(false);

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (saved) {
      setBusy(true);
      try {
        await removeFactFromOffline(factId);
      } catch {
        // Local delete; a failure leaves the badge as-is, nothing else to do.
      } finally {
        setBusy(false);
      }
      return;
    }

    // Saving needs to fetch the fact + download its media.
    if (!getIsConnected()) {
      Alert.alert(t('offlineLibrary'), t('offlineNeedsConnection'));
      return;
    }
    setBusy(true);
    try {
      await saveFactToOffline(factId, locale);
      // Pop the check in once the download lands.
      scale.value = withSequence(
        withTiming(0.8, { duration: 80 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
    } catch {
      Alert.alert(t('offlineLibrary'), t('offlineSaveError'));
    } finally {
      setBusy(false);
    }
  }, [busy, saved, factId, locale, t, scale]);

  // Premium gate: the offline library is a premium feature, so free users never
  // see the control (they reach it through the Settings paywall instead).
  if (!isPremium) return null;

  const plain = variant === 'plain';
  const iconSize = plain ? iconSizes.md : iconSizes.sm;
  const containerSize = iconSize + spacing.sm;
  const downloadColor = plain ? colors.textSecondary : '#FFFFFF';
  const spinnerColor = plain ? colors.textSecondary : '#FFFFFF';
  const iconStyle = plain ? undefined : styles.iconShadow;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      role="button"
      aria-label={saved ? t('offlineSavedFact') : t('offlineSaveFact')}
      style={({ pressed }) => ({
        width: containerSize,
        height: containerSize,
        borderRadius: containerSize / 2,
        backgroundColor: plain ? colors.cardBackground : 'rgba(0, 0, 0, 0.35)',
        borderWidth: plain ? 1 : 0,
        borderColor: plain ? colors.border : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <Animated.View style={animatedStyle}>
          {saved ? (
            <CheckCircle size={iconSize} color={colors.neonCyan} style={iconStyle} />
          ) : (
            <Download size={iconSize} color={downloadColor} style={iconStyle} />
          )}
        </Animated.View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  iconShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
});

export const OfflineSaveButton = React.memo(OfflineSaveButtonComponent);
