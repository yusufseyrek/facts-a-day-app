import { Platform } from 'react-native';

import { i18n } from '../../i18n';
import {
  generateAppLink,
  generateDeepLink,
  generateShareText,
  generateShortShareText,
  getAppStoreUrl,
} from '../../services/share/deepLinks';

jest.mock('../../i18n', () => ({
  i18n: { locale: 'en' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

beforeEach(() => {
  (i18n as { locale: string }).locale = 'en';
  (Platform as { OS: string }).OS = 'ios';
});

// ---------------------------------------------------------------------------
// generateDeepLink
// ---------------------------------------------------------------------------
describe('generateDeepLink', () => {
  it('returns universal link with current locale', () => {
    expect(generateDeepLink(42)).toBe('https://factsaday.com/en/fact/42');
  });

  it('appends slug when provided', () => {
    expect(generateDeepLink(42, 'cool-fact')).toBe(
      'https://factsaday.com/en/fact/42/cool-fact'
    );
  });

  it('uses locale from i18n.locale', () => {
    (i18n as { locale: string }).locale = 'tr';
    expect(generateDeepLink(1)).toBe('https://factsaday.com/tr/fact/1');

    (i18n as { locale: string }).locale = 'ja';
    expect(generateDeepLink(99)).toBe('https://factsaday.com/ja/fact/99');
  });

  it('falls back to "en" when i18n.locale is empty', () => {
    (i18n as { locale: string }).locale = '';
    expect(generateDeepLink(7)).toBe('https://factsaday.com/en/fact/7');
  });
});

// ---------------------------------------------------------------------------
// generateAppLink
// ---------------------------------------------------------------------------
describe('generateAppLink', () => {
  it('returns app scheme link with current locale', () => {
    expect(generateAppLink(10)).toBe('factsaday://en/fact/10');
  });

  it('uses locale from i18n.locale', () => {
    (i18n as { locale: string }).locale = 'ko';
    expect(generateAppLink(5)).toBe('factsaday://ko/fact/5');
  });
});

// ---------------------------------------------------------------------------
// getAppStoreUrl
// ---------------------------------------------------------------------------
describe('getAppStoreUrl', () => {
  it('returns iOS App Store URL on iOS', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(getAppStoreUrl()).toBe('https://apps.apple.com/app/id6755321394');
  });

  it('returns Google Play URL on Android', () => {
    (Platform as { OS: string }).OS = 'android';
    expect(getAppStoreUrl()).toBe(
      'https://play.google.com/store/apps/details?id=dev.seyrek.factsaday'
    );
  });
});

// ---------------------------------------------------------------------------
// generateShareText
// ---------------------------------------------------------------------------
describe('generateShareText', () => {
  const baseFact = {
    id: 1,
    title: 'Water boils at 100°C',
    content: 'Under standard atmospheric pressure, pure water boils at 100 degrees Celsius.',
    slug: 'water-boils',
  };

  it('includes title, deep link, and hashtags when includeDeepLink=true', () => {
    const text = generateShareText(baseFact, true);
    expect(text).toContain('Water boils at 100°C');
    expect(text).toContain('https://factsaday.com/en/fact/1/water-boils');
    expect(text).toContain('#DidYouKnow #FactsADay');
  });

  it('omits deep link when includeDeepLink=false', () => {
    const text = generateShareText(baseFact, false);
    expect(text).toContain('Water boils at 100°C');
    expect(text).not.toContain('https://factsaday.com');
    expect(text).toContain('#DidYouKnow #FactsADay');
  });

  it('uses first 100 chars of content + "..." when title is missing', () => {
    const longContent = 'A'.repeat(150);
    const fact = { id: 2, title: '', content: longContent };
    const text = generateShareText(fact, false);
    expect(text).toContain('A'.repeat(100) + '...');
  });
});

// ---------------------------------------------------------------------------
// generateShortShareText
// ---------------------------------------------------------------------------
describe('generateShortShareText', () => {
  const baseFact = {
    id: 1,
    title: 'Short title',
    content: 'Some content',
    slug: 'short-title',
  };

  it('preserves deep link and hashtags in the suffix', () => {
    const text = generateShortShareText(baseFact);
    expect(text).toContain('https://factsaday.com/en/fact/1/short-title');
    expect(text).toContain('#DidYouKnow #FactsADay');
  });

  it('keeps short title intact when it fits within maxLength', () => {
    const text = generateShortShareText(baseFact, 280);
    expect(text).toContain('Short title');
    expect(text).not.toContain('...');
  });

  it('truncates title to fit within maxLength and adds "..."', () => {
    const longTitle = 'B'.repeat(300);
    const fact = { id: 2, title: longTitle, content: 'c' };
    const text = generateShortShareText(fact, 280);
    expect(text.length).toBeLessThanOrEqual(280);
    expect(text).toContain('...');
    expect(text).toContain('#DidYouKnow #FactsADay');
  });
});
