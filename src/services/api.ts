import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000';
const DEVICE_KEY_STORAGE_KEY = 'device_key';

// ====== Types ======

export interface DeviceInfo {
  platform: 'ios' | 'android';
  app_version: string;
  device_model: string;
  os_version: string;
  device_id?: string;
  device_name?: string;
  timezone?: string;
  language_preference?: string;
}

export interface DeviceRegistrationResponse {
  device_key: string;
  registered_at: string;
}

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

export interface ContentType {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface MetadataResponse {
  categories: Category[];
  languages: Language[];
  content_types: ContentType[];
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface FactResponse {
  id: number;
  title?: string;
  content: string;
  summary?: string;
  difficulty?: string;
  content_type?: string;
  category?: string;
  tags?: Tag[];
  source_url?: string;
  reading_time?: number;
  word_count?: number;
  image_url?: string;
  language: string;
  created_at: string;
  updated_at?: string;
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
  difficulty?: string;
  content_type?: string;
  limit?: number;
  offset?: number;
  batch_size?: number;
  since_updated?: string;
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

// ====== Device Key Management ======

export async function getStoredDeviceKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Error getting device key:', error);
    return null;
  }
}

export async function storeDeviceKey(deviceKey: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DEVICE_KEY_STORAGE_KEY, deviceKey);
  } catch (error) {
    console.error('Error storing device key:', error);
    throw error;
  }
}

export async function clearDeviceKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DEVICE_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing device key:', error);
  }
}

// ====== API Helpers ======

async function makeRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `API Error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    throw error;
  }
}

async function makeAuthenticatedRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const deviceKey = await getStoredDeviceKey();

  if (!deviceKey) {
    throw new Error('No device key found. Please register your device first.');
  }

  return makeRequest<T>(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${deviceKey}`,
      ...options.headers,
    },
  });
}

// ====== API Endpoints ======

/**
 * Register a new device and get an API key
 */
export async function registerDevice(
  deviceInfo: DeviceInfo
): Promise<DeviceRegistrationResponse> {
  const response = await makeRequest<DeviceRegistrationResponse>(
    '/api/devices/register',
    {
      method: 'POST',
      body: JSON.stringify(deviceInfo),
    }
  );

  // Store the device key automatically
  await storeDeviceKey(response.device_key);

  return response;
}

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
 * Requires authentication
 */
export async function getFacts(params: GetFactsParams): Promise<FactsResponse> {
  const queryParams = new URLSearchParams();

  queryParams.append('language', params.language);

  if (params.categories) {
    queryParams.append('categories', params.categories);
  }

  if (params.difficulty) {
    queryParams.append('difficulty', params.difficulty);
  }

  if (params.content_type) {
    queryParams.append('content_type', params.content_type);
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

  const endpoint = `/api/facts?${queryParams.toString()}`;
  return makeAuthenticatedRequest<FactsResponse>(endpoint);
}

/**
 * Fetch ALL facts in batches
 * Automatically handles pagination
 * Requires authentication
 */
export async function getAllFacts(
  language: string,
  categories?: string,
  difficulty?: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<FactResponse[]> {
  const allFacts: FactResponse[] = [];
  let offset = 0;
  let hasMore = true;
  const batchSize = 1000;

  while (hasMore) {
    const response = await getFacts({
      language,
      categories,
      difficulty,
      offset,
      batch_size: batchSize,
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
  difficulty?: string,
  onProgress?: (downloaded: number, total: number) => void,
  maxRetries = 3
): Promise<FactResponse[]> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      return await getAllFacts(language, categories, difficulty, onProgress);
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
 * Requires authentication
 */
export async function submitFeedback(
  feedback: FeedbackRequest
): Promise<FeedbackResponse> {
  return makeAuthenticatedRequest<FeedbackResponse>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}

/**
 * Report a content issue with a specific fact
 * Requires authentication
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

  return makeAuthenticatedRequest<ReportFactResponse>(
    `/api/facts/${factId}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ feedback_text: feedbackText }),
    }
  );
}
