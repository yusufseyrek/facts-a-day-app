import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

import { markFeedRefreshPending } from '../services/contentRefresh';
import * as onboardingService from '../services/onboarding';

import type { SupportedLocale } from '../i18n';

interface OnboardingState {
  // User selections
  selectedCategories: string[];
  notificationTimes: Date[];

  // Onboarding completion status (null = loading, false = incomplete, true = complete)
  isOnboardingComplete: boolean | null;

  // Initialization state
  isInitialized: boolean;
  isInitializing: boolean;
  initializationError: string | null;

  // Facts download state
  isDownloadingFacts: boolean;
  downloadProgress: {
    downloaded: number;
    total: number;
    percentage: number;
  } | null;
  downloadError: string | null;
}

interface OnboardingContextType extends OnboardingState {
  // Selection methods
  setSelectedCategories: (categories: string[] | ((prev: string[]) => string[])) => void;
  setNotificationTimes: (times: Date[]) => void;
  addNotificationTime: (time: Date) => void;
  removeNotificationTime: (index: number) => void;

  // Initialization
  initializeOnboarding: (locale: SupportedLocale) => Promise<boolean>;
  retryInitialization: () => Promise<boolean>;

  // Facts download
  downloadFacts: (locale: SupportedLocale) => Promise<boolean>;
  waitForDownloadComplete: () => Promise<void>;

  // Complete onboarding
  completeOnboarding: () => Promise<void>;

  // Set onboarding completion status
  setIsOnboardingComplete: (complete: boolean) => void;

