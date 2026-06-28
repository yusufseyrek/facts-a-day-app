import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { useTranslation } from '../../i18n';
import { trackLeaderboardWindowSwitched } from '../../services/analytics';
import * as api from '../../services/api';
import { syncTriviaResults } from '../../services/triviaSync';
import * as userService from '../../services/user';
import { hexColors, useTheme } from '../../theme';
import { darkenColor, getContrastColor, hexToRgba } from '../../utils/colors';
import { countryFlagEmoji } from '../../utils/countryFlag';
import { useResponsive } from '../../utils/useResponsive';
import { ChevronRight, Trophy } from '../icons';
import { ScreenNameModal } from '../ScreenNameModal';
import { ShimmerPlaceholder } from '../ShimmerPlaceholder';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import type {
  TriviaLeaderboardEntry,
  TriviaLeaderboardStanding,
  TriviaLeaderboardWindow,
} from '../../services/api';
import type { ResponsiveMedia } from '../../utils/useResponsive';

interface TriviaLeaderboardProps {
  /** Bump to reload (parent pull-to-refresh / focus). */
  reloadToken?: number;
  /** Entries per window; the dedicated screen shows more than a card would. */
  limit?: number;
  /** Fires when a load settles (success or error) — lets a hosting screen
   * clear its RefreshControl. */
  onLoadEnd?: () => void;
}

const DEFAULT_BOARD_LIMIT = 50;

/** Olympic medal accents for the podium and top-three rank discs. */
const MEDAL_COLORS = ['#F5C518', '#B8C4CE', '#CD7F32'] as const;

function medalFor(rank: number): string | null {
  return rank >= 1 && rank <= 3 ? MEDAL_COLORS[rank - 1] : null;
}

/** Podium plinth heights derived from one responsive base so they stay
 * proportional on tablet/large font scale. The winner's plinth towers; 2nd and
 * 3rd step down at fixed ratios. Reused by both the real podium and the
 * loading skeleton so the two never drift apart. */
function plinthHeightsFor(media: ResponsiveMedia): Record<number, number> {
  const base = media.topicCardSize * 0.9;
  return { 1: base, 2: base * 0.67, 3: base * 0.47 };
}

/** Group thousands (4,210) without Intl, which is unreliable across RN engines.
 * Scores are small today but grow with play volume. */
