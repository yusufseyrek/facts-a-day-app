import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getCachedAppCheckToken } from './appCheckToken';

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

const API_BASE_URL = getApiBaseUrl();

// ====== Types ======

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color_hex: string;
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

export interface QuestionResponse {
  id: number;
  question_type: 'multiple_choice' | 'true_false';
  question_text: string;
  correct_answer: string;
  wrong_answers: string[] | null;
  explanation: string | null;
  difficulty: number;
}

export interface FactResponse {
  id: number;
  title?: string;
  content: string;
  summary?: string;
  category?: string;
  source_url?: string;
  image_url?: string;
  language: string;
  created_at: string;
  last_updated?: string;
  questions?: QuestionResponse[]; // Only present when include_questions=true
}

export interface FactsResponse {
  facts: FactResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface GetFactsParams {
  language: string;
  categories?: string;
  limit?: number;
  offset?: number;
  batch_size?: number;
  since_updated?: string;
  include_questions?: boolean;
}

export interface FeedbackRequest {
  fact_id?: number;
  feedback_type: 'report' | 'bug' | 'suggestion' | 'other';
  message: string;
  user_email?: string;
}

export interface FeedbackResponse {
  success: boolean;
  message: string;
  feedback_id?: number;
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

      // Don't retry on client errors (4xx except 429)
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
          console.log(`Retrying request (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
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
    // Get App Check token for protected endpoints (uses cache to prevent rate limiting)
    const appCheckToken = await getCachedAppCheckToken();
    
    // Build headers with App Check token if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    
    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(
        errorData.message || `API Error: ${response.status} ${response.statusText}`
      );

      // Add rate limit info to error if available
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          (error as any).retryAfter = parseInt(retryAfter, 10);
        }
      }

      throw error;
    }

    return await response.json();
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

// ====== API Endpoints ======

/**
 * Get metadata (categories, languages, content types)
 * Optionally specify language to get translated metadata
 */
export async function getMetadata(language?: string): Promise<MetadataResponse> {
  const endpoint = language ? `/api/metadata?language=${language}` : '/api/metadata';
  return makeRequest<MetadataResponse>(endpoint);
}

/**
 * Get facts with filtering and pagination
 */
export async function getFacts(params: GetFactsParams): Promise<FactsResponse> {
  const queryParams = new URLSearchParams();

  queryParams.append('language', params.language);

  if (params.categories) {
    queryParams.append('categories', params.categories);
  }

  if (params.limit !== undefined) {
    queryParams.append('limit', params.limit.toString());
  }

  if (params.offset !== undefined) {
    queryParams.append('offset', params.offset.toString());
  }

  if (params.batch_size !== undefined) {
    queryParams.append('batch_size', params.batch_size.toString());
  }

  if (params.since_updated) {
    queryParams.append('since_updated', params.since_updated);
  }

  if (params.include_questions) {
    queryParams.append('include_questions', 'true');
  }

  const endpoint = `/api/facts?${queryParams.toString()}`;
  return makeRequest<FactsResponse>(endpoint);
}

/**
 * Fetch ALL facts in batches
 * Automatically handles pagination
 */
export async function getAllFacts(
  language: string,
  categories?: string,
  onProgress?: (downloaded: number, total: number) => void,
  includeQuestions?: boolean
): Promise<FactResponse[]> {
  const allFacts: FactResponse[] = [];
  let offset = 0;
  let hasMore = true;
  const batchSize = 500;

  while (hasMore) {
    const response = await getFacts({
      language,
      categories,
      offset,
      batch_size: batchSize,
      include_questions: includeQuestions,
    });

    allFacts.push(...response.facts);

    // Report progress
    if (onProgress) {
      onProgress(allFacts.length, response.pagination.total);
    }

    hasMore = response.pagination.has_more;
    offset += batchSize;
  }

  return allFacts;
}

/**
 * Fetch all facts with retry logic for fail-safe implementation
 */
export async function getAllFactsWithRetry(
  language: string,
  categories?: string,
  onProgress?: (downloaded: number, total: number) => void,
  maxRetries = 3,
  includeQuestions?: boolean
): Promise<FactResponse[]> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      return await getAllFacts(language, categories, onProgress, includeQuestions);
    } catch (error) {
      lastError = error as Error;
      attempt++;

      if (attempt < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed to fetch facts after multiple retries');
}

/**
 * Submit feedback or report an issue
 */
export async function submitFeedback(
  feedback: FeedbackRequest
): Promise<FeedbackResponse> {
  return makeRequest<FeedbackResponse>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}

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

  return makeRequest<ReportFactResponse>(
    `/api/facts/${factId}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ feedback_text: feedbackText }),
    }
  );
}
