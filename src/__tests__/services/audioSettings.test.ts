// Reset modules between tests so the service's in-memory cache starts fresh.
import { STORAGE_KEYS } from '../../config/app';

type AudioSettingsModule = typeof import('../../services/audioSettings');

function freshModule(): {
  svc: AudioSettingsModule;
  storage: {
    multiGet: jest.Mock;
    setItem: jest.Mock;
  };
} {
  let svc!: AudioSettingsModule;
  let storage!: { multiGet: jest.Mock; setItem: jest.Mock };
  jest.isolateModules(() => {
    storage = require('@react-native-async-storage/async-storage').default;
    svc = require('../../services/audioSettings');
  });
  return { svc, storage };
}

describe('audioSettings', () => {
  it('returns defaults before init', () => {
    const { svc } = freshModule();
    expect(svc.getAudioSettings()).toEqual({
      playInBackground: false,
      autoplayNext: true,
    });
    expect(svc.isAudioSettingsLoaded()).toBe(false);
  });

  it('hydrates persisted values on init (string "true"/"false")', async () => {
    const { svc, storage } = freshModule();
    storage.multiGet.mockResolvedValueOnce([
      [STORAGE_KEYS.AUDIO_PLAY_IN_BACKGROUND, 'true'],
      [STORAGE_KEYS.AUDIO_AUTOPLAY_NEXT, 'false'],
    ]);

    await svc.initAudioSettings();

    expect(svc.isAudioSettingsLoaded()).toBe(true);
    expect(svc.getAudioSettings()).toEqual({
      playInBackground: true,
      autoplayNext: false,
    });
  });

  it('keeps defaults when multiGet rejects', async () => {
    const { svc, storage } = freshModule();
    storage.multiGet.mockRejectedValueOnce(new Error('disk error'));

    await svc.initAudioSettings();

    expect(svc.getAudioSettings().autoplayNext).toBe(true);
    expect(svc.isAudioSettingsLoaded()).toBe(true);
  });

  it('persists and notifies subscribers on change', async () => {
    const { svc, storage } = freshModule();
    const listener = jest.fn();
    svc.subscribeAudioSettings(listener); // fires immediately
    expect(listener).toHaveBeenCalledTimes(1);

    await svc.setAudioSetting('playInBackground', true);

    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.AUDIO_PLAY_IN_BACKGROUND, 'true');
    expect(svc.getAudioSettings().playInBackground).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ playInBackground: true })
    );
  });

  it('is a no-op when the value is unchanged', async () => {
    const { svc, storage } = freshModule();
    // default autoplayNext is already true
    await svc.setAudioSetting('autoplayNext', true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', async () => {
    const { svc } = freshModule();
    const listener = jest.fn();
    const unsub = svc.subscribeAudioSettings(listener);
    listener.mockClear();
    unsub();
    await svc.setAudioSetting('autoplayNext', false);
    expect(listener).not.toHaveBeenCalled();
  });
});
