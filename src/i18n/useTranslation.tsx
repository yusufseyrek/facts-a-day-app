import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n, getLocaleFromCode } from './config';
import { SupportedLocale, TranslationKeys } from './translations';

const LOCALE_STORAGE_KEY = '@app_locale';

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  t: (key: TranslationKeys) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    return getLocaleFromCode(i18n.locale);
  });

  const setLocale = useCallback(async (newLocale: SupportedLocale) => {
    i18n.locale = newLocale;
    setLocaleState(newLocale);
    try {
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch (error) {
      console.warn('Failed to save locale:', error);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKeys): string => {
      return i18n.t(key);
    },
    [locale]
  );

  // Load saved locale on mount
  React.useEffect(() => {
    const loadLocale = async () => {
      try {
        const savedLocale = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
        const validLocales: SupportedLocale[] = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'tr', 'zh'];
        if (savedLocale && validLocales.includes(savedLocale as SupportedLocale)) {
          await setLocale(savedLocale as SupportedLocale);
        }
      } catch (error) {
        console.warn('Failed to load locale:', error);
      }
    };
    loadLocale();
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
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
