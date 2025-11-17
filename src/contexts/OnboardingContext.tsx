import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { SupportedLocale } from "../i18n";
import * as onboardingService from "../services/onboarding";

interface OnboardingState {
  // User selections
  selectedCategories: string[];
  notificationTimes: Date[];

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
  setSelectedCategories: (categories: string[]) => void;
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

  // Reset
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [state, setState] = useState<OnboardingState>({
    selectedCategories: [],
    notificationTimes: [(() => {
      const defaultTime = new Date();
      defaultTime.setHours(9, 0, 0, 0);
      return defaultTime;
    })()],
    isInitialized: false,
    isInitializing: false,
    initializationError: null,
    isDownloadingFacts: false,
    downloadProgress: null,
    downloadError: null,
  });

  const [lastLocaleUsed, setLastLocaleUsed] = useState<SupportedLocale | null>(
    null
  );

  // ===== Selection Methods =====

  const setSelectedCategories = useCallback((categories: string[]) => {
    setState((prev) => ({ ...prev, selectedCategories: categories }));
  }, []);

  const setNotificationTimes = useCallback((times: Date[]) => {
    setState((prev) => ({ ...prev, notificationTimes: times }));
  }, []);

  const addNotificationTime = useCallback((time: Date) => {
    setState((prev) => ({
      ...prev,
      notificationTimes: [...prev.notificationTimes, time]
    }));
  }, []);

  const removeNotificationTime = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      notificationTimes: prev.notificationTimes.filter((_, i) => i !== index)
    }));
  }, []);

  // ===== Initialization =====

  const initializeOnboarding = useCallback(
    async (locale: SupportedLocale): Promise<boolean> => {
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
            initializationError: result.error || "Failed to initialize",
          }));
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setState((prev) => ({
          ...prev,
          isInitializing: false,
          initializationError: errorMessage,
        }));
        return false;
      }
    },
    []
  );

  const retryInitialization = useCallback(async (): Promise<boolean> => {
    if (!lastLocaleUsed) {
      console.error("Cannot retry initialization: no locale was used");
      return false;
    }
    return initializeOnboarding(lastLocaleUsed);
  }, [lastLocaleUsed, initializeOnboarding]);

  // ===== Facts Download =====

  const downloadFacts = useCallback(
    async (locale: SupportedLocale): Promise<boolean> => {
      if (state.selectedCategories.length === 0) {
        console.error("Cannot download facts: no categories selected");
        return false;
      }

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
          return true;
        } else {
          setState((prev) => ({
            ...prev,
            isDownloadingFacts: false,
            downloadError: result.error || "Failed to download facts",
          }));
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setState((prev) => ({
          ...prev,
          isDownloadingFacts: false,
          downloadError: errorMessage,
        }));
        return false;
      }
    },
    [state.selectedCategories]
  );

  const waitForDownloadComplete = useCallback(async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // If not downloading, check for errors and return immediately
      if (!state.isDownloadingFacts) {
        if (state.downloadError) {
          reject(new Error(state.downloadError));
        } else {
          resolve();
        }
        return;
      }

      // Poll every 100ms until download completes
      const checkInterval = setInterval(() => {
        setState((currentState) => {
          if (!currentState.isDownloadingFacts) {
            clearInterval(checkInterval);
            if (currentState.downloadError) {
              reject(new Error(currentState.downloadError));
            } else {
              resolve();
            }
          }
          return currentState;
        });
      }, 100);
    });
  }, [state.isDownloadingFacts, state.downloadError]);

  // ===== Complete Onboarding =====

  const completeOnboarding = useCallback(async (): Promise<void> => {
    try {
      await onboardingService.completeOnboarding({
        selectedCategories: state.selectedCategories,
        notificationTimes: state.notificationTimes,
      });

      console.log("Onboarding completed successfully");
    } catch (error) {
      console.error("Error completing onboarding:", error);
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
        notificationTimes: [(() => {
          const defaultTime = new Date();
          defaultTime.setHours(9, 0, 0, 0);
          return defaultTime;
        })()],
        isInitialized: false,
        isInitializing: false,
        initializationError: null,
        isDownloadingFacts: false,
        downloadProgress: null,
        downloadError: null,
      });

      setLastLocaleUsed(null);

      console.log("Onboarding state reset successfully");
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      throw error;
    }
  }, []);

  const value: OnboardingContextType = {
    ...state,
    setSelectedCategories,
    setNotificationTimes,
    addNotificationTime,
    removeNotificationTime,
    initializeOnboarding,
    retryInitialization,
    downloadFacts,
    waitForDownloadComplete,
    completeOnboarding,
    resetOnboarding,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