  // Reset
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

interface OnboardingProviderProps {
  children: React.ReactNode;
  initialComplete?: boolean | null;
}

export function OnboardingProvider({ children, initialComplete = null }: OnboardingProviderProps) {
  const [state, setState] = useState<OnboardingState>({
    selectedCategories: [],
    notificationTimes: [
      (() => {
        const defaultTime = new Date();
        defaultTime.setHours(9, 0, 0, 0);
        return defaultTime;
      })(),
    ],
    isOnboardingComplete: initialComplete,
    isInitialized: false,
    isInitializing: false,
    initializationError: null,
    isDownloadingFacts: false,
    downloadProgress: null,
    downloadError: null,
  });

  const [lastLocaleUsed, setLastLocaleUsed] = useState<SupportedLocale | null>(null);

  // Promise-based download completion tracking (replaces polling)
  const downloadCompleteRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  // ===== Selection Methods =====

  const setSelectedCategories = useCallback(
    (categories: string[] | ((prev: string[]) => string[])) => {
      setState((prev) => ({
        ...prev,
        selectedCategories:
          typeof categories === 'function' ? categories(prev.selectedCategories) : categories,
      }));
    },
    []
  );

  const setNotificationTimes = useCallback((times: Date[]) => {
    setState((prev) => ({ ...prev, notificationTimes: times }));
  }, []);

  const addNotificationTime = useCallback((time: Date) => {
    setState((prev) => ({
      ...prev,
      notificationTimes: [...prev.notificationTimes, time],
    }));
  }, []);

  const removeNotificationTime = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      notificationTimes: prev.notificationTimes.filter((_, i) => i !== index),
    }));
  }, []);

  const setIsOnboardingComplete = useCallback((complete: boolean) => {
    setState((prev) => ({ ...prev, isOnboardingComplete: complete }));
  }, []);

  // ===== Initialization =====

  const initializeOnboarding = useCallback(async (locale: SupportedLocale): Promise<boolean> => {
    setState((prev) => ({
      ...prev,
      isInitializing: true,
      initializationError: null,
    }));

    setLastLocaleUsed(locale);

    try {
      const result = await onboardingService.initializeOnboarding(locale);

      if (result.success) {
        setState((prev) => ({
          ...prev,
          isInitialized: true,
          isInitializing: false,
          initializationError: null,
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          isInitializing: false,
          initializationError: result.error || 'Failed to initialize',
        }));
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setState((prev) => ({
        ...prev,
        isInitializing: false,
        initializationError: errorMessage,
      }));
      return false;
    }
  }, []);

  const retryInitialization = useCallback(async (): Promise<boolean> => {
    if (!lastLocaleUsed) {
      console.error('Cannot retry initialization: no locale was used');
      return false;
    }
    return initializeOnboarding(lastLocaleUsed);
  }, [lastLocaleUsed, initializeOnboarding]);

  // ===== Facts Download =====

  const downloadFacts = useCallback(
    async (locale: SupportedLocale): Promise<boolean> => {
      if (state.selectedCategories.length === 0) {
        console.error('Cannot download facts: no categories selected');
        return false;
      }

      // Create a promise that waitForDownloadComplete can await
      let resolveDownload: () => void;
      let rejectDownload: (error: Error) => void;
      const promise = new Promise<void>((res, rej) => {
        resolveDownload = res;
        rejectDownload = rej;
      });
      downloadCompleteRef.current = { promise, resolve: resolveDownload!, reject: rejectDownload! };

      setState((prev) => ({
        ...prev,
        isDownloadingFacts: true,
        downloadProgress: null,
        downloadError: null,
      }));

      try {
        const result = await onboardingService.fetchAllFacts(
          locale,
          state.selectedCategories,
          (progress) => {
            setState((prev) => ({
              ...prev,
              downloadProgress: progress,
            }));
          }
        );

        if (result.success) {
          // Signal home screen to force-refresh on next focus
          markFeedRefreshPending();
          setState((prev) => ({
            ...prev,
            isDownloadingFacts: false,
            downloadProgress: {
              downloaded: result.count || 0,
              total: result.count || 0,
              percentage: 100,
            },
            downloadError: null,
          }));
          downloadCompleteRef.current?.resolve();
          return true;
        } else {
          const errorMsg = result.error || 'Failed to download facts';
          setState((prev) => ({
            ...prev,
            isDownloadingFacts: false,
            downloadError: errorMsg,
          }));
          downloadCompleteRef.current?.reject(new Error(errorMsg));
          return false;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setState((prev) => ({
          ...prev,
          isDownloadingFacts: false,
          downloadError: errorMessage,
        }));
        downloadCompleteRef.current?.reject(new Error(errorMessage));
        return false;
      }
    },
    [state.selectedCategories]
  );

  const waitForDownloadComplete = useCallback(async (): Promise<void> => {
    // If a download promise exists, await it
    if (downloadCompleteRef.current) {
      return downloadCompleteRef.current.promise;
    }
    // No download in progress or already completed
    if (state.downloadError) {
      throw new Error(state.downloadError);
    }
  }, [state.downloadError]);

  // ===== Complete Onboarding =====

  const completeOnboarding = useCallback(async (): Promise<void> => {
    try {
      await onboardingService.completeOnboarding({
        selectedCategories: state.selectedCategories,
        notificationTimes: state.notificationTimes,
      });

      // Update local state immediately (synchronous) to prevent navigation race condition
      setState((prev) => ({ ...prev, isOnboardingComplete: true }));

      if (__DEV__) console.log('Onboarding completed successfully');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  }, [state.selectedCategories, state.notificationTimes]);

  // ===== Reset =====

  const resetOnboarding = useCallback(async (): Promise<void> => {
    try {
      await onboardingService.resetOnboarding();

      // Reset state
      setState({
        selectedCategories: [],
        notificationTimes: [
          (() => {
            const defaultTime = new Date();
            defaultTime.setHours(9, 0, 0, 0);
            return defaultTime;
          })(),
        ],
        isOnboardingComplete: false,
        isInitialized: false,
        isInitializing: false,
        initializationError: null,
        isDownloadingFacts: false,
        downloadProgress: null,
        downloadError: null,
      });

      setLastLocaleUsed(null);

      if (__DEV__) console.log('Onboarding state reset successfully');
    } catch (error) {
      console.error('Error resetting onboarding:', error);
      throw error;
    }
  }, []);

  const value: OnboardingContextType = {
    ...state,
    setSelectedCategories,
    setNotificationTimes,
    addNotificationTime,
    removeNotificationTime,
    setIsOnboardingComplete,
    initializeOnboarding,
    retryInitialization,
    downloadFacts,
    waitForDownloadComplete,
    completeOnboarding,
    resetOnboarding,
  };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
