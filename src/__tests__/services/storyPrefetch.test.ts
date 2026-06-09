import * as api from '../../services/api';
import { prefetchStory, takePrefetchedStory } from '../../services/storyPrefetch';

jest.mock('../../services/api');

const mockedGetFeed = api.getFactsFeed as jest.MockedFunction<typeof api.getFactsFeed>;

function feed(ids: number[]) {
  return {
    facts: ids.map((id) => ({
      id,
      content: `fact ${id}`,
      language: 'en',
      created_at: '2026-01-01',
      is_historical: false,
      metadata: null,
    })),
    next_cursor: null,
    has_more: false,
  } as Awaited<ReturnType<typeof api.getFactsFeed>>;
}

describe('storyPrefetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves a prefetched feed without a second network call', async () => {
    mockedGetFeed.mockResolvedValueOnce(feed([1, 2, 3]));

    prefetchStory('en', 'science', []);
    const res = await takePrefetchedStory('en', 'science');

    expect(res?.facts.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(mockedGetFeed).toHaveBeenCalledTimes(1);
    expect(mockedGetFeed).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en', categories: 'science' })
    );
  });

  it('dedupes concurrent prefetches for the same category', async () => {
    mockedGetFeed.mockResolvedValue(feed([1]));

    prefetchStory('en', 'history', []);
    prefetchStory('en', 'history', []);
    prefetchStory('en', 'history', []);
    await takePrefetchedStory('en', 'history');

    expect(mockedGetFeed).toHaveBeenCalledTimes(1);
  });

  it('expands the mix button to the selected categories param', async () => {
    mockedGetFeed.mockResolvedValueOnce(feed([9]));

    prefetchStory('en', 'mix', ['science', 'history']);
    const res = await takePrefetchedStory('en', 'science,history');

    expect(res?.facts[0]?.id).toBe(9);
    expect(mockedGetFeed).toHaveBeenCalledWith(
      expect.objectContaining({ categories: 'science,history' })
    );
  });

  it('returns null on a miss (nothing prefetched)', async () => {
    const res = await takePrefetchedStory('en', 'never-warmed');
    expect(res).toBeNull();
    expect(mockedGetFeed).not.toHaveBeenCalled();
  });

  it('removes the entry once taken so the next visit re-warms', async () => {
    mockedGetFeed.mockResolvedValueOnce(feed([1]));

    prefetchStory('en', 'space', []);
    await takePrefetchedStory('en', 'space');
    const second = await takePrefetchedStory('en', 'space');

    expect(second).toBeNull(); // consumed — caller fetches fresh
  });

  it('awaits an in-flight prefetch instead of refetching', async () => {
    let resolveFeed!: (v: Awaited<ReturnType<typeof api.getFactsFeed>>) => void;
    mockedGetFeed.mockReturnValueOnce(
      new Promise((res) => {
        resolveFeed = res;
      })
    );

    prefetchStory('en', 'arts', []);
    const takePromise = takePrefetchedStory('en', 'arts'); // taken before it settles
    resolveFeed(feed([7]));

    const res = await takePromise;
    expect(res?.facts[0]?.id).toBe(7);
    expect(mockedGetFeed).toHaveBeenCalledTimes(1);
  });
});
