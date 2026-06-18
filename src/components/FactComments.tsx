import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput, View } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

import { useTranslation } from '../i18n';
import { SUPPORTED_LOCALES } from '../i18n/config';
import {
  trackCommentAuthorBlocked,
  trackCommentEulaResult,
  trackCommentJoinCtaTapped,
  trackCommentPosted,
  trackCommentPostFailed,
  trackCommentReported,
  trackCommentsLoadMore,
  trackCommentsViewed,
} from '../services/analytics';
import * as api from '../services/api';
import * as userService from '../services/user';
import { hexColors, useTheme } from '../theme';
import { openInAppBrowser } from '../utils/browser';
import { darkenColor, getContrastColor } from '../utils/colors';
import { countryFlagEmoji } from '../utils/countryFlag';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { useResponsive } from '../utils/useResponsive';

import { ChevronRight, MessageCircle, Send } from './icons';
import { ScreenNameModal } from './ScreenNameModal';
import { XStack, YStack } from './Stacks';
import { FONT_FAMILIES, Text } from './Typography';

import type { ApiComment } from '../services/api';

/** A comment's translated body + the language it came from, keyed by comment id. */
type TranslationEntry = { body: string; source_locale: string | null };

/** Endonym for the "Translated from X" label (e.g. en -> English, de -> Deutsch). */
const LOCALE_ENDONYM: Record<string, string> = Object.fromEntries(
  SUPPORTED_LOCALES.map((l) => [l.code, l.name])
);
function localeName(code: string | null): string {
  return (code && LOCALE_ENDONYM[code]) || (code ?? '');
}

interface FactCommentsProps {
  factId: number;
  /** Category accent for the section separator, matching RelatedFacts. */
  categoryColor: string | null;
}

const PAGE_SIZE = 10;
const MAX_COMMENT_LENGTH = 500;

// One-time community-rules agreement before a user's first post (Apple 1.2 EULA).
const COMMENT_EULA_KEY = '@comment_eula_accepted';

/**
 * Compact "N ago" relative age: "just now" under a minute, then "5m ago" /
 * "2h ago" / "3d ago" / "1w ago"; past ~4 weeks it falls back to a localized
 * absolute date. Hand-rolled rather than Intl.RelativeTimeFormat, which isn't
 * reliably supported on Hermes (it threw and rendered an empty string on
 * device) and whose narrow style isn't a guaranteed "Nx ago" shape.
 */
function timeAgo(createdAt: string, locale: string): string {
  try {
    // SQLite CURRENT_TIMESTAMP is UTC space-form without a marker; normalize
    // like FactModal.formatLastUpdated so the device offset is applied.
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(createdAt)
      ? createdAt
      : createdAt.replace(' ', 'T') + 'Z';
    const then = new Date(normalized).getTime();
    if (Number.isNaN(then)) return '';
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(normalized).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// Per-user accent drawn from the app's neon palette so avatars distinguish
// authors while staying on-brand; the hash keeps a name's color stable.
const AVATAR_COLOR_KEYS = [
  'neonCyan',
  'neonOrange',
  'neonMagenta',
  'neonGreen',
  'neonPurple',
  'neonYellow',
  'neonRed',
] as const;

function avatarColor(
  name: string,
  palette: Record<(typeof AVATAR_COLOR_KEYS)[number], string>
): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[AVATAR_COLOR_KEYS[hash % AVATAR_COLOR_KEYS.length]];
}

/** Gradient initial disc — the discover/trivia tile signature at avatar size. */
function GradientDisc({
  color,
  size,
  children,
}: {
  color: string;
  size: number;
  children: React.ReactNode;
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
      }}
    >
      {children}
    </LinearGradient>
  );
}

