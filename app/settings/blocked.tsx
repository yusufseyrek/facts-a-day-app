import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ScreenContainer, Text } from '../../src/components';
import { ArrowLeft } from '../../src/components/icons';
import { XStack, YStack } from '../../src/components/Stacks';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView, trackUserUnblocked } from '../../src/services/analytics';
import * as api from '../../src/services/api';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

/**
 * Manage blocked users (Apple 1.2): list the people this user has blocked and
 * let them unblock. Reached from Settings → Account → Blocked users.
 */
export default function BlockedUsersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, iconSizes, borderWidths } = useResponsive();
  const colors = hexColors[theme];

  const [blocked, setBlocked] = useState<api.BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBlocked(await api.getBlockedUsers());
    } catch {
      setBlocked([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    trackScreenView(Screens.BLOCKED_USERS);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnblock = useCallback(
    (u: api.BlockedUser) => {
      Alert.alert(t('unblockConfirmTitle', { name: u.screen_name }), t('unblockConfirmMessage'), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('unblock'),
          onPress: async () => {
            setBusyId(u.user_id);
            try {
              await api.unblockUser(u.user_id);
              setBlocked((prev) => {
                const next = prev.filter((b) => b.user_id !== u.user_id);
                trackUserUnblocked({
                  source: 'blocked_list',
                  remainingBlockedCount: next.length,
                });
                return next;
              });
            } catch {
              Alert.alert(t('error'), t('commentActionFailed'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [t]
  );

  return (
    <ScreenContainer>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack flex={1} padding={spacing.lg} gap={spacing.lg}>
        <XStack alignItems="center" gap={spacing.sm}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
          >
            <ArrowLeft size={iconSizes.lg} color={colors.text} />
          </Pressable>
          <Text.Headline>{t('blockedUsers')}</Text.Headline>
        </XStack>

        {loading ? (
          <YStack flex={1} justifyContent="center" alignItems="center">
            <ActivityIndicator size="large" color={colors.primary} />
          </YStack>
        ) : blocked.length === 0 ? (
          <YStack flex={1} justifyContent="center" alignItems="center" paddingHorizontal={spacing.xl}>
            <Text.Body color="$textSecondary" textAlign="center">
              {t('blockedUsersEmpty')}
            </Text.Body>
          </YStack>
        ) : (
          <YStack gap={spacing.sm}>
            {blocked.map((u) => (
              <XStack
                key={u.user_id}
                alignItems="center"
                justifyContent="space-between"
                gap={spacing.md}
                backgroundColor="$cardBackground"
                borderRadius={radius.lg}
                borderWidth={borderWidths.hairline}
                borderColor="$border"
                paddingHorizontal={spacing.lg}
                paddingVertical={spacing.md}
              >
                <Text.Label color="$text" numberOfLines={1} flexShrink={1}>
                  {u.screen_name}
                </Text.Label>
                <Pressable
                  onPress={() => handleUnblock(u)}
                  disabled={busyId === u.user_id}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    opacity: pressed || busyId === u.user_id ? 0.6 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.full,
                    borderWidth: borderWidths.hairline,
                    borderColor: colors.primary,
                  })}
                >
                  {busyId === u.user_id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text.Label color={colors.primary}>{t('unblock')}</Text.Label>
                  )}
                </Pressable>
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
    </ScreenContainer>
  );
}
