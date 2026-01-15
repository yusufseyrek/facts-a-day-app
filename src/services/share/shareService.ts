/**
 * Share Service
 * Main orchestration service for sharing facts
 */

import ViewShot from 'react-native-view-shot';

import * as Haptics from 'expo-haptics';

import { trackFactShareWithPlatform } from '../analytics';

import { generateDeepLink,generateShareText, generateShortShareText } from './deepLinks';
import { cleanupShareCards,generateShareCard } from './imageGenerator';
import {
  getAvailablePlatforms,
  shareGeneral,
  shareToFacebook,
  shareToInstagramStories,
  shareToTwitter,
  shareToWhatsApp,
} from './platforms';

import type { ShareableFact, ShareOptions, SharePlatform,ShareResult } from './types';

/**
 * Default share options
 */
const DEFAULT_OPTIONS: ShareOptions = {
  platform: 'general',
  includeImage: true,
  includeDeepLink: true,
};

/**
 * ShareService class
 * Manages share operations and ViewShot reference
 */
class ShareServiceImpl {
  private viewShotRef: React.RefObject<ViewShot | null> | null = null;

  /**
   * Set the ViewShot reference for image capture
   * Call this when the ShareCard component mounts
   */
  setViewShotRef(ref: React.RefObject<ViewShot | null>): void {
    this.viewShotRef = ref;
  }

  /**
   * Clear the ViewShot reference
   * Call this when the ShareCard component unmounts
   */
  clearViewShotRef(): void {
    this.viewShotRef = null;
  }

  /**
   * Share a fact to a specific platform or general share sheet
   */
  async share(fact: ShareableFact, options: Partial<ShareOptions> = {}): Promise<ShareResult> {
    const { platform, includeImage, includeDeepLink } = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    // Haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Generate image if needed and ViewShot ref is available
      let imageUri: string | undefined;
      if (includeImage && this.viewShotRef) {
        const card = await generateShareCard(this.viewShotRef, fact.id);
        imageUri = card?.uri;
      }

      // Generate text content
      const text =
        platform === 'twitter'
          ? generateShortShareText(fact, 280)
          : generateShareText(fact, includeDeepLink);

      // Route to appropriate platform handler
      let result: ShareResult;

      switch (platform) {
        case 'instagram_stories':
          if (imageUri) {
            result = await shareToInstagramStories(imageUri);
          } else {
            return {
              success: false,
              platform,
              error: 'Image required for Instagram Stories',
            };
          }
          break;

        case 'whatsapp':
          result = await shareToWhatsApp(text, imageUri);
          break;

        case 'twitter':
          result = await shareToTwitter(text, imageUri);
          break;

        case 'facebook': {
          const deepLink = includeDeepLink ? generateDeepLink(fact.id) : undefined;
          result = await shareToFacebook(text, imageUri, deepLink);
          break;
        }

        case 'general':
        default:
          result = await shareGeneral(text, imageUri, fact.title);
          break;
      }

      // Track analytics for successful shares (not cancellations)
      if (result.success) {
        const category =
          typeof fact.category === 'string' ? fact.category : fact.category?.slug || 'unknown';

        trackFactShareWithPlatform({
          factId: fact.id,
          category,
          platform: platform!,
          success: true,
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        platform: platform!,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get list of available share platforms
   */
  async getAvailablePlatforms(): Promise<SharePlatform[]> {
    return getAvailablePlatforms();
  }

  /**
   * Clean up share card images from cache
   */
  async cleanup(): Promise<void> {
    await cleanupShareCards();
  }
}

// Export singleton instance
export const shareService = new ShareServiceImpl();
