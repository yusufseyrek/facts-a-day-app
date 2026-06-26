import {
  acquireAudioFocus,
  releaseAudioFocus,
  resetAudioFocusForTests,
} from '../../services/audioFocus';

describe('audioFocus coordinator', () => {
  beforeEach(() => {
    resetAudioFocusForTests();
  });

  it('pauses the previous holder when a new player acquires focus', () => {
    const pauseA = jest.fn();
    const pauseB = jest.fn();

    acquireAudioFocus(pauseA);
    expect(pauseA).not.toHaveBeenCalled();

    acquireAudioFocus(pauseB);
    // B taking focus silences A, not itself.
    expect(pauseA).toHaveBeenCalledTimes(1);
    expect(pauseB).not.toHaveBeenCalled();
  });

  it('does not pause itself when the same player re-acquires (idempotent)', () => {
    const pauseA = jest.fn();
    acquireAudioFocus(pauseA);
    acquireAudioFocus(pauseA);
    acquireAudioFocus(pauseA);
    expect(pauseA).not.toHaveBeenCalled();
  });

  it('mediates three players so only the last to start keeps focus', () => {
    // Models the queue + two co-mounted inline narrations (overlay + route).
    const queue = jest.fn();
    const inlineA = jest.fn();
    const inlineB = jest.fn();

    acquireAudioFocus(inlineA); // overlay fact starts
    acquireAudioFocus(queue); // user taps the mini-player -> pauses inlineA
    expect(inlineA).toHaveBeenCalledTimes(1);

    acquireAudioFocus(inlineB); // a pushed route's fact starts -> pauses queue
    expect(queue).toHaveBeenCalledTimes(1);

    acquireAudioFocus(inlineA); // back to the overlay fact -> pauses inlineB
    expect(inlineB).toHaveBeenCalledTimes(1);

    // Each was paused exactly when the next player took over, never itself.
    expect(inlineA).toHaveBeenCalledTimes(1);
  });

  it('releasing focus clears the holder so the next start pauses nobody', () => {
    const pauseA = jest.fn();
    const pauseB = jest.fn();

    acquireAudioFocus(pauseA);
    releaseAudioFocus(pauseA); // A pauses itself (user pause) and yields focus
    acquireAudioFocus(pauseB); // nobody holds focus -> B pauses no one
    expect(pauseA).not.toHaveBeenCalled();
    expect(pauseB).not.toHaveBeenCalled();
  });

  it('release is a no-op when another player already took focus', () => {
    const pauseA = jest.fn();
    const pauseB = jest.fn();

    acquireAudioFocus(pauseA);
    acquireAudioFocus(pauseB); // B is now the holder (pauses A)
    pauseA.mockClear();

    releaseAudioFocus(pauseA); // A is no longer the holder -> must not clear B
    acquireAudioFocus(jest.fn()); // a third player starts -> must pause B
    expect(pauseB).toHaveBeenCalledTimes(1);
  });

  it('survives a holder whose pause callback throws', () => {
    const throwingPause = jest.fn(() => {
      throw new Error('player released');
    });
    const pauseB = jest.fn();

    acquireAudioFocus(throwingPause);
    expect(() => acquireAudioFocus(pauseB)).not.toThrow();
    expect(throwingPause).toHaveBeenCalledTimes(1);
  });
});
