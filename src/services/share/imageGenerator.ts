/**
 * Image Generator Service
 * Captures share cards as images using ViewShot
 */

import ViewShot from 'react-native-view-shot';

import * as FileSystem from 'expo-file-system/legacy';

import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, SHARE_IMAGE_FORMAT } from './config';

import type { GeneratedShareCard } from './types';

const SHARE_IMAGES_DIR = `${FileSystem.documentDirectory}share-cards/`;

/**
 * Generate a share card image from a ViewShot ref
 * @param viewShotRef - Reference to the ViewShot component wrapping the share card
 * @param factId - ID of the fact (used for filename)
 * @returns Generated image data or null if capture failed
 */
export async function generateShareCard(
  viewShotRef: React.RefObject<ViewShot | null>,
  factId: number
): Promise<GeneratedShareCard | null> {
  try {
    console.log('[ImageGen] Starting capture for factId:', factId);
    console.log('[ImageGen] ViewShot ref exists:', !!viewShotRef.current);

    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(SHARE_IMAGES_DIR);
    console.log('[ImageGen] Directory exists:', dirInfo.exists);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(SHARE_IMAGES_DIR, { intermediates: true });
      console.log('[ImageGen] Created directory');
    }

    // Capture the view
    const uri = await viewShotRef.current?.capture?.();
    console.log('[ImageGen] Capture URI:', uri);
    if (!uri) {
      console.warn('[ImageGen] ViewShot capture returned undefined');
      return null;
    }

    // Verify capture file exists
    const captureInfo = await FileSystem.getInfoAsync(uri);
    console.log('[ImageGen] Capture file exists:', captureInfo.exists);

    // Generate unique filename
    const filename = `share-card-${factId}-${Date.now()}.${SHARE_IMAGE_FORMAT}`;
    const destUri = `${SHARE_IMAGES_DIR}${filename}`;
    console.log('[ImageGen] Destination:', destUri);

    // Copy to cache directory
    await FileSystem.copyAsync({ from: uri, to: destUri });
    console.log('[ImageGen] Copy completed');

    // Verify destination file exists
    const destInfo = await FileSystem.getInfoAsync(destUri);
    console.log('[ImageGen] Destination file exists:', destInfo.exists);

    return {
      uri: destUri,
      width: SHARE_CARD_WIDTH,
      height: SHARE_CARD_HEIGHT,
    };
  } catch (error) {
    console.error('[ImageGen] Error generating share card:', error);
    return null;
  }
}

/**
 * Clean up old share card images from cache
 * Call this periodically or on app background
 */
export async function cleanupShareCards(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(SHARE_IMAGES_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(SHARE_IMAGES_DIR, { idempotent: true });
    }
  } catch {
    // Silently fail cleanup - not critical
  }
}

/**
 * Get the share images directory path
 */
export function getShareImagesDir(): string {
  return SHARE_IMAGES_DIR;
}
