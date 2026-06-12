import * as api from '../../services/api';
import * as database from '../../services/database';
import { __resetTriviaSync, clientSessionId, syncTriviaResults } from '../../services/triviaSync';
import { getIdentity } from '../../services/userIdentity';

import type { TriviaSession } from '../../services/database';

jest.mock('../../services/api', () => ({
  postTriviaResult: jest.fn(),
}));
jest.mock('../../services/database', () => ({
  getUnsyncedTriviaSessions: jest.fn(),
  markTriviaSessionSynced: jest.fn(),
}));
jest.mock('../../services/userIdentity', () => ({
  getIdentity: jest.fn(),
}));

const mockPost = api.postTriviaResult as jest.Mock;
const mockUnsynced = database.getUnsyncedTriviaSessions as jest.Mock;
const mockMark = database.markTriviaSessionSynced as jest.Mock;
const mockIdentity = getIdentity as jest.Mock;

const identity = {
  userId: 'uuid-1',
  userKey: 'secret-1',
  screenName: 'SyncTester',
  countryCode: 'TR',
};

function session(overrides: Partial<TriviaSession> = {}): TriviaSession {
  return {
    id: 42,
    trivia_mode: 'mixed',
    category_slug: null,
    total_questions: 10,
    correct_answers: 7,
    completed_at: '2026-06-13T10:00:00.000Z',
    elapsed_time: 90,
    best_streak: 4,
    question_ids: null,
    selected_answers: null,
    ...overrides,
  };
}

function apiError(status?: number): Error & { status?: number } {
  const error = new Error('request failed') as Error & { status?: number };
  if (status !== undefined) error.status = status;
  return error;
}

describe('triviaSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetTriviaSync();
    mockIdentity.mockResolvedValue(identity);
    mockPost.mockResolvedValue({ accepted: true });
    mockMark.mockResolvedValue(undefined);
  });

  it('does nothing before a name is claimed', async () => {
    mockIdentity.mockResolvedValue(null);

    await syncTriviaResults();

    expect(mockUnsynced).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits the wire shape: seconds→ms, stable session id, then ledgers', async () => {
    mockUnsynced.mockResolvedValue([
      session({ id: 7, trivia_mode: 'category', category_slug: 'science' }),
    ]);

    await syncTriviaResults();

    expect(mockPost).toHaveBeenCalledWith({
      client_session_id: `s7-${Date.parse('2026-06-13T10:00:00.000Z')}`,
      mode: 'category',
      category_slug: 'science',
      language: 'en',
      questions_total: 10,
      correct_count: 7,
      elapsed_ms: 90_000,
    });
    expect(mockMark).toHaveBeenCalledWith(7);
  });

  it('omits category_slug outside category mode', async () => {
    mockUnsynced.mockResolvedValue([session({ trivia_mode: 'daily', category_slug: 'science' })]);

    await syncTriviaResults();

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'daily', category_slug: undefined })
    );
  });

  it('ledgers permanent rejections and keeps draining', async () => {
    mockUnsynced.mockResolvedValue([session({ id: 1 }), session({ id: 2 }), session({ id: 3 })]);
    mockPost
      .mockRejectedValueOnce(apiError(409)) // duplicate daily
      .mockRejectedValueOnce(apiError(400)) // implausible
      .mockResolvedValueOnce({ accepted: true });

    await syncTriviaResults();

    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(mockMark.mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
  });

  it('stops on transient failures and leaves the rest unsynced', async () => {
    mockUnsynced.mockResolvedValue([session({ id: 1 }), session({ id: 2 })]);
    mockPost.mockRejectedValueOnce(apiError(429));

    await syncTriviaResults();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('stops on network errors without a status', async () => {
    mockUnsynced.mockResolvedValue([session({ id: 1 })]);
    mockPost.mockRejectedValueOnce(apiError());

    await syncTriviaResults();

    expect(mockMark).not.toHaveBeenCalled();
  });

  it('ledgers ineligible modes without posting', async () => {
    mockUnsynced.mockResolvedValue([session({ id: 9, trivia_mode: 'quick' })]);

    await syncTriviaResults();

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockMark).toHaveBeenCalledWith(9);
  });

  it('derives ids that survive reinstall collisions', () => {
    const a = clientSessionId({ id: 1, completed_at: '2026-06-13T10:00:00.000Z' });
    const b = clientSessionId({ id: 1, completed_at: '2026-06-14T09:00:00.000Z' });
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(64);
  });
});