function formatScore(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Spoken score for accessibility labels: "56 / 111", or just "56" when the
 * total is unavailable (pre-total_questions backend). */
function scoreA11y(correct: number, total: number): string {
  return Number.isFinite(total) && total > 0
    ? `${formatScore(correct)} / ${formatScore(total)}`
    : formatScore(correct);
}

/** Score as "correct / total": correct answers (also the rank metric) emphasized,
 * the answered-question total shown muted as the denominator so the number can't
 * be misread (e.g. "56" alone vs "56 / 111"). */
function ScoreFraction({
  correct,
  total,
  numeratorColor,
  denomColor,
  denomOpacity,
  big,
}: {
  correct: number;
  total: number;
  numeratorColor: string;
  denomColor: string;
  denomOpacity?: number;
  big?: boolean;
}) {
  const Numerator = big ? Text.Title : Text.Label;
  // Degrade to the bare score if a backend without total_questions is in play
  // (e.g. an app build pointed at a not-yet-deployed server) so we never show
  // "56 / undefined".
  const showDenom = Number.isFinite(total) && total > 0;
  return (
    <XStack alignItems="baseline">
      <Numerator color={numeratorColor} fontFamily={FONT_FAMILIES.bold} maxFontSizeMultiplier={1.2}>
        {formatScore(correct)}
      </Numerator>
      {showDenom ? (
        <Text.Caption color={denomColor} opacity={denomOpacity} maxFontSizeMultiplier={1.2}>
          {` / ${formatScore(total)}`}
        </Text.Caption>
      ) : null}
    </XStack>
  );
}

/** Screen names are unique (COLLATE NOCASE server-side), so identity, not rank,
 * decides which row is the viewer — rank can repeat on ties. */
function isSameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Gradient initial disc — the same signature as the comments avatars. */
function InitialDisc({
  name,
  color,
  size,
  borderColor,
}: {
  name: string;
  color: string;
  size: number;
  borderColor?: string;
}) {
  return (
    <LinearGradient
      colors={[color, darkenColor(color, 0.22)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: borderColor ? 2 : 0,
        borderColor: borderColor ?? 'transparent',
      }}
    >
      <Text
        fontFamily={FONT_FAMILIES.bold}
        fontSize={size * 0.4}
        color={getContrastColor(color)}
        maxFontSizeMultiplier={1}
      >
        {(name[0] || '?').toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

/**
 * One podium column: medal disc with the player's initial on a translucent
 * plinth whose height carries the rank. Center column (#1) towers.
 */
function PodiumColumn({
  entry,
  isViewer,
  plinthHeight,
  discSize,
  contrastColor,
  plateBg,
  youLabel,
}: {
  entry: TriviaLeaderboardEntry;
  isViewer: boolean;
  plinthHeight: number;
  discSize: number;
  contrastColor: string;
  plateBg: string;
  youLabel: string;
}) {
  const { spacing, radius, typography } = useResponsive();
  const medal = medalFor(entry.rank) ?? MEDAL_COLORS[2];
  const flag = countryFlagEmoji(entry.country_code);

  return (
    <YStack
      flex={1}
      alignItems="center"
      gap={spacing.sm}
      justifyContent="flex-end"
      accessible
      accessibilityLabel={`#${entry.rank} ${entry.screen_name} ${scoreA11y(entry.score, entry.total_questions)}${
        isViewer ? ` (${youLabel})` : ''
      }`}
    >
      <InitialDisc
        name={entry.screen_name}
        color={medal}
        size={discSize}
        // Border (the viewer marker) must contrast its own medal disc, not the
        // card accent — white-on-gold failed contrast.
        borderColor={isViewer ? getContrastColor(medal) : undefined}
      />
      <YStack alignItems="center" gap={2} maxWidth="100%">
        <Text.Caption
          fontFamily={FONT_FAMILIES.semibold}
          color={contrastColor}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {`${flag ? `${flag} ` : ''}${entry.screen_name}`}
        </Text.Caption>
        <ScoreFraction
          correct={entry.score}
          total={entry.total_questions}
          numeratorColor={contrastColor}
          denomColor={contrastColor}
          denomOpacity={0.7}
          big
        />
        {isViewer && (
          <Text.Tiny
            color={contrastColor}
            opacity={0.8}
            fontFamily={FONT_FAMILIES.semibold}
            numberOfLines={1}
          >
            {youLabel}
          </Text.Tiny>
        )}
      </YStack>
      <YStack
        alignSelf="stretch"
        height={plinthHeight}
        borderTopLeftRadius={radius.md}
        borderTopRightRadius={radius.md}
        backgroundColor={plateBg}
        alignItems="center"
        justifyContent="center"
      >
        <Text
          fontFamily={FONT_FAMILIES.bold}
          fontSize={typography.fontSize.title}
          color={contrastColor}
          opacity={0.85}
          maxFontSizeMultiplier={1}
        >
          {entry.rank}
        </Text>
      </YStack>
    </YStack>
  );
}

/**
 * Loading scaffold in the board's own shape (podium + ranked rows). Shown on
 * first load and when switching windows so the structure stays put and only
 * the content swaps, instead of collapsing to a centered spinner.
 */
function LeaderboardSkeleton() {
  const { theme } = useTheme();
  const { spacing, radius, borderWidths, media } = useResponsive();
  const colors = hexColors[theme];
  // Same accent → contrast → plate derivation as the real podium so the loading
  // box renders the identical blue gradient, decorative circles and plinths.
  const accent = colors.primary;
  const contrastColor = getContrastColor(accent);
  const plateBg = contrastColor === '#000000' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
  // The player-info marks sit on the blue gradient, where the theme border tone
  // (a dark blue) would vanish — shimmer a translucent tint of the contrast
  // colour instead so they read as placeholders against the fill.
  const markColor = contrastColor === '#000000' ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.9)';
  const disc = media.topicCardSize * 0.62;
  // 2nd, 1st, 3rd — same column order and plinth heights as the real podium,
  // derived from the same single base so the two stay proportional.
  const plinths = plinthHeightsFor(media);
  const columns = [
    { plinth: plinths[2], d: disc * 0.82 },
    { plinth: plinths[1], d: disc },
    { plinth: plinths[3], d: disc * 0.82 },
  ];

  return (
    <YStack gap={spacing.lg}>
      {/* Podium frame — mirrors the real podium hero (blue gradient + the two
          decorative circles + translucent plinths) so the box background stays
          constant across the loading→loaded swap; only the per-player info
          (avatar / name / score) shimmers on top. */}
      <View style={[styles.heroShadow, { borderRadius: radius.xl, shadowColor: accent }]}>
        <LinearGradient
          colors={[accent, darkenColor(accent, 0.22)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.xl, overflow: 'hidden' }}
        >
          {/* Layered decorative circles — identical to the loaded podium. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -disc * 0.8,
              right: -disc * 0.6,
              width: disc * 2.2,
              height: disc * 2.2,
              borderRadius: disc * 1.1,
              backgroundColor:
                contrastColor === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: -disc * 0.9,
              left: -disc * 0.5,
              width: disc * 1.8,
              height: disc * 1.8,
              borderRadius: disc * 0.9,
              backgroundColor:
                contrastColor === '#000000' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
            }}
          />
          <XStack
            alignItems="flex-end"
            gap={spacing.md}
            paddingHorizontal={spacing.lg}
            paddingTop={spacing.xl}
          >
            {columns.map((c, i) => (
              <YStack
                key={i}
                flex={1}
                alignItems="center"
                gap={spacing.sm}
                justifyContent="flex-end"
              >
                <ShimmerPlaceholder width={c.d} height={c.d} borderRadius={c.d / 2} color={markColor} />
                <YStack alignItems="center" gap={4}>
                  <ShimmerPlaceholder width={c.d} height={13} color={markColor} />
                  <ShimmerPlaceholder width={c.d * 0.6} height={20} color={markColor} />
                </YStack>
                {/* Plinth = static translucent plate (part of the box), matching
                    the loaded podium minus its rank number. */}
                <YStack
                  alignSelf="stretch"
                  height={c.plinth}
                  borderTopLeftRadius={radius.md}
                  borderTopRightRadius={radius.md}
                  backgroundColor={plateBg}
                />
              </YStack>
            ))}
          </XStack>
        </LinearGradient>
      </View>

      {/* Ranked rows frame */}
      <YStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        borderWidth={borderWidths.hairline}
        borderColor={colors.border}
        paddingVertical={spacing.xs}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <XStack
            key={i}
            alignItems="center"
            gap={spacing.sm}
            paddingVertical={spacing.sm}
            paddingHorizontal={spacing.md}
          >
            <ShimmerPlaceholder width={18} height={16} />
            <ShimmerPlaceholder width="45%" height={14} />
            <View style={{ flex: 1 }} />
            <ShimmerPlaceholder width={28} height={16} />
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

/**
 * Full-screen leaderboard: window tabs, a gradient podium hero for the top
 * three (decorated in the trivia tile signature), ranked rows for the rest,
 * the viewer's standing pinned when off-list, and the claim CTA for
 * anonymous players.
 */
function TriviaLeaderboardComponent({
  reloadToken = 0,
  limit = DEFAULT_BOARD_LIMIT,
  onLoadEnd,
}: TriviaLeaderboardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, iconSizes, typography, borderWidths, media } = useResponsive();
  const colors = hexColors[theme];

  const accent = colors.primary;
  const contrastColor = getContrastColor(accent);
  const plateBg = contrastColor === '#000000' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
  const discSize = media.topicCardSize * 0.62;

  const [window, setWindow] = useState<TriviaLeaderboardWindow>('today');
  const [entries, setEntries] = useState<TriviaLeaderboardEntry[]>([]);
  // The window the current entries belong to. When it lags behind the selected
  // window (first load or a tab switch) we show the skeleton; on a same-window
  // refresh it already matches, so the existing rows stay put underneath.
  const [loadedWindow, setLoadedWindow] = useState<TriviaLeaderboardWindow | null>(null);
  const [me, setMe] = useState<TriviaLeaderboardStanding | null>(null);
  const [screenName, setScreenName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  // Every load() bumps the epoch; only the latest load applies its result. This
  // drops out-of-order responses from fast tab switches / refreshes (which would
  // otherwise paint a stale window) and defers onLoadEnd until the newest load
  // settles, so the pull-to-refresh spinner clears at the right moment.
  const loadEpoch = useRef(0);

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    setIsLoading(true);
    setHasError(false);
    try {
      const [board, profile] = await Promise.all([
        api.getTriviaLeaderboard(window, limit),
        userService.getProfile().catch(() => null),
      ]);
      if (epoch !== loadEpoch.current) return; // superseded by a newer load
      setEntries(board.entries);
      setMe(board.me);
      setScreenName(profile?.screenName ?? null);
      setLoadedWindow(window);
    } catch {
      if (epoch !== loadEpoch.current) return;
      setHasError(true);
    } finally {
      if (epoch === loadEpoch.current) {
        setIsLoading(false);
        onLoadEnd?.();
      }
    }
  }, [window, limit, onLoadEnd]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  // Reflect a name claimed/renamed/cleared from another screen (comments,
  // settings) while the board is mounted.
  useEffect(
    () => userService.onIdentityChange((identity) => setScreenName(identity?.screenName ?? null)),
    [],
  );

  // A fresh claim retro-submits recent games (claimScreenName triggers the
  // sync); drain first so the immediate reload already includes them.
  const handleNameSaved = useCallback(
    (name: string) => {
      setScreenName(name);
      syncTriviaResults()
        .catch(() => {})
        .finally(() => load());
    },
    [load]
  );

  const windows: { key: TriviaLeaderboardWindow; label: string }[] = [
    { key: 'today', label: t('today') },
    { key: 'week', label: t('leaderboardWeek') },
    { key: 'all', label: t('leaderboardAllTime') },
  ];

  // Defensive: the server already returns rank order, but sort before the
  // 2-1-3 podium reorder so a winner is never placed off-center.
  const podium = entries.slice(0, 3).sort((a, b) => a.rank - b.rank);
  const rest = entries.slice(3);
  // The viewer's own row is matched by screen name (unique), not rank — ties
  // repeat a rank, so a rank match would light up the wrong row.
  const isMyRow = (entry: TriviaLeaderboardEntry) => isSameName(entry.screen_name, screenName);
  const meInList = entries.some(isMyRow);
  // Podium render order: 2nd, 1st, 3rd — winner in the middle.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(
    (e): e is TriviaLeaderboardEntry => e !== undefined
  );
  const plinthHeights: Record<number, number> = plinthHeightsFor(media);

  return (
    <YStack gap={spacing.lg}>
      {/* Window tabs */}
      <XStack
        accessibilityRole="tablist"
        backgroundColor={colors.surface}
        borderRadius={radius.full}
        padding={spacing.xs}
        gap={spacing.xs}
      >
        {windows.map(({ key, label }) => {
          const active = window === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                if (!active) {
                  trackLeaderboardWindowSwitched({
                    window: key,
                    hasScreenName: !!screenName,
                    viewerRank: me?.rank,
                  });
                }
                setWindow(key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={({ pressed }) => ({ flex: 1, opacity: pressed && !active ? 0.7 : 1 })}
            >
              <YStack
                backgroundColor={active ? accent : 'transparent'}
                borderRadius={radius.full}
                paddingVertical={spacing.sm}
                // width:100% keeps every pill the same size; overflow:hidden clips
                // the accent fill to this pill's OWN rounded shape (on Android the
                // radius was dropped on the middle tab without it). No
                // alignItems:center here: that cross-axis override content-sizes the
                // label (Yoga measures it AT_MOST/narrow instead of the pill's
                // definite width), which on Fabric produced the early narrow measure
                // that wrapped "This Week" to "This". The label below owns a definite
                // full-pill width and centres its own glyphs instead.
                width="100%"
                overflow="hidden"
              >
                <Text.Label
                  // Weight-invariant + definite-width label. Two things used to make
                  // this reflow: (1) the active/inactive font swap (semibold<->medium)
                  // changed the glyph FILE, and on Android the file carries the weight
                  // (fontWeight is dropped for a custom fontFamily, see Typography),
                  // so the active label's intrinsic width differed from the inactive
                  // one; (2) a content-sized text box got an early NARROW measure on
                  // Fabric and was never rebuilt, collapsing the widest label to its
                  // first token. Fix both at the source: pin a SINGLE font file
                  // (Montserrat_500Medium) on every tab so the text metrics never
                  // change on selection, and give the box a definite width:100% so
                  // Yoga measures it EXACTLY at the final pill width on the first pass.
                  // Active state reads from the accent pill + contrast color. The
                  // fontWeight "500" makes iOS render the same medium face the Android
                  // file already encodes. numberOfLines={1} is a hard single-line
                  // guard for extreme locales / large font scales.
                  width="100%"
                  fontSize={typography.fontSize.caption}
                  fontFamily={FONT_FAMILIES.medium}
                  fontWeight="500"
                  color={active ? contrastColor : colors.textSecondary}
                  textAlign="center"
                  numberOfLines={1}
                >
                  {label}
                </Text.Label>
              </YStack>
            </Pressable>
          );
        })}
      </XStack>

      {hasError ? (
        <YStack alignItems="center" gap={spacing.md} paddingVertical={spacing.xxxl * 2}>
          <Trophy size={iconSizes.hero} color={colors.textMuted} opacity={0.5} />
          <Text.Label color="$textMuted">{t('leaderboardLoadFailed')}</Text.Label>
          <Pressable
            onPress={load}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text.Label color={accent} fontFamily={FONT_FAMILIES.semibold}>
              {t('tryAgain')}
            </Text.Label>
          </Pressable>
        </YStack>
      ) : loadedWindow !== window ? (
        <LeaderboardSkeleton />
      ) : entries.length === 0 ? (
        <YStack alignItems="center" gap={spacing.md} paddingVertical={spacing.xxxl * 2}>
          <Trophy size={iconSizes.hero} color={colors.textMuted} opacity={0.5} />
          <Text.Label color="$textMuted" textAlign="center">
            {t(window === 'today' ? 'leaderboardEmptyToday' : 'leaderboardEmpty')}
          </Text.Label>
        </YStack>
      ) : (
        <>
          {/* Podium hero — full-color gradient in the trivia tile signature.
              testID is the marketing-screenshot wait anchor: it only mounts
              when the board has entries, so the capture flow gates on it and
              fails loudly rather than shooting a blank/empty board. */}
          <View
            testID="leaderboard-podium-hero"
            style={[
              styles.heroShadow,
              { borderRadius: radius.xl, shadowColor: accent },
            ]}
          >
            <LinearGradient
              colors={[accent, darkenColor(accent, 0.22)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: radius.xl, overflow: 'hidden' }}
            >
              {/* Layered decorative circles for depth */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -discSize * 0.8,
                  right: -discSize * 0.6,
                  width: discSize * 2.2,
                  height: discSize * 2.2,
                  borderRadius: discSize * 1.1,
                  backgroundColor:
                    contrastColor === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)',
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  bottom: -discSize * 0.9,
                  left: -discSize * 0.5,
                  width: discSize * 1.8,
                  height: discSize * 1.8,
                  borderRadius: discSize * 0.9,
                  backgroundColor:
                    contrastColor === '#000000' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
                }}
              />
              <XStack
                // Always bottom-align so every plinth sits flush on the panel
                // floor. 'center' (the old <3-entry branch) vertically centered
                // the shorter columns, floating 2nd/3rd place off the bottom
                // while the tallest (1st) still filled the row.
                alignItems="flex-end"
                gap={spacing.md}
                paddingHorizontal={spacing.lg}
                paddingTop={spacing.xl}
              >
                {podiumOrder.map((entry) => (
                  <PodiumColumn
                    key={entry.screen_name}
                    entry={entry}
                    isViewer={isMyRow(entry)}
                    plinthHeight={plinthHeights[entry.rank] ?? 34}
                    discSize={entry.rank === 1 ? discSize : discSize * 0.82}
                    contrastColor={contrastColor}
                    plateBg={plateBg}
                    youLabel={t('leaderboardYou')}
                  />
                ))}
              </XStack>
            </LinearGradient>
          </View>

          {/* Ranks beyond the podium */}
          {rest.length > 0 && (
            <YStack
              backgroundColor="$cardBackground"
              borderRadius={radius.lg}
              borderWidth={borderWidths.hairline}
              borderColor="$border"
              paddingVertical={spacing.xs}
            >
              {rest.map((entry, index) => {
                const isMe = isMyRow(entry);
                const flag = countryFlagEmoji(entry.country_code);
                return (
                  <React.Fragment key={`${entry.rank}-${entry.screen_name}`}>
                    {index > 0 && (
                      <View
                        style={{
                          height: borderWidths.hairline,
                          backgroundColor: colors.border,
                          marginHorizontal: spacing.md,
                        }}
                      />
                    )}
                    <XStack
                      alignItems="center"
                      gap={spacing.sm}
                      paddingVertical={spacing.sm}
                      paddingHorizontal={spacing.md}
                      backgroundColor={isMe ? hexToRgba(accent, 0.1) : 'transparent'}
                      accessible
                      accessibilityLabel={`#${entry.rank} ${entry.screen_name} ${scoreA11y(
                        entry.score,
                        entry.total_questions
                      )}${isMe ? ` (${t('leaderboardYou')})` : ''}`}
                    >
                      <View style={{ width: iconSizes.lg, alignItems: 'center' }}>
                        <Text.Label
                          color={colors.textSecondary}
                          fontFamily={FONT_FAMILIES.semibold}
                        >
                          {entry.rank}
                        </Text.Label>
                      </View>
                      {flag ? (
                        <Text.Label fontSize={typography.fontSize.caption}>{flag}</Text.Label>
                      ) : null}
                      <Text.Label
                        flex={1}
                        color={colors.text}
                        fontFamily={isMe ? FONT_FAMILIES.bold : FONT_FAMILIES.medium}
                        numberOfLines={1}
                      >
                        {isMe ? `${entry.screen_name} · ${t('leaderboardYou')}` : entry.screen_name}
                      </Text.Label>
                      <YStack alignItems="flex-end">
                        <ScoreFraction
                          correct={entry.score}
                          total={entry.total_questions}
                          numeratorColor={accent}
                          denomColor={colors.textMuted}
                        />
                        <Text.Caption
                          color={colors.textMuted}
                          fontSize={typography.fontSize.tiny}
                        >
                          {t('leaderboardGamesCount', { count: String(entry.games) })}
                        </Text.Caption>
                      </YStack>
                    </XStack>
                  </React.Fragment>
                );
              })}
            </YStack>
          )}

          {/* Viewer's standing when they're beyond the visible list */}
          {me !== null && !meInList && (
            <View style={[styles.heroShadow, { borderRadius: radius.lg, shadowColor: accent }]}>
              <LinearGradient
                colors={[accent, darkenColor(accent, 0.22)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: radius.lg }}
              >
                <XStack
                  alignItems="center"
                  gap={spacing.sm}
                  paddingVertical={spacing.md}
                  paddingHorizontal={spacing.lg}
                >
                  <Trophy size={iconSizes.sm} color={contrastColor} />
                  <Text.Label
                    flex={1}
                    color={contrastColor}
                    fontFamily={FONT_FAMILIES.bold}
                    numberOfLines={1}
                  >
                    {`${t('leaderboardYou')} · #${me.rank}`}
                  </Text.Label>
                  <YStack alignItems="flex-end">
                    <ScoreFraction
                      correct={me.score}
                      total={me.total_questions}
                      numeratorColor={contrastColor}
                      denomColor={contrastColor}
                      denomOpacity={0.7}
                    />
                    <Text.Caption
                      color={contrastColor}
                      opacity={0.8}
                      fontSize={typography.fontSize.tiny}
                    >
                      {t('leaderboardGamesCount', { count: String(me.games) })}
                    </Text.Caption>
                  </YStack>
                </XStack>
              </LinearGradient>
            </View>
          )}
        </>
      )}

      {/* Anonymous players: claim a name to compete */}
      {!isLoading && !screenName && (
        <Pressable
          onPress={() => setNamePromptVisible(true)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={t('leaderboardClaimCta')}
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <XStack
            alignItems="center"
            gap={spacing.md}
            backgroundColor="$cardBackground"
            borderRadius={radius.lg}
            borderWidth={borderWidths.hairline}
            borderColor="$border"
            padding={spacing.md}
          >
            <InitialDisc name="?" color={accent} size={iconSizes.xl} />
            <Text.Label
              flex={1}
              color={colors.text}
              fontFamily={FONT_FAMILIES.semibold}
              fontSize={typography.fontSize.caption}
            >
              {t('leaderboardClaimCta')}
            </Text.Label>
            <ChevronRight size={iconSizes.sm} color={colors.textMuted} />
          </XStack>
        </Pressable>
      )}

      <ScreenNameModal
        visible={namePromptVisible}
        onClose={() => setNamePromptVisible(false)}
        onSaved={handleNameSaved}
        currentName={null}
      />
    </YStack>
  );
}

const styles = StyleSheet.create({
  heroShadow: {
    // shadowColor is set per-instance (the accent) at the call site.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});

export const TriviaLeaderboard = React.memo(TriviaLeaderboardComponent);
