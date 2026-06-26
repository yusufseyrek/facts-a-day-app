import { AppState } from 'react-native';

import { postFactEvents } from '../../services/api';
import { enqueueFactEvent, flushFactEvents, __testing } from '../../services/factEvents';

jest.mock('../../services/api', () => ({
  postFactEvents: jest.fn().mockResolvedValue({ accepted: 0 }),
}));

const mockPost = postFactEvents as jest.Mock;

describe('factEvents', () => {
  const originalDev = (global as any).__DEV__;
  let addSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    __testing.reset();
    mockPost.mockClear();
    addSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as any);
    // The tracker no-ops in dev (like Firebase/PostHog); enable it for these tests.
    (global as any).__DEV__ = false;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    addSpy.mockRestore();
    (global as any).__DEV__ = originalDev;
  });

  it('is a no-op in dev', () => {
    (global as any).__DEV__ = true;
    enqueueFactEvent(1, 'view');
    jest.runAllTimers();
    expect(mockPost).not.toHaveBeenCalled();
    expect(__testing.getQueueLength()).toBe(0);
  });

  it('batches several events into one debounced request', () => {
    enqueueFactEvent(1, 'view');
    enqueueFactEvent(2, 'favorite');
    enqueueFactEvent(3, 'share');

    expect(mockPost).not.toHaveBeenCalled(); // still within the debounce window

    jest.advanceTimersByTime(4000);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith([
      { fact_id: 1, type: 'view' },
      { fact_id: 2, type: 'favorite' },
      { fact_id: 3, type: 'share' },
    ]);
  });

  it('flushes immediately once the queue hits the cap', () => {
    for (let i = 1; i <= 20; i++) enqueueFactEvent(i, 'view');

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect((mockPost.mock.calls[0][0] as unknown[]).length).toBe(20);
    expect(__testing.getQueueLength()).toBe(0);
  });

  it('flushes when the app leaves the foreground', () => {
    enqueueFactEvent(7, 'view');
    expect(addSpy).toHaveBeenCalledWith('change', expect.any(Function));

    const handler = addSpy.mock.calls[0][1] as (state: string) => void;
    handler('background');

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith([{ fact_id: 7, type: 'view' }]);
  });

  it('ignores invalid fact ids', () => {
    enqueueFactEvent(0, 'view');
    enqueueFactEvent(-3, 'favorite');
    enqueueFactEvent(1.5, 'share');

    jest.advanceTimersByTime(4000);

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('flushFactEvents drains the queue on demand', () => {
    enqueueFactEvent(9, 'share');
    flushFactEvents();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith([{ fact_id: 9, type: 'share' }]);
  });

  it('swallows a failed send (fire-and-forget)', () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    enqueueFactEvent(5, 'view');
    expect(() => flushFactEvents()).not.toThrow();
  });
});
