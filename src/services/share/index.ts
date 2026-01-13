/**
 * Share Service Exports
 */

// Config
export * from './config';

// Main service
export { shareService } from './shareService';

// Types
export type {
  SharePlatform,
  ShareableFact,
  ShareOptions,
  ShareResult,
  GeneratedShareCard,
  PlatformConfig,
  PlatformConfigMap,
} from './types';

// Platform configuration
export { PLATFORM_CONFIG, getAvailablePlatforms } from './platforms';

// Deep link utilities
export {
  generateDeepLink,
  generateAppLink,
  getAppStoreUrl,
  generateShareText,
  generateShortShareText,
} from './deepLinks';

// Image generation utilities
export { generateShareCard, cleanupShareCards, getShareImagesDir } from './imageGenerator';
