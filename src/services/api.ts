import { Platform } from 'react-native';

import Constants from 'expo-constants';

import { APP_CHECK } from '../config/app';
import { getAppCheckReady, isAppCheckInitialized } from '../config/appCheckState';
import { queryClient } from '../config/queryClient';
import { metadataKeys, triviaKeys } from '../hooks/queryKeys';
import { getAppVersionInfo } from '../utils/appInfo';

import { getCachedAppCheckToken } from './appCheckToken';
import { getCachedBody, getStoredEtag, storeEtag } from './etagCache';
import { getIdentityHeaders } from './userIdentity';

/** Metadata (categories/languages) is near-static; cache it aggressively. */
const METADATA_STALE_TIME = 1000 * 60 * 60 * 6; // 6 hours

/** Trivia hub availability counts barely move within a session; cache briefly
 * (invalidated explicitly when the user plays a game or pull-to-refreshes). */
const AVAILABILITY_STALE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Story themes are timed events (e.g. a World Cup window opening). The cache is
 * persisted to disk, so a long staleTime keeps already-installed apps on a
 * pre-event snapshot for that whole window — including server-side changes that
 * don't bump the themes' updated_at (e.g. the fact-image fallback resolving once
 * a theme has matching facts). Keep it short so events surface within minutes.
 */
const STORY_THEMES_STALE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Get the API base URL, adjusting for Android emulator
 * On Android emulator, localhost refers to the emulator itself,
 * so we need to use 10.0.2.2 to reach the host machine
 */
function getApiBaseUrl(): string {
  const configuredUrl = Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000';

  // On Android, replace localhost with 10.0.2.2 for emulator support
  if (Platform.OS === 'android' && configuredUrl.includes('localhost')) {
    return configuredUrl.replace('localhost', '10.0.2.2');
  }

  return configuredUrl;
}

export const API_BASE_URL = getApiBaseUrl();

// ====== Types ======

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color_hex: string;
  is_premium: boolean;
}

export interface Language {
  code: string;
  name: string;
  native_name: string;
}

export interface MetadataResponse {
  categories: Category[];
  languages: Language[];
}

/** Admin-curated event collection ("World Cup") shown as an image-circle story button. */
export interface StoryTheme {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  color_hex: string | null;
}

export interface QuestionResponse {
  id: number;
  question_type: 'multiple_choice' | 'true_false';
  question_text: string;
  correct_answer: string;
  wrong_answers: string[] | null;
  explanation: string | null;
  difficulty: number;
}

export interface FactMetadata {
  month: number;
  day: number;
  event_year: number;
  original_event: string;
  country: string;
}

export interface FactResponse {
  id: number;
  slug?: string;
  title?: string;
  content: string;
  summary?: string;
  category?: string; // category slug
  category_name?: string; // translated category display name
  category_icon?: string; // Lucide icon name
  category_color_hex?: string;
  source_url?: string;
  source_language?: string | null; // language of the source article; null/absent = unknown
  image_url?: string;
  audio_url?: string | null;
  is_historical: boolean;
  metadata: FactMetadata | null;
  language: string;
  created_at: string;
  updated_at?: string; // API returns updated_at (mapped to last_updated in DB)
  questions?: QuestionResponse[]; // Only present when include_questions=true
}

export interface ReportFactRequest {
  feedback_text: string;
}

export interface ReportFactResponse {
  id: number;
  fact_id: number;
  status: string;
  created_at: string;
  message: string;
}

