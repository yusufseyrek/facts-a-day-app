jest.unmock('../../services/premiumDowngrade');

jest.mock('../../services/contentRefresh', () => ({
  emitFeedRefresh: jest.fn(),
  markFeedRefreshPending: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  getMetadata: jest.fn(),
}));

jest.mock('../../config/app', () => ({
  MINIMUM_CATEGORIES: 3,
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { Alert } from 'react-native';

import * as api from '../../services/api';
import { emitFeedRefresh, markFeedRefreshPending } from '../../services/contentRefresh';
import * as onboardingService from '../../services/onboarding';
import {
  handlePremiumDowngrade,
  reconcilePremiumCategories,
} from '../../services/premiumDowngrade';

const apiMock = api as jest.Mocked<typeof api>;
const onboardingMock = onboardingService as jest.Mocked<typeof onboardingService>;

/** Build a metadata response whose given slugs are premium. */
function metadataWithPremium(premiumSlugs: string[]) {
  const all = ['science', 'history', 'nature', 'finance', 'cinema', 'anatomy'];
  return {
    categories: all.map((slug, i) => ({
      id: i + 1,
      name: slug,
      slug,
      description: '',
      icon: 'star',
      color_hex: '#000000',
      is_premium: premiumSlugs.includes(slug),
    })),
    languages: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.getMetadata.mockResolvedValue(metadataWithPremium([]) as any);
  onboardingMock.getSelectedCategories.mockResolvedValue([]);
  onboardingMock.setSelectedCategories = jest.fn().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// reconcilePremiumCategories
// ---------------------------------------------------------------------------
describe('reconcilePremiumCategories', () => {
  it('returns false when there are no premium categories', async () => {
    apiMock.getMetadata.mockResolvedValue(metadataWithPremium([]) as any);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(false);
    expect(onboardingMock.setSelectedCategories).not.toHaveBeenCalled();
    expect(emitFeedRefresh).not.toHaveBeenCalled();
  });

  it('returns false when user has no premium categories selected', async () => {
    apiMock.getMetadata.mockResolvedValue(metadataWithPremium(['finance', 'cinema']) as any);
    onboardingMock.getSelectedCategories.mockResolvedValue(['science', 'history', 'nature']);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(false);
    expect(onboardingMock.setSelectedCategories).not.toHaveBeenCalled();
  });

  it('deselects premium categories from the selection', async () => {
    apiMock.getMetadata.mockResolvedValue(
      metadataWithPremium(['finance', 'cinema', 'anatomy']) as any
    );
    onboardingMock.getSelectedCategories.mockResolvedValue([
      'science',
      'finance',
      'history',
      'cinema',
    ]);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(true);
    expect(onboardingMock.setSelectedCategories).toHaveBeenCalledWith(['science', 'history']);
  });

  it('emits a feed refresh after deselecting', async () => {
    apiMock.getMetadata.mockResolvedValue(metadataWithPremium(['finance']) as any);
    onboardingMock.getSelectedCategories.mockResolvedValue(['science', 'finance']);

    await reconcilePremiumCategories();

    expect(emitFeedRefresh).toHaveBeenCalled();
    expect(markFeedRefreshPending).toHaveBeenCalled();
  });

  it('deselects all categories when all selected are premium', async () => {
    apiMock.getMetadata.mockResolvedValue(metadataWithPremium(['finance', 'cinema']) as any);
    onboardingMock.getSelectedCategories.mockResolvedValue(['finance', 'cinema']);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(true);
    expect(onboardingMock.setSelectedCategories).toHaveBeenCalledWith([]);
  });
});

// ---------------------------------------------------------------------------
// handlePremiumDowngrade
// ---------------------------------------------------------------------------
describe('handlePremiumDowngrade', () => {
  it('does not alert when no categories were deselected', async () => {
    apiMock.getMetadata.mockResolvedValue(metadataWithPremium([]) as any);

    await handlePremiumDowngrade('en');

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('alerts when remaining selection is below minimum', async () => {
    apiMock.getMetadata.mockResolvedValue(
      metadataWithPremium(['finance', 'cinema', 'anatomy']) as any
    );
    onboardingMock.getSelectedCategories
      .mockResolvedValueOnce(['science', 'finance', 'cinema', 'anatomy'])
      .mockResolvedValueOnce(['science']); // only 1 remaining — below MINIMUM_CATEGORIES (3)

    await handlePremiumDowngrade('en');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Categories Updated',
      expect.stringContaining('Please select at least 3 categories')
    );
  });

  it('does not alert when remaining selection meets minimum', async () => {
    apiMock.getMetadata.mockResolvedValue(metadataWithPremium(['finance']) as any);
    onboardingMock.getSelectedCategories
      .mockResolvedValueOnce(['science', 'history', 'nature', 'finance'])
      .mockResolvedValueOnce(['science', 'history', 'nature']); // 3 remaining — meets minimum

    await handlePremiumDowngrade('en');

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not throw on errors', async () => {
    apiMock.getMetadata.mockRejectedValue(new Error('network error'));

    await expect(handlePremiumDowngrade('en')).resolves.toBeUndefined();
  });
});
