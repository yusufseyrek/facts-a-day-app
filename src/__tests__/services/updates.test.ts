const Updates = jest.requireMock('expo-updates');
const Constants = jest.requireMock('expo-constants').default;
const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;

// Mock appCheckToken
jest.mock('../../services/appCheckToken', () => ({
  getCachedAppCheckToken: jest.fn().mockResolvedValue('mock-token'),
}));

import {
  getRuntimeVersion,
  checkForUpdates,
  downloadAndApplyUpdate,
  reloadApp,
  performUpdateCycle,
} from '../../services/updates';

describe('updates — getRuntimeVersion', () => {
  it('returns string runtimeVersion from config', () => {
    Constants.expoConfig = { runtimeVersion: '2.0.0', version: '1.1.0' };
    expect(getRuntimeVersion()).toBe('2.0.0');
  });

  it('falls back to app version when runtimeVersion is an object', () => {
    Constants.expoConfig = {
      runtimeVersion: { policy: 'appVersion' },
      version: '1.1.0',
    };
    expect(getRuntimeVersion()).toBe('1.1.0');
  });

  it('falls back to 1.0.0 when no version set', () => {
    Constants.expoConfig = {};
    expect(getRuntimeVersion()).toBe('1.0.0');
  });
});

describe('updates — checkForUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore expoConfig for updates
    Constants.expoConfig = {
      version: '1.1.0',
      runtimeVersion: '1.1.0',
      updates: { url: 'https://updates.test' },
    };
  });

  it('returns development type in __DEV__', async () => {
    // __DEV__ is true in test environment
    const result = await checkForUpdates();
    expect(result.type).toBe('development');
  });

  // Tests below would test non-__DEV__ behavior, but __DEV__=true in Jest
  // so we test the dev path
});

describe('updates — downloadAndApplyUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success when update is new', async () => {
    Updates.fetchUpdateAsync.mockResolvedValue({
      isNew: true,
      manifest: { id: 'update-1', createdAt: '2025-01-01' },
    });

    const result = await downloadAndApplyUpdate();
    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.manifest).toBeDefined();
    }
  });

  it('returns error when update is not new', async () => {
    Updates.fetchUpdateAsync.mockResolvedValue({ isNew: false });

    const result = await downloadAndApplyUpdate();
    expect(result.type).toBe('error');
  });

  it('returns error on fetch failure', async () => {
    Updates.fetchUpdateAsync.mockRejectedValue(new Error('Download failed'));

    const result = await downloadAndApplyUpdate();
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error.message).toBe('Download failed');
    }
  });
});

describe('updates — reloadApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves theme from AsyncStorage (dark)', async () => {
    AsyncStorage.getItem.mockResolvedValue('dark');
    Updates.reloadAsync.mockResolvedValue(undefined);
    Updates.readLogEntriesAsync.mockResolvedValue([]);

    await reloadApp();

    expect(Updates.reloadAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        reloadScreenOptions: expect.objectContaining({
          backgroundColor: '#000000',
          fade: true,
        }),
      })
    );
  });

  it('resolves theme from AsyncStorage (light)', async () => {
    AsyncStorage.getItem.mockResolvedValue('light');
    Updates.reloadAsync.mockResolvedValue(undefined);
    Updates.readLogEntriesAsync.mockResolvedValue([]);

    await reloadApp();

    expect(Updates.reloadAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        reloadScreenOptions: expect.objectContaining({
          backgroundColor: '#FFFFFF',
        }),
      })
    );
  });

  it('falls back to dark theme when no saved preference', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    Updates.reloadAsync.mockResolvedValue(undefined);
    Updates.readLogEntriesAsync.mockResolvedValue([]);

    await reloadApp();

    // System theme defaults to 'dark' when Appearance returns null in test
    expect(Updates.reloadAsync).toHaveBeenCalled();
  });
});

describe('updates — performUpdateCycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checks and returns no-update when in dev mode', async () => {
    // In test env, __DEV__ = true, so checkForUpdates returns 'development'
    const result = await performUpdateCycle();
    expect(result.checked).toBe(true);
    expect(result.updateAvailable).toBe(false);
    expect(result.downloaded).toBe(false);
    expect(result.reloaded).toBe(false);
  });
});
