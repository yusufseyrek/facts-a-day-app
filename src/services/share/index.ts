/**
 * Share Service Exports
 */

// Config
export * from './config';

// Main service
export { shareService } from './shareService';

// Types
export type {
  GeneratedShareCard,
  PlatformConfig,
  PlatformConfigMap,
  ShareableFact,
  ShareOptions,
  SharePlatform,
  ShareResult,
} from './types';

// Platform configuration
export { getAvailablePlatforms,PLATFORM_CONFIG } from './platforms';

// Deep link utilities
export {
  generateAppLink,
  generateDeepLink,
  generateShareText,
  generateShortShareText,
  getAppStoreUrl,
} from './deepLinks';

// Image generation utilities
export { cleanupShareCards, generateShareCard, getShareImagesDir } from './imageGenerator';
