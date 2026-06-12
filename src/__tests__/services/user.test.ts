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

  describe('deviceCountryCode', () => {
    it('the time zone outranks locale regions (the zh→CN / Region-residue trap)', () => {
      // Language-pinned regions (Android zh → CN) and stale iOS Region
      // settings (en-CN, tr-CN after a Chinese-content test session) both
      // poison the locale list — exactly how profiles got stamped "CN".
      mockLocales.mockReturnValue([
        { languageCode: 'en', regionCode: 'CN' },
        { languageCode: 'zh', regionCode: 'CN' },
        { languageCode: 'tr', regionCode: 'CN' },
      ]);
      mockCalendars.mockReturnValue([{ timeZone: 'Europe/Istanbul' }]);

      expect(deviceCountryCode()).toBe('TR');
    });

    it('falls back to the locale region when the zone maps to no country', () => {
      mockLocales.mockReturnValue([{ languageCode: 'tr', regionCode: 'TR' }]);
      mockCalendars.mockReturnValue([{ timeZone: 'Etc/UTC' }]);

      expect(deviceCountryCode()).toBe('TR');
    });

    it('skips malformed regions and normalizes case in the fallback', () => {
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
