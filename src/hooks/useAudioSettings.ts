/**
 * Subscribes a component to the global audio-player settings. Returns the
 * current snapshot plus a `setAudioSetting` passthrough so screens can both
 * read and write without importing the service directly.
 */
import { useEffect, useState } from 'react';

import {
  type AudioSettings,
  getAudioSettings,
  setAudioSetting,
  subscribeAudioSettings,
} from '../services/audioSettings';

export function useAudioSettings(): {
  settings: AudioSettings;
  setAudioSetting: typeof setAudioSetting;
} {
  const [settings, setSettings] = useState<AudioSettings>(getAudioSettings);

  useEffect(() => subscribeAudioSettings(setSettings), []);

  return { settings, setAudioSetting };
}
