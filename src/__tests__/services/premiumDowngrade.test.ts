jest.unmock('../../services/premiumDowngrade');

jest.mock('../../services/contentRefresh', () => ({
  emitFeedRefresh: jest.fn(),
  markFeedRefreshPending: jest.fn(),
}));

jest.mock('../../services/database', () => ({
  getPremiumCategorySlugs: jest.fn().mockResolvedValue([]),
  deleteFactsByCategorySlugs: jest.fn().mockResolvedValue(undefined),
  openDatabase: jest.fn().mockResolvedValue({
    runAsync: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../services/dailyFeed', () => ({
  invalidateFeedMemoryCache: jest.fn(),
}));

jest.mock('../../config/app', () => ({
  MINIMUM_CATEGORIES: 3,
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { Alert } from 'react-native';

import * as db from '../../services/database';
import * as onboardingService from '../../services/onboarding';
import { emitFeedRefresh, markFeedRefreshPending } from '../../services/contentRefresh';
import { invalidateFeedMemoryCache } from '../../services/dailyFeed';
import { reconcilePremiumCategories, handlePremiumDowngrade } from '../../services/premiumDowngrade';

const dbMock = db as jest.Mocked<typeof db>;
const onboardingMock = onboardingService as jest.Mocked<typeof onboardingService>;

beforeEach(() => {
  jest.clearAllMocks();
  dbMock.getPremiumCategorySlugs.mockResolvedValue([]);
  onboardingMock.getSelectedCategories.mockResolvedValue([]);
  onboardingMock.setSelectedCategories = jest.fn().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// reconcilePremiumCategories
// ---------------------------------------------------------------------------
describe('reconcilePremiumCategories', () => {
  it('returns false when there are no premium categories in DB', async () => {
    dbMock.getPremiumCategorySlugs.mockResolvedValue([]);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(false);
    expect(onboardingMock.setSelectedCategories).not.toHaveBeenCalled();
    expect(dbMock.deleteFactsByCategorySlugs).not.toHaveBeenCalled();
    expect(emitFeedRefresh).not.toHaveBeenCalled();
  });

  it('returns false when user has no premium categories selected', async () => {
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance', 'cinema']);
    onboardingMock.getSelectedCategories.mockResolvedValue(['science', 'history', 'nature']);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(false);
    expect(onboardingMock.setSelectedCategories).not.toHaveBeenCalled();
  });

  it('deselects premium categories and cleans up facts', async () => {
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance', 'cinema', 'anatomy']);
    onboardingMock.getSelectedCategories.mockResolvedValue([
      'science', 'finance', 'history', 'cinema',
    ]);

    const result = await reconcilePremiumCategories();

    expect(result).toBe(true);
    expect(onboardingMock.setSelectedCategories).toHaveBeenCalledWith(['science', 'history']);
    expect(dbMock.deleteFactsByCategorySlugs).toHaveBeenCalledWith(['finance', 'cinema', 'anatomy']);
  });

  it('cleans up orphaned questions after deleting facts', async () => {
    const mockRunAsync = jest.fn().mockResolvedValue(undefined);
    dbMock.openDatabase.mockResolvedValue({ runAsync: mockRunAsync } as any);
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance']);
    onboardingMock.getSelectedCategories.mockResolvedValue(['science', 'finance']);

    await reconcilePremiumCategories();

    expect(mockRunAsync).toHaveBeenCalledWith(
      'DELETE FROM questions WHERE fact_id NOT IN (SELECT id FROM facts)'
    );
  });

  it('invalidates feed cache and emits refresh', async () => {
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance']);
    onboardingMock.getSelectedCategories.mockResolvedValue(['science', 'finance']);

    await reconcilePremiumCategories();

    expect(invalidateFeedMemoryCache).toHaveBeenCalled();
    expect(emitFeedRefresh).toHaveBeenCalled();
    expect(markFeedRefreshPending).toHaveBeenCalled();
  });

  it('deselects all categories when all selected are premium', async () => {
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance', 'cinema']);
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
    dbMock.getPremiumCategorySlugs.mockResolvedValue([]);

    await handlePremiumDowngrade('en');

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('alerts when remaining selection is below minimum', async () => {
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance', 'cinema', 'anatomy']);
    // First call from reconcilePremiumCategories, second from handlePremiumDowngrade
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
    dbMock.getPremiumCategorySlugs.mockResolvedValue(['finance']);
    onboardingMock.getSelectedCategories
      .mockResolvedValueOnce(['science', 'history', 'nature', 'finance'])
      .mockResolvedValueOnce(['science', 'history', 'nature']); // 3 remaining — meets minimum

    await handlePremiumDowngrade('en');

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not throw on errors', async () => {
    dbMock.getPremiumCategorySlugs.mockRejectedValue(new Error('DB error'));

    await expect(handlePremiumDowngrade('en')).resolves.toBeUndefined();
  });
});
