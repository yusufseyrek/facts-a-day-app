/**
 * Full queue-player surface (hosted by app/player.tsx as a form sheet). A single
 * full-height ScrollView holds the now-playing artwork + metadata, a seekable
 * progress bar, transport controls, a labelled background-play toggle, and the
 * "Up Next" queue as a list of compact fact cards.
 *
 * Layout note: an iOS-only zero-size decoy ScrollView absorbs the native form
 * sheet's first-descendant-scroll-view hook (which otherwise resets the real
 * content view's frame and blanks it on cold present). The header is a flow
 * sibling above the real content ScrollView.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { LAYOUT, NATIVE_ADS } from '../../config/app';
import {
  type QueueTrack,
  useAudioQueue,
  usePlaybackProgress,
  usePremium,
} from '../../contexts';
import { useAdForSlot } from '../../hooks/useAdForSlot';
import { useAudioSettings } from '../../hooks/useAudioSettings';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { NativeAdCard } from '../ads';
import { GlassSurface } from '../GlassSurface';
import { Crown, ListX, Moon, Music, Pause, Play, SkipBack, SkipForward, X } from '../icons';
import { Text } from '../Typography';

import { QueueEqualizerIcon } from './QueueEqualizerIcon';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SeekBar({
  accent,
  track,
  onSeek,
}: {
  accent: string;
  track: string;
  onSeek: (seconds: number) => void;
}) {
  const { position, duration } = usePlaybackProgress();
  const { spacing } = useResponsive();
  const { t } = useTranslation();
  const colors = hexColors[useTheme().theme];

  // Refs keep the pan handlers (created once) reading live values without stale
  // closures; `scrub` (a 0..1 fraction) drives the UI only while dragging.
  const widthRef = useRef(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const scrubRef = useRef<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  const fractionFromX = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return 0;
    return Math.min(1, Math.max(0, x / w));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const f = fractionFromX(e.nativeEvent.locationX);
        scrubRef.current = f;
        setScrub(f);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const f = fractionFromX(e.nativeEvent.locationX);
        scrubRef.current = f;
        setScrub(f);
      },
      onPanResponderRelease: () => {
        const f = scrubRef.current;
        if (f != null && durationRef.current > 0) onSeekRef.current(f * durationRef.current);
        scrubRef.current = null;
        setScrub(null);
      },
      onPanResponderTerminate: () => {
        scrubRef.current = null;
        setScrub(null);
      },
    })
  ).current;

  const isScrubbing = scrub != null;
  const livePct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const pct = isScrubbing ? scrub! : livePct;
  const displayPos = isScrubbing ? scrub! * duration : position;
  const barHeight = isScrubbing ? 6 : 4;
  const thumbSize = isScrubbing ? 16 : 12;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  // VoiceOver/TalkBack: expose the bar as an adjustable, stepping ±10s.
  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (durationRef.current <= 0) return;
      const delta = event.nativeEvent.actionName === 'increment' ? 10 : -10;
      onSeekRef.current(Math.min(durationRef.current, Math.max(0, position + delta)));
    },
    [position]
  );

  return (
    <View>
      <View
        {...panResponder.panHandlers}
        onLayout={onLayout}
        style={{ paddingVertical: spacing.sm, justifyContent: 'center' }}
        accessible
        accessibilityRole="adjustable"
        aria-label={t('playerNowPlaying')}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
      >
        {/* Track + thumb live in one relative box so the thumb centers on the
            track via an exact integer offset. Centering off the container with
            `top: '50%'` rounds the absolute thumb independently of the
            flexbox-centered track, so a fractional (screen-scaled) spacing.sm
            drifts the dot a sub-pixel off the line. */}
        <View>
          <View
            style={{
              height: barHeight,
              borderRadius: barHeight / 2,
              backgroundColor: track,
              overflow: 'hidden',
            }}
          >
            <View style={{ height: barHeight, width: `${pct * 100}%`, backgroundColor: accent }} />
          </View>
          {/* Thumb grows slightly while scrubbing for a tactile feel. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: (barHeight - thumbSize) / 2,
              left: `${pct * 100}%`,
              marginLeft: -thumbSize / 2,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              backgroundColor: accent,
            }}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text.Caption color={colors.textSecondary}>{formatTime(displayPos)}</Text.Caption>
        <Text.Caption color={colors.textSecondary}>{formatTime(duration)}</Text.Caption>
      </View>
    </View>
  );
}

/**
 * Background-play control as a labelled row (replaces the old lone Moon glyph in
 * the header, which gave no hint what it did). Shows an icon, a title, an
 * explanatory subtitle, and a real on/off switch — premium-gated, so non-premium
 * taps route to the paywall and the switch becomes an "Unlock" affordance.
 */
function BackgroundPlayRow() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = hexColors[theme];
  const { isPremium } = usePremium();
  const { settings, setAudioSetting } = useAudioSettings();

  const accent = colors.primary;
  const on = isPremium && settings.playInBackground;

  const switchH = iconSizes.xs + spacing.md; // ~28
  const switchW = switchH + spacing.xl; // ~48
  const knob = switchH - spacing.xs - 2;
  const travel = switchW - knob - 6;

  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(on ? 1 : 0, { duration: 180 });
  }, [on, p]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [colors.border, accent]),
  }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * travel }] }));

  const handlePress = useCallback(() => {
    if (!isPremium) {
      router.push('/paywall');
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setAudioSetting('playInBackground', !settings.playInBackground);
  }, [isPremium, router, setAudioSetting, settings.playInBackground]);

  const subtitle = !isPremium
    ? t('playerBackgroundPremium')
    : on
      ? t('playerBackgroundOn')
      : t('playerBackgroundOff');

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole={isPremium ? 'switch' : 'button'}
      accessibilityState={isPremium ? { checked: on } : undefined}
      aria-label={t('playerBackgroundPlay')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.cardBackground,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: iconSizes.xl,
          height: iconSizes.xl,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? accent : colors.background,
        }}
      >
        {/* Outline glyph at a FIXED size in both states — the active cue is the
            tile turning accent, not the moon changing weight. Toggling `fill`
            made the filled crescent read heavier (a perceived size jump). */}
        <Moon size={iconSizes.sm} color={on ? colors.background : colors.textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text.Label color={colors.text}>{t('playerBackgroundPlay')}</Text.Label>
        {/* Reserve two caption lines so swapping the on/off/premium subtitle
            (different lengths) never reflows the row height. */}
        <Text.Caption
          color={colors.textSecondary}
          numberOfLines={2}
          style={{ minHeight: typography.lineHeight.caption * 2 }}
        >
          {subtitle}
        </Text.Caption>
      </View>
      {isPremium ? (
        <Animated.View
          style={[
            { width: switchW, height: switchH, borderRadius: switchH / 2, padding: 3, justifyContent: 'center' },
            trackStyle,
          ]}
        >
          <Animated.View
            style={[
              { width: knob, height: knob, borderRadius: knob / 2, backgroundColor: '#fff' },
              knobStyle,
            ]}
          />
        </Animated.View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Crown size={iconSizes.sm} color="#FFD700" />
          <Text.Caption color={accent}>{t('playerUnlock')}</Text.Caption>
        </View>
      )}
    </Pressable>
  );
}

