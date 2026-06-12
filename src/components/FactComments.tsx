import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { useTranslation } from '../i18n';
import * as api from '../services/api';
import * as userService from '../services/user';
import { hexColors, useTheme } from '../theme';
import { darkenColor, getContrastColor } from '../utils/colors';
import { countryFlagEmoji } from '../utils/countryFlag';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { useResponsive } from '../utils/useResponsive';

import { ChevronRight, MessageCircle, Send } from './icons';
import { ScreenNameModal } from './ScreenNameModal';
import { XStack, YStack } from './Stacks';
import { FONT_FAMILIES, Text } from './Typography';

import type { ApiComment } from '../services/api';

interface FactCommentsProps {
  factId: number;
  /** Category accent for the section separator, matching RelatedFacts. */
  categoryColor: string | null;
}

const PAGE_SIZE = 10;
const MAX_COMMENT_LENGTH = 500;

/** "5m" / "3h" style relative age; falls back to a localized date. */
function timeAgo(createdAt: string, locale: string): string {
  try {
    // SQLite CURRENT_TIMESTAMP is UTC space-form without a marker; normalize
    // like FactModal.formatLastUpdated so the device offset is applied.
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(createdAt)
      ? createdAt
      : createdAt.replace(' ', 'T') + 'Z';
    const then = new Date(normalized).getTime();
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' });
    if (seconds < 60) return rtf.format(-seconds, 'second');
    if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
    if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
    if (seconds < 86400 * 30) return rtf.format(-Math.floor(seconds / 86400), 'day');
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

function CommentRow({ comment, locale }: { comment: ApiComment; locale: string }) {
  const { theme } = useTheme();
  const { spacing, radius, borderWidths, typography, iconSizes } = useResponsive();
  const palette = hexColors[theme];
  const flag = countryFlagEmoji(comment.country_code);

  const name = comment.screen_name || '?';
  const accent = avatarColor(name, palette);
  const avatarSize = iconSizes.xl + spacing.xs;

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
        <XStack alignItems="center" gap={spacing.xs} flexWrap="wrap">
          <Text.Label
            color="$text"
            fontFamily={FONT_FAMILIES.semibold}
            fontSize={typography.fontSize.caption}
          >
            {comment.screen_name}
          </Text.Label>
          {flag ? <Text.Label fontSize={typography.fontSize.caption}>{flag}</Text.Label> : null}
          <Text.Label color="$textMuted" fontSize={typography.fontSize.caption}>
            {'· ' + timeAgo(comment.created_at, locale)}
          </Text.Label>
        </XStack>
        <Text.Body color="$text" fontSize={typography.fontSize.label}>
          {comment.body}
        </Text.Body>
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
    setPostError('');

    api
      .getFactComments(factId, null, PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setComments(page.comments);
        setNextCursor(page.next_cursor);
        setTotal(page.total);
      })
      .catch(() => {})
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

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await api.getFactComments(factId, nextCursor, PAGE_SIZE);
      setComments((prev) => [...prev, ...page.comments]);
      setNextCursor(page.next_cursor);
      setTotal(page.total);
    } catch {
      // keep the current cursor; the user can tap again
    } finally {
      setIsLoadingMore(false);
    }
  }, [factId, nextCursor, isLoadingMore]);

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body || isPosting) return;
    setIsPosting(true);
    setPostError('');
    try {
      const created = await api.postFactComment(factId, body, locale);
      setComments((prev) => [created, ...prev]);
      setTotal((n) => n + 1);
      setDraft('');
    } catch (error) {
      const status = (error as any)?.status;
      setPostError(status === 429 ? t('commentCooldown') : t('commentPostFailed'));
    } finally {
      setIsPosting(false);
    }
  }, [draft, isPosting, factId, locale, t]);

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
                maxHeight: 120,
                backgroundColor: colors.surface,
                borderRadius: Math.min(radius.xl, sendSize / 2),
                borderWidth: borderWidths.hairline,
                borderColor: draft.length > 0 ? `${accent}66` : colors.border,
                paddingHorizontal: spacing.lg,
                paddingTop: inputPadV,
                paddingBottom: inputPadV,
                fontSize: typography.fontSize.label,
                lineHeight: inputLineHeight,
                textAlignVertical: 'center',
                color: colors.text,
              }}
            />
            <Pressable
              onPress={submit}
              disabled={!canSend}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                    <Send size={iconSizes.md} color={getContrastColor(accent)} />
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
                  <Send size={iconSizes.md} color={colors.textMuted} />
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
          onPress={() => setNamePromptVisible(true)}
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
            <CommentRow key={comment.id} comment={comment} locale={locale} />
          ))}
          {nextCursor ? (
            <Pressable
              onPress={loadMore}
              disabled={isLoadingMore}
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
      />
    </View>
  );
}

export const FactComments = React.memo(FactCommentsComponent);
