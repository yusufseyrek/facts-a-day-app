import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

import * as Haptics from 'expo-haptics';

import { Check, ListPlus } from '../components/icons';
import { SuccessToast } from '../components/SuccessToast';
import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { useAudioQueue } from './AudioQueueContext';

import type { FactWithRelations } from '../services/database';

/**
 * App-wide "add this fact to the play queue" long-press action for fact cards.
 * The action used to open a single-item bottom sheet; since its only choice was
 * "add to queue", long-pressing now performs that directly and confirms with a
 * brief toast (mounted once near the root, like the persistent mini-player) — no
 * menu to dismiss.
 *
 * Cards call useFactCardMenu() and pass the resulting handler to their
 * Pressable's onLongPress. Only attach it when the fact actually has audio
 * (de/ko/tr facts never do), so the action never runs on a queue-less fact.
 */

type AddFactToQueue = (fact: FactWithRelations) => void;

const FactCardMenuContext = createContext<AddFactToQueue>(() => {});

export const useFactCardMenu = () => useContext(FactCardMenuContext);

interface QueueToast {
  message: string;
  /** Already in the queue → show a neutral check instead of the add icon. */
  already: boolean;
  /** Bumped per trigger so re-pressing remounts the toast (fresh timer + pop). */
  key: number;
}

export function FactCardMenuProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const { enqueue, isQueued } = useAudioQueue();

  const [toast, setToast] = useState<QueueToast | null>(null);
  const keyRef = useRef(0);

  const addFactToQueue = useCallback<AddFactToQueue>(
    (fact) => {
      if (!fact.audio_url) return;
      const already = isQueued(fact.id);
      if (!already) {
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
      }
      // A firm tap confirms the long-press landed (mirrors the old menu "pop").
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      keyRef.current += 1;
      setToast({
        message: already ? t('playerAlreadyQueued') : t('playerAddedToast'),
        already,
        key: keyRef.current,
      });
    },
    [enqueue, isQueued, t]
  );

  return (
    <FactCardMenuContext.Provider value={addFactToQueue}>
      {children}
      {toast && (
        <SuccessToast
          key={toast.key}
          visible
          message={toast.message}
          icon={
            toast.already ? (
              <Check size={iconSizes.xl} color={colors.textSecondary} />
            ) : (
              <ListPlus size={iconSizes.xl} color={colors.primary} />
            )
          }
          onHide={() => setToast(null)}
        />
      )}
    </FactCardMenuContext.Provider>
  );
}
