import React, { createContext, useContext, useState, useCallback } from 'react';
import * as Localization from 'expo-localization';
import { i18n, getLocaleFromCode } from './config';
import { SupportedLocale, TranslationKeys } from './translations';

interface I18nContextType {
  locale: SupportedLocale;
  t: (key: TranslationKeys, options?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/**
 * Get the current device locale from system settings.
 * This respects per-app language selection on iOS 13+ and Android 13+.
 */
export const getDeviceLocale = (): SupportedLocale => {
  const deviceLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  return getLocaleFromCode(deviceLanguage);
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Initialize with the device's current locale (respects per-app language settings)
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    const deviceLocale = getDeviceLocale();
    i18n.locale = deviceLocale;
    return deviceLocale;
  });

  const t = useCallback(
    (key: TranslationKeys, options?: Record<string, string | number>): string => {
      return i18n.t(key, options);
    },
    [locale]
  );

  // Sync locale when device locale changes (e.g., app comes to foreground)
  // Content refresh is handled separately by the layout
  React.useEffect(() => {
    const deviceLocale = getDeviceLocale();
    if (deviceLocale !== locale) {
      i18n.locale = deviceLocale;
      setLocaleState(deviceLocale);
    }
  });

  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  return context;
}
