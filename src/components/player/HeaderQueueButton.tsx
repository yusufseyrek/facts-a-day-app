/**
 * Compact queue-player control. A single instance floats at the top-left across
 * every screen (mounted once in PersistentMiniPlayer above the root navigator),
 * so playback is reachable wherever audio is active without cloning per screen.
 * A small rounded pill with two tap targets separated by a hairline: a filled
 * play/pause disc that toggles playback inline, and the equalizer/glyph + queue
 * count that opens the full player sheet. The equalizer bounces while playing (a
 * static music glyph when paused). Renders nothing when the queue is empty.
 */
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAudioQueue } from '../../contexts';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { Music, Pause, Play } from '../icons';
import { FONT_FAMILIES, Text } from '../Typography';

import { QueueEqualizerIcon } from './QueueEqualizerIcon';

export function HeaderQueueButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const { queue, isPlaying, isLoading, togglePlayPause } = useAudioQueue();

  const accent = colors.primary;

  // Only shown while there's a queue — there's nothing to control otherwise.
  if (queue.length === 0) return null;

  const playSize = iconSizes.lg;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: colors.cardBackground,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 5,
        paddingLeft: 4,
        paddingRight: spacing.sm,
        // Soft neutral shadow so the floating pill reads as elevated above the
        // scrolling content/header beneath it.
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      {/* Inline play/pause — a filled accent disc, matching the full player's
          primary control. Vertical-biased hitSlop grows the touch target toward
          the toolbar height without overlapping the adjacent open zone. */}
      <Pressable
        onPress={togglePlayPause}
        hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.xs, right: spacing.xs }}
        accessibilityRole="button"
        aria-label={isPlaying ? t('playerPause') : t('playerPlay')}
        style={({ pressed }) => ({
          width: playSize,
          height: playSize,
          borderRadius: playSize / 2,
          backgroundColor: accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {isLoading ? (
          <QueueEqualizerIcon color={colors.background} size={iconSizes.xs - 2} animating />
        ) : isPlaying ? (
          <Pause size={iconSizes.xs - 2} color={colors.background} fill={colors.background} />
        ) : (
          <Play size={iconSizes.xs - 2} color={colors.background} fill={colors.background} />
        )}
      </Pressable>

      {/* Hairline divider signalling the two distinct tap zones. */}
      <View style={{ width: 1, height: iconSizes.sm, backgroundColor: colors.border }} />

      {/* Equalizer/glyph + count — opens the full player sheet. */}
      <Pressable
        onPress={() => router.push('/player')}
        hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.xs, right: spacing.xs }}
        accessibilityRole="button"
        aria-label={t('playerOpen')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {isPlaying ? (
          <QueueEqualizerIcon color={accent} size={iconSizes.sm} animating />
        ) : (
          <Music size={iconSizes.sm} color={accent} />
        )}
        <Text.Label fontFamily={FONT_FAMILIES.semibold} color={accent}>
          {queue.length}
        </Text.Label>
      </Pressable>
    </View>
  );
}
