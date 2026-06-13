import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';

import { useTranslation } from '../../i18n';
import * as api from '../../services/api';
import { syncTriviaResults } from '../../services/triviaSync';
import * as userService from '../../services/user';
import { hexColors, useTheme } from '../../theme';
import { darkenColor, getContrastColor, hexToRgba } from '../../utils/colors';
import { countryFlagEmoji } from '../../utils/countryFlag';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { GlassSurface } from '../GlassSurface';
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
}

const BOARD_LIMIT = 10;

/** Olympic medal accents for the top three rank discs. */
const MEDAL_COLORS = ['#F5C518', '#B8C4CE', '#CD7F32'] as const;

function RankBadge({ rank, size }: { rank: number; size: number }) {
  const { theme } = useTheme();
  const colors = hexColors[theme];

  const medal = rank >= 1 && rank <= 3 ? MEDAL_COLORS[rank - 1] : null;
  if (!medal) {
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <Text.Label color={colors.textSecondary} fontFamily={FONT_FAMILIES.semibold}>
          {rank}
        </Text.Label>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[medal, darkenColor(medal, 0.22)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        fontFamily={FONT_FAMILIES.bold}
        fontSize={size * 0.45}
        color={getContrastColor(medal)}
        maxFontSizeMultiplier={1}
      >
        {rank}
      </Text>
    </LinearGradient>
  );
}

/**
 * Server leaderboard card for the performance screen: window tabs, top
 * entries, the viewer's own standing when they fall outside the top, and a
 * claim-a-name CTA for anonymous players.
 */
function TriviaLeaderboardComponent({ reloadToken = 0 }: TriviaLeaderboardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { spacing, radius, iconSizes, typography, borderWidths } = useResponsive();
  const colors = hexColors[theme];

  const cardBg = colors.cardBackground;
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const accent = colors.primary;

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
        api.getTriviaLeaderboard(window, BOARD_LIMIT),
        userService.getProfile().catch(() => null),
      ]);
      setEntries(board.entries);
      setMe(board.me);
      setScreenName(profile?.screenName ?? null);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [window]);

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

  const meInTop = me !== null && entries.some((e) => e.rank === me.rank);
  const rankBadgeSize = iconSizes.lg;

  return (
    <View
      style={[
        { borderRadius: radius.lg },
        useGlass && {
          overflow: 'hidden' as const,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}
    >
      {useGlass && (
        <GlassSurface
          variant="glass"
          isDark={isDark}
          tint={cardBg}
          glassTint={hexToRgba(cardBg, isDark ? 0.6 : 0.65)}
          borderRadius={radius.lg}
          style={absoluteFillObject}
        />
      )}
      <YStack
        backgroundColor={useGlass ? 'transparent' : cardBg}
        borderRadius={radius.lg}
        padding={spacing.lg}
        gap={spacing.md}
      >
        {/* Header */}
        <XStack alignItems="center" gap={spacing.sm}>
          <Trophy size={iconSizes.sm} color={accent} />
          <Text.Label fontFamily={FONT_FAMILIES.semibold} color={colors.text}>
            {t('leaderboard')}
          </Text.Label>
        </XStack>

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
                    color={active ? getContrastColor(accent) : colors.textSecondary}
                    numberOfLines={1}
                  >
                    {label}
                  </Text.Label>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>

        {/* Body */}
        {isLoading ? (
          <YStack alignItems="center" paddingVertical={spacing.xl}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </YStack>
        ) : hasError ? (
          <YStack alignItems="center" gap={spacing.sm} paddingVertical={spacing.lg}>
            <Text.Label color="$textMuted" fontSize={typography.fontSize.caption}>
              {t('leaderboardLoadFailed')}
            </Text.Label>
            <Pressable onPress={load} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text.Label
                color={accent}
                fontFamily={FONT_FAMILIES.semibold}
                fontSize={typography.fontSize.caption}
              >
                {t('tryAgain')}
              </Text.Label>
            </Pressable>
          </YStack>
        ) : entries.length === 0 ? (
          <YStack alignItems="center" gap={spacing.sm} paddingVertical={spacing.lg}>
            <Trophy size={iconSizes.lg} color={colors.textMuted} opacity={0.6} />
            <Text.Label
              color="$textMuted"
              fontSize={typography.fontSize.caption}
              textAlign="center"
            >
              {t('leaderboardEmpty')}
            </Text.Label>
          </YStack>
        ) : (
          <YStack gap={spacing.sm}>
            {entries.map((entry) => {
              const isMe = meInTop && me !== null && entry.rank === me.rank;
              const flag = countryFlagEmoji(entry.country_code);
              return (
                <XStack
                  key={`${entry.rank}-${entry.screen_name}`}
                  alignItems="center"
                  gap={spacing.sm}
                  backgroundColor={isMe ? hexToRgba(accent, 0.1) : 'transparent'}
                  borderRadius={radius.md}
                  paddingVertical={spacing.xs}
                  paddingHorizontal={spacing.sm}
                >
                  <RankBadge rank={entry.rank} size={rankBadgeSize} />
                  {flag ? (
                    <Text.Label fontSize={typography.fontSize.caption}>{flag}</Text.Label>
                  ) : null}
                  <Text.Label
                    flex={1}
                    color={colors.text}
                    fontFamily={isMe ? FONT_FAMILIES.bold : FONT_FAMILIES.medium}
                    numberOfLines={1}
                  >
                    {entry.screen_name}
                  </Text.Label>
                  <YStack alignItems="flex-end">
                    <Text.Label color={accent} fontFamily={FONT_FAMILIES.bold}>
                      {entry.score}
                    </Text.Label>
                    {window !== 'today' && (
                      <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
                        {t('leaderboardGamesCount', { count: String(entry.games) })}
                      </Text.Caption>
                    )}
                  </YStack>
                </XStack>
              );
            })}

            {/* Viewer outside the visible top: pinned standing */}
            {me !== null && !meInTop && (
              <>
                <View
                  style={{ height: borderWidths.hairline, backgroundColor: colors.border }}
                />
                <XStack
                  alignItems="center"
                  gap={spacing.sm}
                  backgroundColor={hexToRgba(accent, 0.1)}
                  borderRadius={radius.md}
                  paddingVertical={spacing.xs}
                  paddingHorizontal={spacing.sm}
                >
                  <RankBadge rank={me.rank} size={rankBadgeSize} />
                  <Text.Label
                    flex={1}
                    color={colors.text}
                    fontFamily={FONT_FAMILIES.bold}
                    numberOfLines={1}
                  >
                    {t('leaderboardYou')}
                  </Text.Label>
                  <YStack alignItems="flex-end">
                    <Text.Label color={accent} fontFamily={FONT_FAMILIES.bold}>
                      {me.score}
                    </Text.Label>
                    {window !== 'today' && (
                      <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
                        {t('leaderboardGamesCount', { count: String(me.games) })}
                      </Text.Caption>
                    )}
                  </YStack>
                </XStack>
              </>
            )}
          </YStack>
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
              backgroundColor={colors.surface}
              borderRadius={radius.md}
              borderWidth={borderWidths.hairline}
              borderColor={colors.border}
              padding={spacing.md}
            >
              <LinearGradient
                colors={[accent, darkenColor(accent, 0.22)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: iconSizes.xl,
                  height: iconSizes.xl,
                  borderRadius: iconSizes.xl / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trophy size={iconSizes.sm} color={getContrastColor(accent)} />
              </LinearGradient>
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
      </YStack>

      <ScreenNameModal
        visible={namePromptVisible}
        onClose={() => setNamePromptVisible(false)}
        onSaved={handleNameSaved}
        currentName={null}
      />
    </View>
  );
}

export const TriviaLeaderboard = React.memo(TriviaLeaderboardComponent);
