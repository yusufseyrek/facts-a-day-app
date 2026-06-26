import { Pressable, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAudioQueue } from '../../contexts';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { Music } from '../icons';
import { FONT_FAMILIES, Text } from '../Typography';

import { QueueEqualizerIcon } from './QueueEqualizerIcon';

/**
 * Fact-detail queue control. A round glass button that MIRRORS the close button
 * at the opposite top corner — same footprint, translucent disc, and soft shadow
 * (the screen's top-corner grammar) — so the global top-left pill (which would
 * land on the sticky header title) is replaced here by a control that belongs to
 * fact detail. An animated equalizer while playing (a static music glyph when
 * paused) with the queue count badged; opens the full player on tap.
 *
 * The caller (FactModal) owns positioning (absolute top/left, mirroring the
 * close button) and reserves matching title space. Renders nothing when the
 * queue is empty, exactly like the global pill.
 */
export function FactDetailQueueButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const { queue, isPlaying, isLoading } = useAudioQueue();

  if (queue.length === 0) return null;

  const size = iconSizes.xl + spacing.md; // exact CloseButton footprint
  const accent = hexColors[theme].primary;

  return (
    <Pressable
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      aria-label={t('playerOpen')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: theme === 'dark' ? 'rgba(20,24,48,0.7)' : 'rgba(255,255,255,0.75)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {isPlaying || isLoading ? (
        <QueueEqualizerIcon color={accent} size={iconSizes.md} animating />
      ) : (
        <Music size={iconSizes.md} color={accent} />
      )}

      {/* Queue-count badge, pinned to the disc's upper-right like a notification
          dot so the round button still reads as a single tap target. */}
      <View
        style={[
          styles.badge,
          {
            backgroundColor: accent,
            borderColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface,
          },
        ]}
      >
        <Text fontSize={10} fontFamily={FONT_FAMILIES.semibold} color={hexColors[theme].background}>
          {queue.length}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
