import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { SatisfactionModal } from '../components/SatisfactionModal';
import { useTranslation } from '../i18n';
import {
  hasPendingSatisfactionPrompt,
  openFeedbackEmail,
  recordReviewPromptShown,
  recordSatisfactionPromptShown,
  requestReview,
} from '../services/appReview';
import { isModalScreenActive } from '../services/badges';
import { useTheme } from '../theme/ThemeProvider';

const POLL_INTERVAL = 500;

export function ReviewPromptProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [visible, setVisible] = useState(false);
  const showingRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (showingRef.current) return;
      if (isModalScreenActive()) return;

      if (hasPendingSatisfactionPrompt()) {
        showingRef.current = true;
        setVisible(true);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const hide = useCallback(() => {
    showingRef.current = false;
    setVisible(false);
  }, []);

  const handleLoveIt = useCallback(async () => {
    hide();
    // Small delay to let the modal dismiss before showing native review
    setTimeout(async () => {
      const shown = await requestReview();
      if (!shown) {
        // requestReview already records, but if it failed entirely, still record
        await recordReviewPromptShown();
      }
    }, 300);
  }, [hide]);

  const handleNotReally = useCallback(async () => {
    hide();
    await recordSatisfactionPromptShown();
    await openFeedbackEmail();
  }, [hide]);

  const handleDismiss = useCallback(async () => {
    hide();
    await recordSatisfactionPromptShown();
  }, [hide]);

  return (
    <>
      {children}
      <SatisfactionModal
        visible={visible}
        onLoveIt={handleLoveIt}
        onNotReally={handleNotReally}
        onDismiss={handleDismiss}
        isDark={isDark}
        title={t('satisfactionTitle', { appName: t('appName') })}
        subtitle={t('satisfactionSubtitle')}
        loveItText={t('satisfactionLoveIt')}
        notReallyText={t('satisfactionNotReally')}
      />
    </>
  );
}
