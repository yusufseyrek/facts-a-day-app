import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { Pressable } from 'react-native';

import * as Haptics from 'expo-haptics';

import { BottomSheet } from '../components/BottomSheet';
import { Check, ListPlus } from '../components/icons';
import { XStack, YStack } from '../components/Stacks';
import { Text } from '../components/Typography';
import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { useAudioQueue } from './AudioQueueContext';

import type { FactWithRelations } from '../services/database';

/**
 * App-wide long-press menu for fact cards. Long-pressing any audio-bearing fact
 * card opens a single shared bottom sheet (mounted once near the root, like the
 * persistent mini-player) whose action adds that fact to the play queue — the
 * lightweight, no-native-rebuild stand-in for the iOS peek / Android popup
 * context menu, reusing the project's own BottomSheet rather than a native
 * menu dependency.
 *
 * Cards call useFactCardMenu() and pass the resulting openFactMenu to their
 * Pressable's onLongPress. Only attach it when the fact actually has audio
 * (de/ko/tr facts never do), so the menu never opens with a dead-end action.
 */

type OpenFactMenu = (fact: FactWithRelations) => void;

const FactCardMenuContext = createContext<OpenFactMenu>(() => {});

export const useFactCardMenu = () => useContext(FactCardMenuContext);

export function FactCardMenuProvider({ children }: { children: ReactNode }) {
  // The fact is kept across closes (only ever read while the sheet is mounted),
  // so we never null it mid-exit and blank the closing card.
  const [fact, setFact] = useState<FactWithRelations | null>(null);
  const [visible, setVisible] = useState(false);

  const openFactMenu = useCallback<OpenFactMenu>((next) => {
    setFact(next);
    setVisible(true);
    // A firm tap on open mimics the native long-press context-menu "pop".
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const close = useCallback(() => setVisible(false), []);

  return (
    <FactCardMenuContext.Provider value={openFactMenu}>
      {children}
      <BottomSheet visible={visible} onClose={close}>
        {fact && <FactCardMenuBody fact={fact} onClose={close} />}
      </BottomSheet>
    </FactCardMenuContext.Provider>
  );
}

function FactCardMenuBody({ fact, onClose }: { fact: FactWithRelations; onClose: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const { enqueue, isQueued } = useAudioQueue();

  const queued = isQueued(fact.id);

  const handleAddToQueue = useCallback(() => {
    if (queued || !fact.audio_url) {
      onClose();
      return;
    }
    // Same QueueTrack shape the fact-detail audio button builds (FactActions).
    const categoryLabel =
      fact.categoryData?.name ?? (typeof fact.category === 'string' ? fact.category : undefined);
    enqueue({
      factId: fact.id,
      title: fact.title || fact.content.substring(0, 60),
      audioUrl: fact.audio_url,
      language: fact.language || 'en',
      category: categoryLabel,
      imageUrl: fact.image_url ?? undefined,
    });
    // enqueue() fires no haptic of its own — callers own the tactile feedback.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  }, [queued, fact, enqueue, onClose]);

  return (
    <YStack paddingHorizontal={spacing.lg} paddingTop={spacing.xs} paddingBottom={spacing.xs}>
      {/* The pressed fact's title heads the sheet so it reads as that card's menu. */}
      <Text.Caption color={colors.textMuted} numberOfLines={2} marginBottom={spacing.sm}>
        {fact.title}
      </Text.Caption>

      <Pressable
        onPress={handleAddToQueue}
        accessibilityRole="button"
        aria-label={queued ? t('playerAlreadyQueued') : t('playerAddToQueue')}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <XStack alignItems="center" gap={spacing.md} paddingVertical={spacing.md}>
          {queued ? (
            <Check size={iconSizes.md} color={colors.textSecondary} />
          ) : (
            <ListPlus size={iconSizes.md} color={colors.primary} />
          )}
          <Text.Body color={queued ? colors.textSecondary : colors.text}>
            {queued ? t('playerAlreadyQueued') : t('playerAddToQueue')}
          </Text.Body>
        </XStack>
      </Pressable>
    </YStack>
  );
}
