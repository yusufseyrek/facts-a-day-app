import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import { translations, SupportedLocale } from './translations';

// Initialize i18n
const i18n = new I18n(translations);

// Set the locale once at the beginning of your app
i18n.locale = Localization.getLocales()[0]?.languageCode || 'en';

// Enable fallback to 'en' if translation is missing
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export { i18n };

export const getLocaleFromCode = (code: string): SupportedLocale => {
  const supportedLocales: SupportedLocale[] = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'tr', 'zh'];
  const locale = code.toLowerCase().split('-')[0] as SupportedLocale;
  return supportedLocales.includes(locale) ? locale : 'en';
};

export const SUPPORTED_LOCALES = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'zh', name: '中文' },
] as const;
