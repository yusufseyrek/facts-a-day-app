import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCalendars, getLocales } from 'expo-localization';

import * as api from '../../services/api';
import {
  __resetCountryRefresh,
  deviceCountryCode,
  refreshCountryIfStale,
} from '../../services/user';
import { __resetIdentityCache, getIdentity, saveIdentity } from '../../services/userIdentity';

jest.mock('../../services/api', () => ({
  createUser: jest.fn(),
  updateUser: jest.fn(async () => ({})),
}));
jest.mock('../../services/notifications', () => ({
  registerForPush: jest.fn(async () => true),
}));

const mockLocales = getLocales as jest.Mock;
const mockCalendars = getCalendars as jest.Mock;

const store = new Map<string, string>();
const originalOS = Platform.OS;

describe('user country detection', () => {
  beforeEach(() => {
    store.clear();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      store.has(key) ? store.get(key)! : null
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        store.set(key, value);
      }
    );
    __resetIdentityCache();
    __resetCountryRefresh();
    jest.clearAllMocks();
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
  });

  describe('deviceCountryCode', () => {
    it('android: the time zone outranks a language-tag region (the zh→CN trap)', () => {
      (Platform as { OS: string }).OS = 'android';
      // A preferred-language list headed by Chinese while the user is in
      // Türkiye — exactly how a profile got stamped "CN".
      mockLocales.mockReturnValue([{ languageCode: 'zh', regionCode: 'CN' }]);
      mockCalendars.mockReturnValue([{ timeZone: 'Europe/Istanbul' }]);

      expect(deviceCountryCode()).toBe('TR');
    });

    it('android: falls back to the locale region when the zone maps to no country', () => {
      (Platform as { OS: string }).OS = 'android';
      mockLocales.mockReturnValue([{ languageCode: 'tr', regionCode: 'TR' }]);
      mockCalendars.mockReturnValue([{ timeZone: 'Etc/UTC' }]);

      expect(deviceCountryCode()).toBe('TR');
    });

    it('ios: the explicit Region setting (first locale) leads', () => {
      (Platform as { OS: string }).OS = 'ios';
      mockLocales.mockReturnValue([{ languageCode: 'en', regionCode: 'TR' }]);
      mockCalendars.mockReturnValue([{ timeZone: 'America/New_York' }]);

      expect(deviceCountryCode()).toBe('TR');
    });

    it('skips malformed regions and normalizes case', () => {
      (Platform as { OS: string }).OS = 'ios';
      mockLocales.mockReturnValue([
        { languageCode: 'eo', regionCode: '419' }, // UN M.49 area, not a country
        { languageCode: 'tr', regionCode: 'tr' },
      ]);
      mockCalendars.mockReturnValue([{ timeZone: null }]);

      expect(deviceCountryCode()).toBe('TR');
    });
  });

  describe('refreshCountryIfStale', () => {
    const identity = {
      userId: 'uuid-1',
      userKey: 'secret-1',
      screenName: 'CuriousMind',
      countryCode: 'CN',
    };

    beforeEach(() => {
      (Platform as { OS: string }).OS = 'android';
      mockLocales.mockReturnValue([{ languageCode: 'en', regionCode: 'US' }]);
      mockCalendars.mockReturnValue([{ timeZone: 'Europe/Istanbul' }]);
    });

    it('patches the backend and the stored identity when the country drifted', async () => {
      await saveIdentity(identity);

      await refreshCountryIfStale();

      expect(api.updateUser).toHaveBeenCalledWith({ country_code: 'TR' });
      expect((await getIdentity())?.countryCode).toBe('TR');
    });

    it('runs at most once per launch', async () => {
      await saveIdentity(identity);

      await refreshCountryIfStale();
      await refreshCountryIfStale();

      expect(api.updateUser).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the stored country still matches', async () => {
      await saveIdentity({ ...identity, countryCode: 'TR' });

      await refreshCountryIfStale();

      expect(api.updateUser).not.toHaveBeenCalled();
    });

    it('does nothing before a name is claimed', async () => {
      await refreshCountryIfStale();

      expect(api.updateUser).not.toHaveBeenCalled();
    });
  });
});
