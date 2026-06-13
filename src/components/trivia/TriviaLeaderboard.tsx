import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { useTranslation } from '../../i18n';
import * as api from '../../services/api';
import { syncTriviaResults } from '../../services/triviaSync';
import * as userService from '../../services/user';
import { hexColors, useTheme } from '../../theme';
import { darkenColor, getContrastColor, hexToRgba } from '../../utils/colors';
import { countryFlagEmoji } from '../../utils/countryFlag';
import { useResponsive } from '../../utils/useResponsive';
import { ChevronRight, Trophy } from '../icons';
import { ScreenNameModal } from '../ScreenNameModal';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import type {
  TriviaLeaderboardEntry,
  TriviaLeaderboardStanding,
  TriviaLeaderboardWindow,
} from '../../services/api';

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
    <YStack flex={1} alignItems="center" gap={spacing.sm} justifyContent="flex-end">
      <InitialDisc
        name={entry.screen_name}
        color={medal}
        size={discSize}
        borderColor={isViewer ? contrastColor : undefined}
      />
      <YStack alignItems="center" gap={2} maxWidth="100%">
        <Text.Caption
          fontFamily={FONT_FAMILIES.semibold}
          color={contrastColor}
          numberOfLines={1}
        >
          {`${flag ? `${flag} ` : ''}${entry.screen_name}`}
        </Text.Caption>
        <Text.Title color={contrastColor} fontFamily={FONT_FAMILIES.bold}>
          {entry.score}
        </Text.Title>
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
  const [me, setMe] = useState<TriviaLeaderboardStanding | null>(null);
  const [screenName, setScreenName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [namePromptVisible, setNamePromptVisible] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const [board, profile] = await Promise.all([
        api.getTriviaLeaderboard(window, limit),
        userService.getProfile().catch(() => null),
      ]);
      setEntries(board.entries);
      setMe(board.me);
      setScreenName(profile?.screenName ?? null);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
      onLoadEnd?.();
    }
  }, [window, limit, onLoadEnd]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

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

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const meInList = me !== null && entries.some((e) => e.rank === me.rank);
  // Podium render order: 2nd, 1st, 3rd — winner in the middle.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(
    (e): e is TriviaLeaderboardEntry => e !== undefined
  );
  const plinthHeights: Record<number, number> = { 1: 72, 2: 48, 3: 34 };

  const isViewerRank = (rank: number) => me !== null && meInList && rank === me.rank;

  return (
    <YStack gap={spacing.lg}>
      {/* Window tabs */}
      <XStack
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
              onPress={() => setWindow(key)}
              style={({ pressed }) => ({ flex: 1, opacity: pressed && !active ? 0.7 : 1 })}
            >
              <YStack
                backgroundColor={active ? accent : 'transparent'}
                borderRadius={radius.full}
                paddingVertical={spacing.sm}
                alignItems="center"
              >
                <Text.Label
                  fontSize={typography.fontSize.caption}
                  fontFamily={active ? FONT_FAMILIES.semibold : FONT_FAMILIES.medium}
                  color={active ? contrastColor : colors.textSecondary}
                  numberOfLines={1}
                >
                  {label}
                </Text.Label>
              </YStack>
            </Pressable>
          );
        })}
      </XStack>

      {isLoading ? (
        <YStack alignItems="center" paddingVertical={spacing.xxxl * 2}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </YStack>
      ) : hasError ? (
        <YStack alignItems="center" gap={spacing.md} paddingVertical={spacing.xxxl * 2}>
          <Trophy size={iconSizes.hero} color={colors.textMuted} opacity={0.5} />
          <Text.Label color="$textMuted">{t('leaderboardLoadFailed')}</Text.Label>
          <Pressable onPress={load} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Text.Label color={accent} fontFamily={FONT_FAMILIES.semibold}>
              {t('tryAgain')}
            </Text.Label>
          </Pressable>
        </YStack>
      ) : entries.length === 0 ? (
        <YStack alignItems="center" gap={spacing.md} paddingVertical={spacing.xxxl * 2}>
          <Trophy size={iconSizes.hero} color={colors.textMuted} opacity={0.5} />
          <Text.Label color="$textMuted" textAlign="center">
            {t('leaderboardEmpty')}
          </Text.Label>
        </YStack>
      ) : (
        <>
          {/* Podium hero — full-color gradient in the trivia tile signature */}
          <View
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
                alignItems="flex-end"
                gap={spacing.md}
                paddingHorizontal={spacing.lg}
                paddingTop={spacing.xl}
              >
                {podiumOrder.map((entry) => (
                  <PodiumColumn
                    key={entry.rank}
                    entry={entry}
                    isViewer={isViewerRank(entry.rank)}
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
                const isMe = isViewerRank(entry.rank);
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
                        <Text.Label color={accent} fontFamily={FONT_FAMILIES.bold}>
                          {entry.score}
                        </Text.Label>
                        {window !== 'today' && (
                          <Text.Caption
                            color={colors.textMuted}
                            fontSize={typography.fontSize.tiny}
                          >
                            {t('leaderboardGamesCount', { count: String(entry.games) })}
                          </Text.Caption>
                        )}
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
                    <Text.Label color={contrastColor} fontFamily={FONT_FAMILIES.bold}>
                      {me.score}
                    </Text.Label>
                    {window !== 'today' && (
                      <Text.Tiny color={contrastColor} opacity={0.8}>
                        {t('leaderboardGamesCount', { count: String(me.games) })}
                      </Text.Tiny>
                    )}
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
