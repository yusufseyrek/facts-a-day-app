import { countryFlagEmoji } from '../../utils/countryFlag';

describe('countryFlagEmoji', () => {
  it('maps ISO alpha-2 codes to regional-indicator flags', () => {
    expect(countryFlagEmoji('TR')).toBe('🇹🇷');
    expect(countryFlagEmoji('US')).toBe('🇺🇸');
    expect(countryFlagEmoji('jp')).toBe('🇯🇵'); // case-insensitive
  });

  it('returns empty string for anything that is not two ASCII letters', () => {
    expect(countryFlagEmoji(null)).toBe('');
    expect(countryFlagEmoji(undefined)).toBe('');
    expect(countryFlagEmoji('')).toBe('');
    expect(countryFlagEmoji('T')).toBe('');
    expect(countryFlagEmoji('TUR')).toBe('');
    expect(countryFlagEmoji('1A')).toBe('');
  });
});