/**
 * One row of the Up Next list, rendered as a compact fact card: artwork
 * thumbnail + title + category. Flat (no shadow/glow) — the current track is
 * marked only by a soft accent tint and an animated equalizer over its thumb.
 */
function QueueCard({
  item,
  isCurrent,
  isPlaying,
  onPress,
  onRemove,
}: {
  item: QueueTrack;
  isCurrent: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const accent = colors.primary;
  const thumb = iconSizes.xxl + spacing.sm;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isCurrent }}
      aria-label={`${item.title}${isCurrent ? `, ${t('playerNowPlaying')}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: isCurrent ? `${accent}1A` : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: thumb,
          height: thumb,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: theme === 'dark' ? colors.surface : colors.neutralLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Music size={iconSizes.md} color={accent} />
        )}
        {isCurrent && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          >
            <QueueEqualizerIcon color="#fff" size={iconSizes.sm} animating={isPlaying} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text.Label numberOfLines={2} color={isCurrent ? accent : colors.text}>
          {item.title}
        </Text.Label>
        {!!item.category && (
          <Text.Caption numberOfLines={1} color={colors.textSecondary}>
            {item.category}
          </Text.Caption>
        )}
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={spacing.sm}
        accessibilityRole="button"
        aria-label={t('playerRemoveFromQueue')}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
      >
        <X size={iconSizes.sm} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

/**
 * Horizontal artwork carousel — one page per queued fact. Swiping pages jumps
 * to that track (and playback follows); changing track elsewhere (transport
 * buttons, queue taps) scrolls the carousel back into sync. Page dots below.
 */
function ArtworkCarousel({
  queue,
  currentIndex,
  onSelect,
  onOpenFact,
  artworkSize,
}: {
  queue: QueueTrack[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onOpenFact: (factId: number) => void;
  artworkSize: number;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes, screenWidth } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const accent = colors.primary;

  const scrollRef = useRef<ScrollView>(null);
  // Seed with an estimate so the first frame is positioned; onLayout corrects it.
  const [pageW, setPageW] = useState(Math.max(1, screenWidth - spacing.lg * 2));

  // Re-sync when the active track changes from OUTSIDE the carousel (transport
  // buttons / queue taps). Our own swipe lands on the same page, so this is a
  // no-op for that path.
  useEffect(() => {
    if (pageW > 0 && currentIndex >= 0) {
      scrollRef.current?.scrollTo({ x: currentIndex * pageW, animated: true });
    }
  }, [currentIndex, pageW]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setPageW(w);
  }, []);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageW <= 0) return;
      const page = Math.round(e.nativeEvent.contentOffset.x / pageW);
      if (page !== currentIndex && page >= 0 && page < queue.length) onSelect(page);
    },
    [pageW, currentIndex, queue.length, onSelect]
  );

  return (
    <View style={{ marginVertical: spacing.lg }} onLayout={onLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        contentOffset={{ x: Math.max(0, currentIndex) * pageW, y: 0 }}
      >
        {queue.map((item, i) => (
          <View key={`${item.factId}-${i}`} style={{ width: pageW, alignItems: 'center' }}>
            {/* Tapping the artwork opens that fact's detail. Inside a horizontal
                paging ScrollView a swipe is claimed by the scroll responder, so
                only a clean tap fires onPress — the carousel still pages. Shadow
                on this outer wrapper so it isn't clipped by overflow:hidden. */}
            <Pressable
              onPress={() => onOpenFact(item.factId)}
              accessibilityRole="button"
              aria-label={`${item.title}, ${t('a11y_viewFactButton')}`}
              style={({ pressed }) => ({
                borderRadius: radius.lg,
                backgroundColor: isDark ? colors.surface : colors.cardBackground,
                shadowColor: '#000',
                shadowOpacity: isDark ? 0.4 : 0.16,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View
                style={{
                  width: artworkSize,
                  height: artworkSize,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  backgroundColor: isDark ? colors.surface : colors.neutralLight,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Music size={iconSizes.xxl} color={accent} />
                )}
              </View>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {queue.length > 1 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: spacing.xs,
            marginTop: spacing.md,
          }}
        >
          {queue.map((item, i) => (
            <View
              key={`dot-${item.factId}-${i}`}
              style={{
                width: i === currentIndex ? spacing.sm : spacing.xs,
                height: spacing.xs,
                borderRadius: spacing.xs / 2,
                backgroundColor: i === currentIndex ? accent : colors.border,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * iOS 26 toolbar-style control: the icon rides a circular Liquid Glass pill
 * (interactive), falling back via GlassSurface to a solid card-tinted circle on
 * Android / iOS < 26 / reduce-transparency.
 */
function GlassIconButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const size = iconSizes.md + spacing.sm * 2;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={spacing.sm}
      accessibilityRole="button"
      aria-label={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <GlassSurface
        variant="glass"
        isDark={isDark}
        tint={colors.cardBackground}
        glassTint={isDark ? 'rgba(255,255,255,0.10)' : 'rgba(120,120,128,0.18)'}
        isInteractive
        borderRadius={size / 2}
        style={absoluteFillObject}
      />
      {children}
    </Pressable>
  );
}

/**
 * Single inline native ad between the transport controls and the "Up Next" list.
 * Uses ONE stable slot for the whole player session (NOT keyed by the current
 * track), so a timer-driven auto-advance can't re-request the ad or re-count an
 * impression on every track change. Renders nothing — no slot, no top margin —
 * until a real ad binds, so premium / no-fill leaves no phantom gap;
 * `useAdForSlot` short-circuits for premium without subscribing. Sized from the
 * centered reading column (not the device width) so the LANDSCAPE creative stays
 * correctly proportioned on tablets, where the column is clamped.
 */
function PlayerAdCard() {
  const { spacing, screenWidth, config, isTablet } = useResponsive();
  const slotKey = NATIVE_ADS.FEED.PLAYER.key;
  const { ad } = useAdForSlot(slotKey, NativeMediaAspectRatio.LANDSCAPE);
  if (!ad) return null;
  const columnWidth = isTablet ? Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH) : screenWidth;
  const cardWidth = columnWidth - spacing.lg * 2;
  return (
    <View style={{ marginTop: spacing.lg }}>
      <NativeAdCard
        nativeAd={ad}
        slotKey={slotKey}
        aspectRatio={NativeMediaAspectRatio.LANDSCAPE}
        cardWidth={cardWidth}
        cardHeight={cardWidth * config.cardAspectRatio}
      />
    </View>
  );
}

export function PlayerSheet() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, iconSizes, screenWidth, isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const colors = hexColors[theme];
  // On tablets the player content is centered in a comfortable reading column
  // instead of stretching edge-to-edge.
  const contentMaxWidth = isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined;

  const {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    isLoading,
    hasNext,
    hasPrevious,
    togglePlayPause,
    next,
    previous,
    playIndex,
    removeAt,
    clearQueue,
    seekTo,
  } = useAudioQueue();

  const accent = colors.primary;
  const artworkSize = Math.min(screenWidth - spacing.xl * 2, 320);

  // Open the now-playing fact's detail from the artwork or the title. Present
  // the MODAL variant (not the /fact/[id] card): the player is itself a form
  // sheet, and on iOS a `card` pushed over a sheet lands BEHIND it — the same
  // reason the story screen routes to fact/modal (see app/fact/modal/[id].tsx).
  const openFact = useCallback(
    (factId: number) => {
      router.push(`/fact/modal/${factId}?source=queue_player`);
    },
    [router]
  );

  // iOS floats the sheet below the notch with a grabber, so it needs a real top
  // margin below the grabber (spacing.md read as none). Android adds the status-
  // bar inset because its sheet can sit flush under the status bar.
  const headerTopPad = Platform.OS === 'android' ? insets.top + spacing.md : spacing.xxl;

  const closeButton = (
    <GlassIconButton onPress={() => router.back()} label={t('playerClose')}>
      <X size={iconSizes.md} color={colors.text} />
    </GlassIconButton>
  );

  // Clear the whole queue — lives in the header next to close, shown only when
  // there's something to clear. A "clear list" glyph, not a trash can: this
  // empties the Up Next queue, it doesn't delete the facts.
  const clearButton = (
    <GlassIconButton onPress={clearQueue} label={t('playerClearQueue')}>
      <ListX size={iconSizes.md} color={colors.text} />
    </GlassIconButton>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Decoy scroll view (iOS): the formSheet hooks its FIRST descendant scroll
          view for grabber/detent drag coordination and resets that view's native
          frame, which desyncs it from its Yoga layout on cold present — the real
          content ScrollView then blanks. A zero-size decoy absorbs that hook so
          the real scroll area below lays out cleanly. No-op on Android. */}
      {Platform.OS === 'ios' && (
        <ScrollView pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0 }} />
      )}

      {/* Header — bigger title, no separator (was a bordered bar). */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.background,
          paddingTop: headerTopPad,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          <Text.Headline color={colors.text}>{t('playerTitle')}</Text.Headline>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {queue.length > 0 && clearButton}
            {closeButton}
          </View>
        </View>
      </View>

      {/* Real content scroll area below the header. The decoy above takes the
          formSheet's scroll-view hook so this one lays out cleanly. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        {/* Centered reading column. */}
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: spacing.lg,
          }}
        >
          {!currentTrack ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Music size={iconSizes.xxl} color={colors.textSecondary} />
              <Text.Body
                color={colors.textSecondary}
                style={{ marginTop: spacing.md, textAlign: 'center' }}
              >
                {t('playerEmpty')}
              </Text.Body>
            </View>
          ) : (
            <>
              {/* Artwork carousel — swipe through the queued facts' images;
                  tap the artwork to open that fact's detail. */}
              <ArtworkCarousel
                queue={queue}
                currentIndex={currentIndex}
                onSelect={playIndex}
                onOpenFact={openFact}
                artworkSize={artworkSize}
              />

              {/* Title + category (follows the current track). Tapping opens the
                  current fact's detail, mirroring the artwork tap. */}
              <Pressable
                onPress={() => openFact(currentTrack.factId)}
                accessibilityRole="button"
                aria-label={`${currentTrack.title}, ${t('a11y_viewFactButton')}`}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  gap: spacing.xs,
                  marginBottom: spacing.md,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text.Headline color={colors.text} numberOfLines={2} style={{ textAlign: 'center' }}>
                  {currentTrack.title}
                </Text.Headline>
                {!!currentTrack.category && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <QueueEqualizerIcon color={accent} size={14} animating={isPlaying} />
                    <Text.Label color={colors.textSecondary}>{currentTrack.category}</Text.Label>
                  </View>
                )}
              </Pressable>

              {/* Seek bar */}
              <SeekBar accent={accent} track={colors.border} onSeek={seekTo} />

              {/* Transport controls */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.xl,
                  marginVertical: spacing.lg,
                }}
              >
                <Pressable
                  onPress={previous}
                  disabled={!hasPrevious && currentIndex < 0}
                  hitSlop={spacing.md}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !hasPrevious && currentIndex < 0 }}
                  aria-label={t('playerPrevious')}
                  style={({ pressed }) => ({
                    opacity: !hasPrevious && currentIndex < 0 ? 0.3 : pressed ? 0.6 : 1,
                  })}
                >
                  <SkipBack size={iconSizes.xl} color={colors.text} fill={colors.text} />
                </Pressable>

                <Pressable
                  onPress={togglePlayPause}
                  accessibilityRole="button"
                  aria-label={isPlaying ? t('playerPause') : t('playerPlay')}
                  style={({ pressed }) => ({
                    width: iconSizes.xxl + spacing.lg,
                    height: iconSizes.xxl + spacing.lg,
                    borderRadius: (iconSizes.xxl + spacing.lg) / 2,
                    backgroundColor: accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    // Flat solid disc (no accent glow) with a subtle press-down —
                    // an iOS-26 prominent button, not a lit halo.
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  {isLoading ? (
                    <QueueEqualizerIcon color={colors.background} size={iconSizes.lg} animating />
                  ) : isPlaying ? (
                    <Pause size={iconSizes.lg} color={colors.background} fill={colors.background} />
                  ) : (
                    <Play size={iconSizes.lg} color={colors.background} fill={colors.background} />
                  )}
                </Pressable>

                <Pressable
                  onPress={next}
                  disabled={!hasNext}
                  hitSlop={spacing.md}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !hasNext }}
                  aria-label={t('playerNext')}
                  style={({ pressed }) => ({ opacity: !hasNext ? 0.3 : pressed ? 0.6 : 1 })}
                >
                  <SkipForward size={iconSizes.xl} color={colors.text} fill={colors.text} />
                </Pressable>
              </View>

              {/* Background-play — a clear labelled toggle (was a cryptic Moon). */}
              <BackgroundPlayRow />

              {/* Sponsored — a single inline native card between the controls and
                  the queue. Collapses (renders null) for premium / no-fill. */}
              <PlayerAdCard />
            </>
          )}

          {/* Up Next — compact fact cards (clear lives in the header). */}
          {queue.length > 0 && (
            <View style={{ marginTop: spacing.xl }}>
              <Text.Title color={colors.text} style={{ marginBottom: spacing.sm }}>
                {t('playerQueue')} ({queue.length})
              </Text.Title>

              <View style={{ gap: spacing.xs }}>
                {queue.map((item, index) => (
                  <QueueCard
                    key={`${item.factId}-${index}`}
                    item={item}
                    isCurrent={index === currentIndex}
                    isPlaying={isPlaying}
                    onPress={() => playIndex(index)}
                    onRemove={() => removeAt(index)}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