/** Cursor-paginated feed page (GET /api/facts/feed). */
export interface FactsFeedResponse {
  facts: FactResponse[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface GetFactsFeedParams {
  language: string;
  categories?: string; // comma-separated slugs
  includeHistorical?: boolean;
  limit?: number;
  cursor?: string; // opaque next_cursor from the previous page
}

/** "On this day" historical facts: exact date + a ±3-day week fallback. */
export interface OnThisDayResponse {
  exact: FactResponse[];
  week: FactResponse[];
}

/**
 * A trivia question as returned by /api/trivia/* — self-contained (no local
 * facts table needed). Extends the base question with the fact/category
 * attribution the trivia UI renders.
 */
export interface TriviaQuestionResponse extends QuestionResponse {
  fact_id: number;
  fact_title?: string;
  category_slug?: string;
  category_name?: string;
  category_color_hex?: string;
}

/** Device registration payload for server-driven push (POST /api/devices). */
export interface RegisterPushParams {
  token: string; // ExponentPushToken[...]
  platform: 'ios' | 'android';
  timezone: string; // IANA tz id
  preferred_minutes: number[]; // minutes-from-local-midnight
  locale: string;
  categories?: string[]; // optional slugs (omit = all)
}

// ====== API Helpers ======

/**
 * Fetch with timeout support
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 30000ms = 30s)
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    // Check if error is due to timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Retry a function with exponential backoff
 * @param fn - The function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      attempt++;

      // Don't retry on client errors (4xx except 429). Prefer the structured
      // status (always set by makeRequest); the message check remains for
      // errors thrown before a response existed. Without the structured check,
      // a 4xx whose body carried a server message (which replaces the
      // "API Error: 4xx" text) was silently retried.
      const status = (error as any)?.status;
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('API Error: 4')) {
        // Check if it's a 429 (rate limit)
        if (!error.message.includes('429')) {
          throw error; // Don't retry other 4xx errors
        }
      }

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = initialDelay * Math.pow(2, attempt - 1);
        if (__DEV__) {
          console.log(
            `Retrying request (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed after multiple retries');
}

async function makeRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  skipRetry: boolean = false
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const executeRequest = async (): Promise<T> => {
    // Wait for App Check initialization to complete before making any API request
    // This prevents race conditions where API calls happen before App Check is ready
    await getAppCheckReady();

    // In strict mode, block API calls if App Check failed to initialize
    if (APP_CHECK.STRICT_MODE_ENABLED && !isAppCheckInitialized() && !__DEV__) {
      throw new Error('App Check not initialized');
    }

    // Get App Check token for protected endpoints (uses cache to prevent rate limiting)
    const appCheckToken = await getCachedAppCheckToken();

    // Build platform build ID for request tracking (OTA-aware values)
    const { platformBuildId } = getAppVersionInfo();

    // Build headers with App Check token if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Platform-Build-Id': platformBuildId,
      ...(options.headers as Record<string, string>),
    };

    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    } else if (!__DEV__) {
      // Log when making API requests without App Check token in production
      // This helps track potential security/initialization issues
      console.warn(`⚠️ API request without App Check token: ${endpoint}`);
    }

    // Conditional GET: attach the stored ETag so an unchanged response comes
    // back as a cheap 304 (served from the local body cache below). Only GETs
    // participate, and only endpoints that emit an ETag are ever stored — every
    // other request behaves exactly as before.
    const method = (options.method ?? 'GET').toUpperCase();
    const isCacheable = method === 'GET';
    if (isCacheable) {
      const storedEtag = getStoredEtag(url);
      if (storedEtag) headers['If-None-Match'] = storedEtag;
    }

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    });

    // 304 Not Modified: serve the body cached alongside this ETag (we only sent
    // If-None-Match because we already hold that body).
    if (response.status === 304) {
      const cached = getCachedBody<T>(url);
      if (cached.hit) return cached.body as T;
      throw new Error(`304 Not Modified without a cached body: ${endpoint}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(
        errorData.message || `API Error: ${response.status} ${response.statusText}`
      );
      // Status + backend error code (e.g. SCREEN_NAME_TAKEN) so callers can
      // branch without string-matching the human message.
      (error as any).status = response.status;
      (error as any).code = errorData.error;

      // Add rate limit info to error if available
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          (error as any).retryAfter = parseInt(retryAfter, 10);
        }
      }

      throw error;
    }

    const data = (await response.json()) as T;
    // Stamp the ETag + body so the next request for this URL can revalidate
    // with If-None-Match and short-circuit on a 304.
    if (isCacheable) {
      const etag = response.headers.get('ETag');
      if (etag) storeEtag(url, etag, data);
    }
    return data;
  };

  try {
    if (skipRetry) {
      return await executeRequest();
    }
    return await retryWithBackoff(executeRequest);
  } catch (error) {
    if (__DEV__) {
      console.error(`API request failed: ${endpoint}`, error);
    }
    throw error;
  }
}

// Expose private helpers for unit testing
export const __testing = { fetchWithTimeout, retryWithBackoff };

// ====== API Endpoints ======

/**
 * Raw network fetch for metadata. Kept separate so getMetadata can wrap it in
 * the React Query cache (below).
 */
function fetchMetadataFromNetwork(language?: string): Promise<MetadataResponse> {
  const params = new URLSearchParams();
  if (language) params.append('language', language);
  params.append('includePremium', '1');
  const endpoint = `/api/metadata?${params.toString()}`;
  return makeRequest<MetadataResponse>(endpoint);
}

/**
 * Get metadata (categories, languages, content types). Optionally specify
 * language to get translated metadata.
 *
 * Metadata is near-static reference data shared across many screens (Discover,
 * trivia, onboarding, premium reconciliation). Routing it through the React
 * Query cache means: the first call fetches, every subsequent call within
 * staleTime returns instantly with no network, concurrent callers are deduped
 * into one request, and the result is persisted to disk — so e.g. the Discover
 * category grid renders immediately on a warm open instead of waiting on a
 * round-trip behind a full-screen spinner.
 */
export async function getMetadata(language?: string): Promise<MetadataResponse> {
  return queryClient.fetchQuery({
    queryKey: metadataKeys.byLocale(language ?? 'default'),
    queryFn: async () => {
      const res = await fetchMetadataFromNetwork(language);
      // Guard: never let an empty/invalid metadata response get cached (and
      // worse, persisted to disk for the whole staleTime). An empty categories
      // list would silently break every categories surface — Discover, story
      // buttons — until the cache expired. Throwing keeps React Query from
      // caching it, so the next call re-fetches instead of serving the dud.
      if (!res?.categories || res.categories.length === 0) {
        throw new Error('metadata returned no categories; not caching');
      }
      return res;
    },
    staleTime: METADATA_STALE_TIME,
  });
}

/**
 * Active story themes (event collections) for the home button row. Routed
 * through the React Query cache like metadata — persisted to disk, deduped,
 * and an empty list is a VALID state (no events running), so it caches too.
 */
export async function getStoryThemes(language: string): Promise<StoryTheme[]> {
  const res = await queryClient.fetchQuery({
    queryKey: metadataKeys.storyThemes(language),
    queryFn: () => makeRequest<{ themes: StoryTheme[] }>(`/api/story-themes?language=${language}`),
    staleTime: STORY_THEMES_STALE_TIME,
  });
  return res.themes ?? [];
}

export interface StoryThemeFactsResponse {
  theme: StoryTheme;
  facts: FactResponse[];
  pagination: { limit: number; offset: number; has_more: boolean };
}

/**
 * One offset-page of facts collected by a theme's (server-side) search terms,
 * title-matches-first — the same ordering as search results.
 */
export async function getStoryThemeFacts(params: {
  slug: string;
  language: string;
  limit?: number;
  offset?: number;
}): Promise<StoryThemeFactsResponse> {
  const qp = new URLSearchParams();
  qp.append('language', params.language);
  if (params.limit !== undefined) qp.append('limit', String(params.limit));
  if (params.offset !== undefined) qp.append('offset', String(params.offset));
  return makeRequest<StoryThemeFactsResponse>(
    `/api/story-themes/${encodeURIComponent(params.slug)}/facts?${qp.toString()}`
  );
}

export interface GetFactByIdResponse {
  fact: FactResponse;
}

/**
 * Get a single fact by ID
 * @param id - The fact ID
 * @param language - The language to fetch the fact in (uses app's current locale)
 * @param includeQuestions - Whether to include trivia questions
 */
export async function getFactById(
  id: number,
  language: string,
  includeQuestions?: boolean
): Promise<FactResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append('language', language);
  if (includeQuestions) {
    queryParams.append('include_questions', 'true');
  }
  const query = queryParams.toString();
  const endpoint = `/api/facts/${id}?${query}`;
  const response = await makeRequest<GetFactByIdResponse>(endpoint);
  return response.fact;
}

/**
 * Get facts with filtering and pagination
 */
/**
 * Report a content issue with a specific fact
 */
export async function reportFact(
  factId: number,
  feedbackText: string
): Promise<ReportFactResponse> {
  if (feedbackText.length < 10) {
    throw new Error('Feedback text must be at least 10 characters long.');
  }

  if (feedbackText.length > 1000) {
    throw new Error('Feedback text must be at most 1000 characters long.');
  }

  // Identity headers (when a screen name exists) link the report to the user,
  // so support can resolve it and reply with a push.
  return makeRequest<ReportFactResponse>(`/api/facts/${factId}/report`, {
    method: 'POST',
    headers: await getIdentityHeaders(),
    body: JSON.stringify({ feedback_text: feedbackText }),
  });
}

// ====== User identity (screen names) ======

export interface CreateUserResponse {
  user_id: string;
  user_secret: string;
  screen_name: string;
  country_code: string | null;
}

/**
 * Claim a screen name, minting the anonymous identity. The secret in the
 * response exists only this once — the caller must persist it (userIdentity).
 * 409 (code SCREEN_NAME_TAKEN) when the name is in use.
 */
export async function createUser(
  screenName: string,
  countryCode: string | null
): Promise<CreateUserResponse> {
  return makeRequest<CreateUserResponse>('/api/users', {
    method: 'POST',
    body: JSON.stringify({
      screen_name: screenName,
      country_code: countryCode ?? undefined,
    }),
  });
}

/** Rename / refresh country for the current identity. 409 on a taken name. */
export async function updateUser(params: {
  screen_name?: string;
  country_code?: string;
}): Promise<{ ok: boolean; screen_name: string }> {
  return makeRequest<{ ok: boolean; screen_name: string }>('/api/users/me', {
    method: 'PATCH',
    headers: await getIdentityHeaders(),
    body: JSON.stringify(params),
  });
}

/** Live availability for the claim form (debounced by the caller). */
export async function checkScreenName(
  name: string
): Promise<{ available: boolean; valid: boolean }> {
  return makeRequest<{ available: boolean; valid: boolean }>(
    `/api/users/screen-name-check?name=${encodeURIComponent(name)}`,
    {},
    true // skipRetry: a stale availability answer is worse than none
  );
}

/**
 * Delete the current identity and everything personal to it (DELETE
 * /api/users/me): the server drops the screen name, all comments, blocks, and
 * identity links. Identity headers required. Apple guideline 5.1.1(v).
 */
export async function deleteAccount(): Promise<void> {
  await makeRequest<{ ok: boolean }>('/api/users/me', {
    method: 'DELETE',
    headers: await getIdentityHeaders(),
  });
}

// ====== Fact comments ======

export interface ApiComment {
  id: number;
  body: string;
  screen_name: string;
  country_code: string | null;
  /** Author's content language; lets the app offer a translation to readers in
   *  a different locale. Null for legacy comments posted before locale capture. */
  locale: string | null;
  created_at: string;
}

/** A comment translated into the reader's locale (from /api/comments/translate). */
export interface ApiCommentTranslation {
  id: number;
  body: string;
  source_locale: string | null;
}

export interface CommentsPage {
  comments: ApiComment[];
  /** Opaque "<created_at>|<id>" keyset token; round-trip verbatim. */
  next_cursor: string | null;
  total: number;
}

export async function getFactComments(
  factId: number,
  cursor?: string | null,
  limit?: number
): Promise<CommentsPage> {
  const qp = new URLSearchParams();
  if (cursor) qp.append('cursor', cursor);
  if (limit !== undefined) qp.append('limit', String(limit));
  const query = qp.toString();
  return makeRequest<CommentsPage>(
    `/api/facts/${factId}/comments${query ? `?${query}` : ''}`
  );
}

/** Post a comment. Requires a claimed screen name (401 without identity). */
export async function postFactComment(
  factId: number,
  body: string,
  locale: string
): Promise<ApiComment> {
  const res = await makeRequest<{ comment: ApiComment }>(
    `/api/facts/${factId}/comments`,
    {
      method: 'POST',
      headers: await getIdentityHeaders(),
      body: JSON.stringify({ body, locale }),
    }
  );
  return res.comment;
}

/**
 * Translate a batch of comments into `target` (the reader's locale). Anonymous
 * (App Check only); the server caches per (comment, locale), so repeat calls are
 * cheap. Returns only the comments that were actually translated — same-locale
 * or untranslatable ones are omitted and should render as their original.
 */
export async function translateComments(
  commentIds: number[],
  target: string
): Promise<ApiCommentTranslation[]> {
  if (commentIds.length === 0) return [];
  const res = await makeRequest<{ translations: ApiCommentTranslation[] }>(
    `/api/comments/translate`,
    {
      method: 'POST',
      body: JSON.stringify({ comment_ids: commentIds, target }),
    }
  );
  return res.translations;
}

// ====== On-demand feed / hydration (replaces the local facts mirror) ======

/**
 * One page of the cursor-paginated feed. The client pages by round-tripping
 * `next_cursor` verbatim (opaque token); newest-first. Replaces the app's
 * full-download-into-SQLite model.
 */
export async function getFactsFeed(params: GetFactsFeedParams): Promise<FactsFeedResponse> {
  const qp = new URLSearchParams();
  qp.append('language', params.language);
  if (params.categories) qp.append('categories', params.categories);
  if (params.includeHistorical) qp.append('include_historical', 'true');
  if (params.limit !== undefined) qp.append('limit', String(params.limit));
  if (params.cursor) qp.append('cursor', params.cursor);
  return makeRequest<FactsFeedResponse>(`/api/facts/feed?${qp.toString()}`);
}

/** Max ids per /api/facts/by-ids request (backend bounds the IN clause). */
const BY_IDS_CHUNK = 200;

/**
 * Hydrate specific facts by id (favorites, trivia review). Chunks above the
 * backend's 200-id cap and tolerates missing ids (deleted facts just drop out).
 */
export async function getFactsByIds(ids: number[], language: string): Promise<FactResponse[]> {
  if (ids.length === 0) return [];
  const out: FactResponse[] = [];
  for (let i = 0; i < ids.length; i += BY_IDS_CHUNK) {
    const chunk = ids.slice(i, i + BY_IDS_CHUNK);
    const qp = new URLSearchParams();
    qp.append('ids', chunk.join(','));
    qp.append('language', language);
    const res = await makeRequest<{ facts: FactResponse[] }>(`/api/facts/by-ids?${qp.toString()}`);
    out.push(...res.facts);
  }
  return out;
}

/**
 * "On this day" historical facts for today (or a given month/day): the exact
 * date plus a ±3-day week fallback the UI uses when the exact date is empty.
 */
export async function getOnThisDay(
  language: string,
  month?: number,
  day?: number
): Promise<OnThisDayResponse> {
  const qp = new URLSearchParams();
  qp.append('language', language);
  if (month !== undefined) qp.append('month', String(month));
  if (day !== undefined) qp.append('day', String(day));
  return makeRequest<OnThisDayResponse>(`/api/facts/on-this-day?${qp.toString()}`);
}

export interface SearchFactsParams {
  q: string;
  language: string;
  categories?: string;
  limit?: number;
  offset?: number;
}

/** Title-first LIKE search across facts (replaces the on-device SQL search). */
export async function searchFacts(params: SearchFactsParams): Promise<FactResponse[]> {
  const qp = new URLSearchParams();
  qp.append('q', params.q);
  qp.append('language', params.language);
  if (params.categories) qp.append('categories', params.categories);
  if (params.limit !== undefined) qp.append('limit', String(params.limit));
  if (params.offset !== undefined) qp.append('offset', String(params.offset));
  const res = await makeRequest<{ facts: FactResponse[] }>(`/api/facts/search?${qp.toString()}`);
  return res.facts;
}

// ====== Trivia (replaces the local questions table) ======

function triviaQuery(language: string, limit?: number, excludeIds?: number[]): string {
  const qp = new URLSearchParams();
  qp.append('language', language);
  if (limit !== undefined) qp.append('limit', String(limit));
  if (excludeIds && excludeIds.length > 0) {
    qp.append('exclude_question_ids', excludeIds.join(','));
  }
  return qp.toString();
}

/** Daily trivia: questions from facts created on the given UTC day (default today). */
export async function getTriviaDaily(
  language: string,
  limit?: number,
  excludeIds?: number[]
): Promise<TriviaQuestionResponse[]> {
  const res = await makeRequest<{ questions: TriviaQuestionResponse[] }>(
    `/api/trivia/daily?${triviaQuery(language, limit, excludeIds)}`
  );
  return res.questions;
}

/** Random/mixed trivia, excluding question ids the user already answered. */
export async function getTriviaRandom(
  language: string,
  limit?: number,
  excludeIds?: number[]
): Promise<TriviaQuestionResponse[]> {
  const res = await makeRequest<{ questions: TriviaQuestionResponse[] }>(
    `/api/trivia/random?${triviaQuery(language, limit, excludeIds)}`
  );
  return res.questions;
}

/** Category trivia, excluding mastered/answered question ids. */
export async function getTriviaCategory(
  slug: string,
  language: string,
  limit?: number,
  excludeIds?: number[]
): Promise<TriviaQuestionResponse[]> {
  const res = await makeRequest<{ questions: TriviaQuestionResponse[] }>(
    `/api/trivia/category/${encodeURIComponent(slug)}?${triviaQuery(language, limit, excludeIds)}`
  );
  return res.questions;
}

/**
 * Lightweight daily/mixed playable counts for the trivia hub — gates the mode
 * cards without fetching (and later re-fetching on tap) the full question
 * batches. Counts are capped at the supplied batch limits.
 */
export async function getTriviaAvailability(
  language: string,
  excludeIds?: number[],
  dailyLimit?: number,
  mixedLimit?: number
): Promise<{ daily: number; mixed: number }> {
  // React Query (instant within staleTime) over the shared ETag layer (a cheap
  // 304 when it does revalidate). Keyed by language only — the answered-exclude
  // list isn't in the key (it would thrash on every play); freshness after a
  // game is handled by invalidateTriviaAvailability() instead.
  return queryClient.fetchQuery({
    queryKey: triviaKeys.availability(language),
    queryFn: () => {
      const qp = new URLSearchParams();
      qp.append('language', language);
      if (dailyLimit) qp.append('daily_limit', String(dailyLimit));
      if (mixedLimit) qp.append('mixed_limit', String(mixedLimit));
      if (excludeIds && excludeIds.length > 0) {
        qp.append('exclude_question_ids', excludeIds.join(','));
      }
      return makeRequest<{ daily: number; mixed: number }>(
        `/api/trivia/availability?${qp.toString()}`
      );
    },
    staleTime: AVAILABILITY_STALE_TIME,
  });
}

/** Drop the cached availability counts so the next hub read refetches — call
 * after a game completes (the answered set changed) or on pull-to-refresh. */
export function invalidateTriviaAvailability(): void {
  queryClient.invalidateQueries({ queryKey: triviaKeys.all });
}

/** Hydrate specific trivia questions by id (past-session review). */
export async function getTriviaByIds(
  ids: number[],
  language: string
): Promise<TriviaQuestionResponse[]> {
  if (ids.length === 0) return [];
  const qp = new URLSearchParams();
  qp.append('ids', ids.join(','));
  qp.append('language', language);
  const res = await makeRequest<{ questions: TriviaQuestionResponse[] }>(
    `/api/trivia/by-ids?${qp.toString()}`
  );
  return res.questions;
}

// ====== Trivia leaderboard ======

export type TriviaLeaderboardWindow = 'today' | 'week' | 'all';

export interface TriviaResultSubmission {
  client_session_id: string;
  mode: 'daily' | 'mixed' | 'category';
  category_slug?: string;
  language: string;
  questions_total: number;
  correct_count: number;
  elapsed_ms: number;
}

export interface TriviaLeaderboardEntry {
  rank: number;
  screen_name: string;
  country_code: string | null;
  score: number;
  games: number;
  total_elapsed_ms: number;
}

export interface TriviaLeaderboardStanding {
  rank: number;
  score: number;
  games: number;
  total_elapsed_ms: number;
  total_players: number;
}

export interface TriviaLeaderboardResponse {
  window: TriviaLeaderboardWindow;
  entries: TriviaLeaderboardEntry[];
  me: TriviaLeaderboardStanding | null;
}

/** Submit a completed session (identity required). Replays of an
 * already-stored session come back accepted=false. */
export async function postTriviaResult(
  submission: TriviaResultSubmission
): Promise<{ accepted: boolean }> {
  return makeRequest<{ accepted: boolean }>(`/api/trivia/results`, {
    method: 'POST',
    headers: await getIdentityHeaders(),
    body: JSON.stringify(submission),
  });
}

/** Ranked board; identity headers (when present) add the viewer's standing. */
export async function getTriviaLeaderboard(
  window: TriviaLeaderboardWindow,
  limit?: number
): Promise<TriviaLeaderboardResponse> {
  const qp = new URLSearchParams();
  qp.append('window', window);
  if (limit) qp.append('limit', String(limit));
  return makeRequest<TriviaLeaderboardResponse>(`/api/trivia/leaderboard?${qp.toString()}`, {
    headers: await getIdentityHeaders(),
  });
}

// ====== Push registration ======

/**
 * Register this device's Expo push token + notification prefs with the backend
 * (server-driven push replaces on-device local scheduling). Idempotent upsert.
 */
export async function registerPushToken(params: RegisterPushParams): Promise<{ ok: boolean }> {
  // Identity headers link the device token to the user's profile (admin can
  // then reply to their reports with a push). Absent identity changes nothing.
  return makeRequest<{ ok: boolean }>('/api/devices', {
    method: 'POST',
    headers: await getIdentityHeaders(),
    body: JSON.stringify({
      expo_push_token: params.token,
      platform: params.platform,
      timezone: params.timezone,
      preferred_minutes: params.preferred_minutes,
      locale: params.locale,
      categories: params.categories,
    }),
  });
}
