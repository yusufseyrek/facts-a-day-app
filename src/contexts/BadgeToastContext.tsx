import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRouter } from 'expo-router';

import { useTranslation } from '../i18n';
import {
  type NewlyEarnedBadge,
  consumePendingBadgeToasts,
  isModalScreenActive,
} from '../services/badges';
import { BadgeUnlockToast } from '../components/badges/BadgeUnlockToast';

const POLL_INTERVAL = 500;

export function BadgeToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [current, setCurrent] = useState<NewlyEarnedBadge | null>(null);
  const queueRef = useRef<NewlyEarnedBadge[]>([]);
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    if (queueRef.current.length > 0) {
      showingRef.current = true;
      setCurrent(queueRef.current.shift()!);
    } else {
      showingRef.current = false;
      setCurrent(null);
    }
  }, []);

  // Poll for pending badge toasts — only show when no modal is active
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;

      // Always consume from the service queue into our local queue
      const pending = consumePendingBadgeToasts();
      if (pending.length > 0) {
        console.log(`🏅 [BadgeToast] Consumed ${pending.length} pending toasts`);
        queueRef.current.push(...pending);
      }

      // Only display when no modal screen is active and not already showing
      if (!showingRef.current && !isModalScreenActive() && queueRef.current.length > 0) {
        showNext();
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [showNext]);

  const handleHide = useCallback(() => {
    showingRef.current = false;
    setCurrent(null);
    // Show next after a short delay
    setTimeout(() => {
      if (!isModalScreenActive() && queueRef.current.length > 0) {
        showNext();
      }
    }, 400);
  }, [showNext]);

  const badge = current
    ? {
        badgeId: current.definition.id,
        name: t(`badge_${current.definition.id}` as any),
        star: current.star,
      }
    : null;

  return (
    <>
      {children}
      <BadgeUnlockToast badge={badge} onHide={handleHide} onPress={() => router.push('/badges')} />
    </>
  );
}
