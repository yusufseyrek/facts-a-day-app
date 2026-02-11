import { __testing, getAllFacts, reportFact } from '../../services/api';

const { fetchWithTimeout, retryWithBackoff } = __testing;

// Mock appCheckToken
jest.mock('../../services/appCheckToken', () => ({
  getCachedAppCheckToken: jest.fn().mockResolvedValue('mock-token'),
  forceRefreshAppCheckToken: jest.fn().mockResolvedValue('mock-fresh-token'),
}));

// Mock appInfo
jest.mock('../../utils/appInfo', () => ({
  getAppVersionInfo: jest.fn(() => ({ platformBuildId: 'test-1.0.0' })),
}));

describe('api — fetchWithTimeout', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('completes within timeout', async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://api.test/endpoint', {}, 5000);
    expect(result.status).toBe(200);
  });

  it('aborts after timeout', async () => {
    jest.useFakeTimers();

    // Make fetch hang forever and reject on abort
    (global.fetch as jest.Mock) = jest.fn().mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const promise = fetchWithTimeout('https://api.test/slow', {}, 1000);

    jest.advanceTimersByTime(1100);

    await expect(promise).rejects.toThrow('Request timeout after 1000ms');

    jest.useRealTimers();
  });

  it('clears timeout on success', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const mockResponse = new Response('ok', { status: 200 });
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://api.test/fast', {}, 5000);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('clears timeout on error', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(fetchWithTimeout('https://api.test/fail', {}, 5000)).rejects.toThrow('Network error');
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe('api — retryWithBackoff', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  it('returns on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, 3, 1000);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential delays', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, 3, 1000);

    // First call fails
    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Wait for 1s delay
    await jest.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // Wait for 2s delay
    await jest.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('does not retry on 4xx errors (except 429)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('API Error: 400 Bad Request'));

    await expect(retryWithBackoff(fn, 3, 1000)).rejects.toThrow('API Error: 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('API Error: 429 Too Many Requests'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, 3, 1000);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    // Use real timers with tiny delay to avoid fake-timer race condition
    // where the rejection fires during advanceTimersByTimeAsync before
    // expect().rejects can catch it.
    jest.useRealTimers();

    const fn = jest.fn().mockRejectedValue(new Error('server error'));

    await expect(retryWithBackoff(fn, 3, 1)).rejects.toThrow('server error');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('api — getAllFacts', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('fires 3 concurrent initial requests', async () => {
    const mockFactsResponse = {
      facts: Array.from({ length: 10 }, (_, i) => ({
        id: i,
        content: `fact ${i}`,
        language: 'en',
        created_at: '2025-01-01',
      })),
      pagination: { total: 10, limit: 1000, offset: 0, has_more: false },
    };

    // Each call needs its own Response object (body can only be read once)
    (global.fetch as jest.Mock) = jest.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockFactsResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await getAllFacts('en');

    // Should have made 3 initial concurrent requests (offsets 0, 1000, 2000)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('calls progress callback', async () => {
    const mockResponse = {
      facts: [{ id: 1, content: 'fact', language: 'en', created_at: '2025-01-01' }],
      pagination: { total: 1, limit: 1000, offset: 0, has_more: false },
    };

    (global.fetch as jest.Mock) = jest.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const onProgress = jest.fn();
    await getAllFacts('en', undefined, onProgress);
    expect(onProgress).toHaveBeenCalled();
  });
});

describe('api — reportFact', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('rejects text shorter than 10 chars', async () => {
    await expect(reportFact(1, 'short')).rejects.toThrow('at least 10 characters');
  });

  it('rejects text longer than 1000 chars', async () => {
    const longText = 'a'.repeat(1001);
    await expect(reportFact(1, longText)).rejects.toThrow('at most 1000 characters');
  });
});
