import { insertNativeAds, isNativeAdPlaceholder, NativeAdPlaceholder } from '../../utils/insertNativeAds';

// Access mocked modules
const premiumState = jest.requireMock('../../services/premiumState');

// Import the config to control NATIVE_ADS.ACTIVE
jest.mock('../../config/app', () => ({
  ...jest.requireActual('../../config/app'),
  NATIVE_ADS: {
    ACTIVE: true,
    INTERVAL: 3,
    FIRST_AD_INDEX: { HOME_CAROUSEL: 1, DISCOVER: 1, FAVORITES: 1, STORY: 3 },
  },
}));

const appConfig = jest.requireMock('../../config/app');

describe('insertNativeAds', () => {
  beforeEach(() => {
    premiumState.shouldShowAds.mockReturnValue(true);
    appConfig.NATIVE_ADS.ACTIVE = true;
  });

  it('returns original items when ads disabled (premium user)', () => {
    premiumState.shouldShowAds.mockReturnValue(false);
    const items = [1, 2, 3, 4, 5];
    expect(insertNativeAds(items, 2)).toBe(items);
  });

  it('returns original items when NATIVE_ADS.ACTIVE is false', () => {
    appConfig.NATIVE_ADS.ACTIVE = false;
    const items = [1, 2, 3, 4, 5];
    expect(insertNativeAds(items, 2)).toBe(items);
  });

  it('returns original items for empty array', () => {
    const items: number[] = [];
    expect(insertNativeAds(items, 2)).toEqual([]);
  });

  it('inserts first ad at firstAdIndex', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = insertNativeAds(items, 3, undefined, 100);
    // Ad should be at position 3 (before item at index 3)
    expect(isNativeAdPlaceholder(result[3])).toBe(true);
    // Items before the ad should be unchanged
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
    // Item after ad
    expect(result[4]).toBe(4);
  });

  it('inserts subsequent ads at interval', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = insertNativeAds(items, 2, undefined, 3);
    const adPositions = result
      .map((item, idx) => (isNativeAdPlaceholder(item) ? idx : -1))
      .filter((idx) => idx >= 0);
    // Should have ads inserted
    expect(adPositions.length).toBeGreaterThanOrEqual(2);
  });

  it('uses isCountable predicate for filtering', () => {
    interface Item { value: number; isHeader?: boolean }
    const items: Item[] = [
      { value: 1 },
      { value: 2, isHeader: true },
      { value: 3 },
      { value: 4 },
      { value: 5 },
      { value: 6 },
    ];
    const result = insertNativeAds(
      items,
      2,
      (item) => !item.isHeader,
      100
    );
    // The header should NOT count toward ad positioning
    // After 2 countable items, ad should appear
    const adIdx = result.findIndex(isNativeAdPlaceholder);
    expect(adIdx).toBeGreaterThan(0);

    // Count countable items before the ad
    let countable = 0;
    for (let i = 0; i < adIdx; i++) {
      const item = result[i];
      if (!isNativeAdPlaceholder(item) && !(item as Item).isHeader) {
        countable++;
      }
    }
    expect(countable).toBe(2);
  });

  it('appends fallback ad at end for short lists', () => {
    const items = [1, 2, 3, 4];
    // firstAdIndex = 3, interval = 100 (very large so only one ad possible)
    const result = insertNativeAds(items, 3, undefined, 100);
    // Should have at least one ad
    const ads = result.filter(isNativeAdPlaceholder);
    expect(ads.length).toBeGreaterThanOrEqual(1);
  });

  it('does not insert fallback ad when list is shorter than firstAdIndex', () => {
    const items = [1, 2];
    const result = insertNativeAds(items, 5, undefined, 100);
    const ads = result.filter(isNativeAdPlaceholder);
    expect(ads.length).toBe(0);
  });
});

describe('isNativeAdPlaceholder', () => {
  it('returns true for valid placeholder', () => {
    const placeholder: NativeAdPlaceholder = { type: 'nativeAd', key: 'native-ad-0' };
    expect(isNativeAdPlaceholder(placeholder)).toBe(true);
  });

  it('returns false for regular items', () => {
    expect(isNativeAdPlaceholder({ type: 'fact', id: 1 })).toBe(false);
    expect(isNativeAdPlaceholder(null)).toBe(false);
    expect(isNativeAdPlaceholder(undefined)).toBe(false);
    expect(isNativeAdPlaceholder(42)).toBe(false);
    expect(isNativeAdPlaceholder('string')).toBe(false);
  });
});
