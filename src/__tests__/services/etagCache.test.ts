import {
  clearEtagCache,
  getCachedBody,
  getStoredEtag,
  storeEtag,
} from '../../services/etagCache';

describe('etagCache', () => {
  beforeEach(() => clearEtagCache());

  test('stores and returns an ETag + body for a url', () => {
    storeEtag('/api/x?a=1', '"abc"', { n: 5 });
    expect(getStoredEtag('/api/x?a=1')).toBe('"abc"');
    expect(getCachedBody('/api/x?a=1')).toEqual({ hit: true, body: { n: 5 } });
  });

  test('reports a miss for an unknown url', () => {
    expect(getStoredEtag('/missing')).toBeUndefined();
    expect(getCachedBody('/missing')).toEqual({ hit: false });
  });

  test('treats a falsy cached body (empty array, 0) as a hit', () => {
    storeEtag('/empty', '"e"', []);
    const empty = getCachedBody<unknown[]>('/empty');
    expect(empty.hit).toBe(true);
    expect(empty.body).toEqual([]);

    storeEtag('/zero', '"z"', 0);
    const zero = getCachedBody<number>('/zero');
    expect(zero.hit).toBe(true);
    expect(zero.body).toBe(0);
  });

  test('updating a url overwrites its ETag + body', () => {
    storeEtag('/api/x', '"v1"', { v: 1 });
    storeEtag('/api/x', '"v2"', { v: 2 });
    expect(getStoredEtag('/api/x')).toBe('"v2"');
    expect(getCachedBody('/api/x')).toEqual({ hit: true, body: { v: 2 } });
  });

  test('clear() drops everything', () => {
    storeEtag('/x', '"1"', 1);
    clearEtagCache();
    expect(getStoredEtag('/x')).toBeUndefined();
    expect(getCachedBody('/x').hit).toBe(false);
  });
});
