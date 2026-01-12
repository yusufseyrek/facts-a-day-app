/**
 * Share Handlers - Simplified
 * Uses native share sheet only for maximum reliability
 */

import { Platform, Share as RNShare } from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { SHARE_IMAGE_FORMAT } from './config';

import type { SharePlatform, ShareResult, PlatformConfigMap } from './types';

/**
 * Get MIME type based on configured image format
 */
function getImageMimeType(): string {
  return SHARE_IMAGE_FORMAT === 'jpg' ? 'image/jpeg' : 'image/png';
}

/**
 * Ensure file URI has proper format
 */
function ensureFileUri(uri: string): string {
  if (uri.startsWith('file://')) return uri;
  return `file://${uri}`;
}

/**
 * Platform configuration for UI display
 * Simplified to just show "Share" button
 */
export const PLATFORM_CONFIG: PlatformConfigMap = {
  general: {
    label: 'Share',
    icon: 'share-2',
    color: '#6B7280',
  },
  // Keep these for backwards compatibility but they won't be shown
  instagram_stories: {
    label: 'Instagram',
    icon: 'instagram',
    color: '#E4405F',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: 'message-circle',
    color: '#25D366',
  },
  twitter: {
    label: 'X',
    icon: 'twitter',
    color: '#000000',
  },
  facebook: {
    label: 'Facebook',
    icon: 'facebook',
    color: '#1877F2',
  },
};

/**
 * Open native share sheet - works reliably on both platforms
 * Users can choose their preferred app from the system share sheet
 */
export async function shareGeneral(
  text: string,
  imageUri?: string,
  title?: string
): Promise<ShareResult> {
  try {
    // iOS: Use RNShare with url parameter for image + text
    if (Platform.OS === 'ios') {
      if (imageUri) {
        // iOS Share API supports both message and url (local file)
        const fileUri = ensureFileUri(imageUri);
        await RNShare.share({
          message: text,
          url: fileUri,
          title: title,
        });
        return { success: true, platform: 'general' };
      }
      // Text only
      await RNShare.share({ message: text, title });
      return { success: true, platform: 'general' };
    }

    // Android: Use expo-sharing for images
    if (imageUri) {
      const isAvailable = await Sharing.isAvailableAsync();
      console.log('[Share] Android - Sharing available:', isAvailable);
      console.log('[Share] Android - Image URI:', imageUri);

      if (isAvailable) {
        // Verify file exists - use full URI (FileSystem works better with file:// prefix)
        const fileUri = ensureFileUri(imageUri);
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        console.log('[Share] Android - File exists:', fileInfo.exists);

        if (fileInfo.exists) {
          await Sharing.shareAsync(fileUri, {
            mimeType: getImageMimeType(),
            dialogTitle: title || 'Share',
          });
          return { success: true, platform: 'general' };
        } else {
          console.error('[Share] Android - File not found:', fileUri);
        }
      }
    }

    // Fallback to text-only
    console.log('[Share] Android - Falling back to text-only share');
    await RNShare.share({ message: text, title });
    return { success: true, platform: 'general' };
  } catch (error) {
    console.error('[Share] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    // User cancelled is not an error
    if (
      message.includes('User did not share') ||
      message.includes('cancel') ||
      message.includes('dismissed')
    ) {
      return { success: false, platform: 'general', error: 'cancelled' };
    }
    return { success: false, platform: 'general', error: message };
  }
}

// Legacy exports - all redirect to shareGeneral for backwards compatibility
export const shareToInstagramStories = async (imageUri: string): Promise<ShareResult> =>
  shareGeneral('', imageUri);

export const shareToWhatsApp = async (text: string, imageUri?: string): Promise<ShareResult> =>
  shareGeneral(text, imageUri);

export const shareToTwitter = async (text: string, imageUri?: string): Promise<ShareResult> =>
  shareGeneral(text, imageUri);

export const shareToFacebook = async (
  text: string,
  imageUri?: string,
  _url?: string
): Promise<ShareResult> => shareGeneral(text, imageUri);

/**
 * Get list of available share platforms
 * Now only returns 'general' - the native share sheet
 */
export async function getAvailablePlatforms(): Promise<SharePlatform[]> {
  return ['general'];
}