function CommentRow({
  comment,
  locale,
  translation,
  showOriginal,
  onToggleOriginal,
  onMenu,
}: {
  comment: ApiComment;
  locale: string;
  translation?: TranslationEntry;
  showOriginal: boolean;
  onToggleOriginal: () => void;
  onMenu?: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, borderWidths, typography, iconSizes } = useResponsive();
  const palette = hexColors[theme];
  const flag = countryFlagEmoji(comment.country_code);

  const name = comment.screen_name || '?';
  const accent = avatarColor(name, palette);
  const avatarSize = iconSizes.xl + spacing.xs;

  // When a translation is available we show it by default and offer "See
  // original"; once toggled to the original we offer "See translation". The
  // source language for the label comes from the translation (falling back to
  // the comment's stored author locale).
  const hasTranslation = !!translation;
  const viewingTranslation = hasTranslation && !showOriginal;
  const bodyText = viewingTranslation ? translation!.body : comment.body;
  const sourceName = localeName(translation?.source_locale ?? comment.locale);

  return (
    <XStack gap={spacing.sm} alignItems="flex-start">
      <GradientDisc color={accent} size={avatarSize}>
        <Text
          fontFamily={FONT_FAMILIES.bold}
          fontSize={avatarSize * 0.42}
          color={getContrastColor(accent)}
          maxFontSizeMultiplier={1}
        >
          {name[0].toUpperCase()}
        </Text>
      </GradientDisc>

      {/* Speech-bubble card: small corner toward the avatar */}
      <YStack
        flex={1}
        backgroundColor="$cardBackground"
        borderRadius={radius.lg}
        borderTopLeftRadius={radius.sm}
        borderWidth={borderWidths.hairline}
        borderColor="$border"
        paddingHorizontal={spacing.md}
        paddingVertical={spacing.sm + spacing.xs}
        gap={spacing.xs}
      >
        <XStack alignItems="center" gap={spacing.xs}>
          <XStack alignItems="center" gap={spacing.xs} flexWrap="wrap" flex={1}>
            <Text.Label
              color="$text"
              fontFamily={FONT_FAMILIES.semibold}
              fontSize={typography.fontSize.caption}
            >
              {name}
            </Text.Label>
            {flag ? <Text.Label fontSize={typography.fontSize.caption}>{flag}</Text.Label> : null}
            <Text.Label color="$textMuted" fontSize={typography.fontSize.caption}>
              {'· ' + timeAgo(comment.created_at, locale)}
            </Text.Label>
          </XStack>
          {onMenu ? (
            <Pressable
              onPress={onMenu}
              accessibilityRole="button"
              accessibilityLabel={t('commentOptions')}
              hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.xs })}
            >
              <Text.Label
                color="$textMuted"
                fontFamily={FONT_FAMILIES.bold}
                fontSize={typography.fontSize.label}
                maxFontSizeMultiplier={1}
              >
                {'⋯'}
              </Text.Label>
            </Pressable>
          ) : null}
        </XStack>
        <Text.Body color="$text" fontSize={typography.fontSize.label}>
          {bodyText}
        </Text.Body>

        {hasTranslation ? (
          <Pressable
            onPress={onToggleOriginal}
            accessibilityRole="button"
            hitSlop={{ top: spacing.xs, bottom: spacing.xs, left: spacing.sm, right: spacing.sm }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text.Label fontSize={typography.fontSize.caption}>
              {viewingTranslation ? (
                <Text.Label color="$textMuted" fontSize={typography.fontSize.caption}>
                  {t('translatedFrom', { language: sourceName }) + ' · '}
                </Text.Label>
              ) : null}
              <Text.Label
                color={palette.primary}
                fontFamily={FONT_FAMILIES.semibold}
                fontSize={typography.fontSize.caption}
              >
                {viewingTranslation ? t('seeOriginal') : t('seeTranslation')}
              </Text.Label>
            </Text.Label>
          </Pressable>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * Comments under the fact detail content. Anonymous read; writing routes
 * through the screen-name claim (ScreenNameModal) on first use. Pages with the
 * backend's keyset cursor via "show more".
 */
function FactCommentsComponent({ factId, categoryColor }: FactCommentsProps) {
  const { t, locale } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, borderWidths, typography, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const [comments, setComments] = useState<ApiComment[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Translations keyed by comment id (foreign comments only), plus a per-comment
  // "show the original instead" toggle. `requestedRef` dedupes in-flight/done
  // translation requests so a comment is only ever sent once per locale.
  const [translations, setTranslations] = useState<Record<number, TranslationEntry>>({});
  const [showOriginal, setShowOriginal] = useState<Record<number, boolean>>({});
  const requestedRef = useRef<Set<number>>(new Set());

  const [screenName, setScreenName] = useState<string | null>(null);
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState('');

  // First page + the viewer's identity, per fact.
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setNextCursor(null);
    setTotal(0);
    setIsLoading(true);
    setLoadError(false);
    setPostError('');
    setTranslations({});
    setShowOriginal({});
    requestedRef.current = new Set();

    api
      .getFactComments(factId, null, PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setComments(page.comments);
        setNextCursor(page.next_cursor);
        setTotal(page.total);
        trackCommentsViewed({
          factId,
          totalCount: page.total,
          hasComments: page.total > 0,
          loadError: false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          trackCommentsViewed({ factId, totalCount: 0, hasComments: false, loadError: true });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    userService
      .getProfile()
      .then((profile) => {
        if (!cancelled) setScreenName(profile?.screenName ?? null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [factId]);

  const retryLoad = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const page = await api.getFactComments(factId, null, PAGE_SIZE);
      setComments(page.comments);
      setNextCursor(page.next_cursor);
      setTotal(page.total);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [factId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await api.getFactComments(factId, nextCursor, PAGE_SIZE);
      setComments((prev) => {
        const next = [...prev, ...page.comments];
        trackCommentsLoadMore({ factId, loadedCount: next.length, totalCount: page.total });
        return next;
      });
      setNextCursor(page.next_cursor);
      setTotal(page.total);
    } catch {
      // keep the current cursor; the user can tap again
    } finally {
      setIsLoadingMore(false);
    }
  }, [factId, nextCursor, isLoadingMore]);

  // One-time community-rules agreement (Apple 1.2 EULA) before the first post.
  const ensureCommentEula = useCallback(async (): Promise<boolean> => {
    try {
      if (await AsyncStorage.getItem(COMMENT_EULA_KEY)) return true;
    } catch {
      // storage unavailable — fall through to the prompt
    }
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        t('commentEulaTitle'),
        t('commentEulaMessage'),
        [
          {
            text: t('cancel'),
            style: 'cancel',
            onPress: () => {
              trackCommentEulaResult({ result: 'cancel', factId });
              resolve(false);
            },
          },
          {
            text: t('commentEulaViewTerms'),
            onPress: () => {
              trackCommentEulaResult({ result: 'view_terms', factId });
              openInAppBrowser(`https://factsaday.com/${locale}/terms`, { theme }).catch(() => {});
              resolve(false);
            },
          },
          {
            text: t('commentEulaAgree'),
            onPress: async () => {
              trackCommentEulaResult({ result: 'agree', factId });
              try {
                await AsyncStorage.setItem(COMMENT_EULA_KEY, '1');
              } catch {
                // best-effort; they'll just be asked again next time
              }
              resolve(true);
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            trackCommentEulaResult({ result: 'cancel', factId });
            resolve(false);
          },
        }
      );
    });
  }, [t, locale, theme, factId]);

  // Per-comment overflow menu: report the comment or block its author (Apple 1.2).
  const handleCommentMenu = useCallback(
    (comment: ApiComment) => {
      Alert.alert(comment.screen_name || t('comments'), undefined, [
        {
          text: t('commentMenuReport'),
          onPress: async () => {
            try {
              await api.reportComment(comment.id);
              trackCommentReported({ commentId: comment.id, factId });
              Alert.alert(t('commentReportDoneTitle'), t('commentReportDoneMessage'));
            } catch {
              Alert.alert(t('error'), t('commentActionFailed'));
            }
          },
        },
        {
          text: t('commentMenuBlock'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.blockCommentAuthor(comment.id);
              trackCommentAuthorBlocked({ commentId: comment.id, factId });
              // Hide their comments from the current list immediately; the feed
              // is block-aware server-side on the next load.
              setComments((prev) => prev.filter((c) => c.screen_name !== comment.screen_name));
            } catch {
              Alert.alert(t('error'), t('commentActionFailed'));
            }
          },
        },
        { text: t('cancel'), style: 'cancel' },
      ]);
    },
    [t, factId]
  );

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body || isPosting) return;
    if (!(await ensureCommentEula())) return;
    setIsPosting(true);
    setPostError('');
    try {
      const created = await api.postFactComment(factId, body, locale);
      setComments((prev) => [created, ...prev]);
      setTotal((n) => n + 1);
      setDraft('');
      trackCommentPosted({ factId, commentId: created.id, bodyLength: body.length, locale });
    } catch (error) {
      const status = (error as any)?.status;
      trackCommentPostFailed({
        factId,
        reason: status === 429 ? 'cooldown' : status === 422 ? 'rejected' : 'error',
        statusCode: typeof status === 'number' ? status : undefined,
      });
      setPostError(
        status === 429
          ? t('commentCooldown')
          : status === 422
            ? t('commentRejected')
            : t('commentPostFailed')
      );
    } finally {
      setIsPosting(false);
    }
  }, [draft, isPosting, factId, locale, t, ensureCommentEula]);

  // Fetch translations for any comments written in a different locale than the
  // reader's. Server-cached per (comment, locale), so this is cheap on repeat;
  // results swap the displayed body in place once they arrive.
  const fetchTranslations = useCallback(
    async (list: ApiComment[]) => {
      const ids = list
        .filter((c) => c.locale && c.locale !== locale && !requestedRef.current.has(c.id))
        .map((c) => c.id);
      if (ids.length === 0) return;
      ids.forEach((id) => requestedRef.current.add(id));
      try {
        const results = await api.translateComments(ids, locale);
        if (results.length === 0) return;
        setTranslations((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.id] = { body: r.body, source_locale: r.source_locale };
          return next;
        });
      } catch {
        // Drop the ids so a later attempt (e.g. a locale switch) can retry them.
        ids.forEach((id) => requestedRef.current.delete(id));
      }
    },
    [locale]
  );

  // Reader switched languages: drop cached translations + the requested set so
  // the effect below re-translates the current list into the new locale.
  useEffect(() => {
    setTranslations({});
    setShowOriginal({});
    requestedRef.current = new Set();
  }, [locale]);

  // Translate whenever the list grows (first page, "show more", a new post) or
  // the locale changes (fetchTranslations identity changes). Dedupe via the ref.
  useEffect(() => {
    void fetchTranslations(comments);
  }, [comments, fetchTranslations]);

  const accent = categoryColor || colors.primary;
  const separatorColor = categoryColor ? `${categoryColor}33` : colors.border;
  const canSend = draft.trim().length > 0 && !isPosting;
  // The send disc sets the composer's rhythm: the input's vertical padding is
  // derived so one line of text is EXACTLY disc-height and dead-centered.
  // (iOS ignores textAlignVertical and pins multiline text to the top inset,
  // so a minHeight-stretched box would leave the text floating high.)
  const sendSize = iconSizes.xl + spacing.md;
  const inputLineHeight = typography.lineHeight.label;
  // Border counts toward the box height, so subtract it: border + pad + line +
  // pad + border === sendSize exactly.
  const inputPadV = Math.max(
    spacing.xs,
    (sendSize - inputLineHeight) / 2 - borderWidths.hairline
  );
  // Bias a touch onto the bottom so the text isn't flush against the rounded
  // base; the send disc still bottom-aligns to the (now slightly taller) box.
  const inputPadBottom = inputPadV + spacing.xs / 2;
  // The paper-plane glyph's mass sits low-left while its tip pulls the eye
  // up-right, so geometric centering reads high-right; nudge it left+down to
  // optically center it inside the disc.
  const sendGlyphNudge = { transform: [{ translateX: -1.5 }, { translateY: 1.5 }] };
  const nearLimit = draft.length >= MAX_COMMENT_LENGTH * 0.8;

  return (
    <View style={{ marginTop: spacing.md }}>
      {/* Separator — same treatment as the RelatedFacts section divider */}
      <View
        style={{
          height: borderWidths.thin,
          backgroundColor: separatorColor,
          marginBottom: spacing.xl,
        }}
      />

      {/* Section header */}
      <XStack alignItems="center" gap={spacing.sm} marginBottom={spacing.md}>
        <MessageCircle size={iconSizes.sm} color={categoryColor || colors.textSecondary} />
        <Text.Body color="$textSecondary" fontFamily={FONT_FAMILIES.bold}>
          {t('comments')}
          {total > 0 ? ` (${total})` : ''}
        </Text.Body>
      </XStack>

      {/* Composer */}
      {screenName ? (
        <YStack gap={spacing.xs} marginBottom={spacing.lg}>
          <XStack alignItems="flex-end" gap={spacing.sm}>
            <TextInput
              maxFontSizeMultiplier={DEFAULT_MAX_FONT_SIZE_MULTIPLIER}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                setPostError('');
              }}
              placeholder={t('commentPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_COMMENT_LENGTH}
              editable={!isPosting}
              style={{
                flex: 1,
                maxHeight: inputLineHeight * 4 + inputPadV * 2,
                backgroundColor: colors.surface,
                borderRadius: Math.min(radius.xl, sendSize / 2),
                borderWidth: borderWidths.hairline,
                borderColor: draft.length > 0 ? `${accent}66` : colors.border,
                paddingHorizontal: spacing.lg,
                paddingTop: inputPadV,
                paddingBottom: inputPadBottom,
                fontSize: typography.fontSize.label,
                lineHeight: inputLineHeight,
                textAlignVertical: 'center',
                color: colors.text,
              }}
            />
            <Pressable
              onPress={submit}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={t('send')}
              accessibilityState={{ disabled: !canSend }}
              hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}
            >
              {canSend || isPosting ? (
                <GradientDisc color={accent} size={sendSize}>
                  {isPosting ? (
                    <ActivityIndicator size="small" color={getContrastColor(accent)} />
                  ) : (
                    <Send size={iconSizes.md} color={getContrastColor(accent)} style={sendGlyphNudge} />
                  )}
                </GradientDisc>
              ) : (
                <View
                  style={{
                    width: sendSize,
                    height: sendSize,
                    borderRadius: sendSize / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surface,
                    borderWidth: borderWidths.hairline,
                    borderColor: colors.border,
                  }}
                >
                  <Send size={iconSizes.md} color={colors.textMuted} style={sendGlyphNudge} />
                </View>
              )}
            </Pressable>
          </XStack>
          {postError ? (
            <Text.Label color={colors.error} fontSize={typography.fontSize.caption}>
              {postError}
            </Text.Label>
          ) : nearLimit ? (
            <Text.Label
              color={draft.length >= MAX_COMMENT_LENGTH ? colors.error : colors.textMuted}
              fontSize={typography.fontSize.caption}
              alignSelf="flex-end"
            >
              {`${draft.length}/${MAX_COMMENT_LENGTH}`}
            </Text.Label>
          ) : null}
        </YStack>
      ) : (
        <Pressable
          onPress={() => {
            trackCommentJoinCtaTapped({ factId });
            setNamePromptVisible(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            backgroundColor: colors.cardBackground,
            borderRadius: radius.lg,
            borderWidth: borderWidths.hairline,
            borderColor: colors.border,
            padding: spacing.md,
            marginBottom: spacing.lg,
          })}
        >
          <XStack alignItems="center" gap={spacing.md}>
            <GradientDisc color={accent} size={sendSize}>
              <MessageCircle size={iconSizes.md} color={getContrastColor(accent)} />
            </GradientDisc>
            <Text.Label
              color="$text"
              fontFamily={FONT_FAMILIES.semibold}
              fontSize={typography.fontSize.label}
              flex={1}
            >
              {t('joinConversation')}
            </Text.Label>
            <ChevronRight size={iconSizes.sm} color={colors.textMuted} />
          </XStack>
        </Pressable>
      )}

      {/* Comment list */}
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : loadError ? (
        // A failed first-page load must read as an error with a retry — not as
        // the empty state, which is indistinguishable from a genuinely empty thread.
        <YStack alignItems="center" gap={spacing.sm} paddingVertical={spacing.lg}>
          <MessageCircle size={iconSizes.lg} color={colors.textMuted} opacity={0.6} />
          <Text.Label color="$textMuted" fontSize={typography.fontSize.caption}>
            {t('commentsLoadFailed')}
          </Text.Label>
          <Pressable
            onPress={retryLoad}
            accessibilityRole="button"
            accessibilityLabel={t('tryAgain')}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              marginTop: spacing.xs,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radius.full,
              borderWidth: borderWidths.hairline,
              borderColor: `${accent}55`,
              backgroundColor: `${accent}14`,
            })}
          >
            <Text.Label
              color={accent}
              fontFamily={FONT_FAMILIES.semibold}
              fontSize={typography.fontSize.caption}
            >
              {t('tryAgain')}
            </Text.Label>
          </Pressable>
        </YStack>
      ) : comments.length === 0 ? (
        <YStack alignItems="center" gap={spacing.sm} paddingVertical={spacing.lg}>
          <MessageCircle size={iconSizes.lg} color={colors.textMuted} opacity={0.6} />
          <Text.Label color="$textMuted" fontSize={typography.fontSize.caption}>
            {t('commentsEmpty')}
          </Text.Label>
        </YStack>
      ) : (
        <YStack gap={spacing.md}>
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              locale={locale}
              translation={translations[comment.id]}
              showOriginal={!!showOriginal[comment.id]}
              onToggleOriginal={() =>
                setShowOriginal((prev) => ({ ...prev, [comment.id]: !prev[comment.id] }))
              }
              onMenu={
                // Report/block both require identity and can't target yourself,
                // so only offer the ⋯ menu to a signed-in viewer on someone
                // else's comment.
                screenName && comment.screen_name !== screenName
                  ? () => handleCommentMenu(comment)
                  : undefined
              }
            />
          ))}
          {nextCursor ? (
            <Pressable
              onPress={loadMore}
              disabled={isLoadingMore}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoadingMore }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                alignSelf: 'center',
                marginTop: spacing.xs,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radius.full,
                borderWidth: borderWidths.hairline,
                borderColor: `${accent}55`,
                backgroundColor: `${accent}14`,
              })}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text.Label
                  color={accent}
                  fontFamily={FONT_FAMILIES.semibold}
                  fontSize={typography.fontSize.caption}
                >
                  {t('showMoreComments')}
                </Text.Label>
              )}
            </Pressable>
          ) : null}
        </YStack>
      )}

      <ScreenNameModal
        visible={namePromptVisible}
        onClose={() => setNamePromptVisible(false)}
        onSaved={(name) => setScreenName(name)}
        currentName={null}
        source="comments"
        // Mounted inside the scrolling fact-detail comments section, not at the
        // screen root — present in a window-level Modal so the iOS overlay
        // covers the screen instead of being clamped to this section's box.
        presentInWindow
      />
    </View>
  );
}

export const FactComments = React.memo(FactCommentsComponent);
