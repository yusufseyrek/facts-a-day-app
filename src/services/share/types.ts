/**
 * Share Service Types
 * TypeScript type definitions for the share library
 */

import type { Category } from '../database';

/**
 * Supported share platforms
 */
export type SharePlatform = 'instagram_stories' | 'whatsapp' | 'twitter' | 'facebook' | 'general';

/**
 * Fact data required for sharing
 */
export interface ShareableFact {
  id: number;
  title: string;
  content: string;
  category?: string | Category;
  imageUri?: string;
}

/**
 * Options for customizing share behavior
 */
export interface ShareOptions {
  platform?: SharePlatform;
  includeImage: boolean;
  includeDeepLink: boolean;
}

/**
 * Result of a share operation
 */
export interface ShareResult {
  success: boolean;
  platform: SharePlatform;
  error?: string;
}

/**
 * Generated share card image data
 */
export interface GeneratedShareCard {
  uri: string;
  width: number;
  height: number;
}

/**
 * Platform configuration for UI display
 */
export interface PlatformConfig {
  label: string;
  icon: string;
  color: string;
}

/**
 * Map of platform configurations
 */
export type PlatformConfigMap = Record<SharePlatform, PlatformConfig>;
