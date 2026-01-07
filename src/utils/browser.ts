import * as WebBrowser from "expo-web-browser";
import { hexColors, spacing, radius, sizes } from "../theme";

export interface OpenBrowserOptions {
  /** Theme mode for styling the browser controls */
  theme?: "light" | "dark";
  /** Target language code for translation (e.g., 'en', 'es', 'ja'). If provided, the URL will be opened through Google Translate. */
  translateTo?: string;
}

/**
 * Wraps a URL with Google Translate to show translated content.
 * @param url - The original URL to translate
 * @param targetLanguage - The target language code (e.g., 'en', 'es', 'ja')
 * @returns The Google Translate wrapped URL
 */
export function getTranslatedUrl(url: string, targetLanguage: string): string {
  const encodedUrl = encodeURIComponent(url);
  return `https://translate.google.com/translate?sl=auto&tl=${targetLanguage}&u=${encodedUrl}`;
}

/**
 * Opens a URL in an in-app browser instead of the external browser app.
 * Uses Safari View Controller on iOS and Chrome Custom Tabs on Android.
 * 
 * @param url - The URL to open
 * @param options - Browser options including theme and translation settings
 */
export async function openInAppBrowser(
  url: string,
  options: OpenBrowserOptions = {}
): Promise<WebBrowser.WebBrowserResult> {
  const { theme = "dark", translateTo } = options;
  const colors = hexColors[theme];

  // If translation is requested, wrap the URL with Google Translate
  const finalUrl = translateTo ? getTranslatedUrl(url, translateTo) : url;

  try {
    const result = await WebBrowser.openBrowserAsync(finalUrl, {
      // iOS-specific options
      controlsColor: colors.primary,
      dismissButtonStyle: "close",
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      // Android-specific options
      toolbarColor: colors.surface,
      secondaryToolbarColor: colors.background,
      enableBarCollapsing: true,
      showInRecents: true,
      // Shared options
      enableDefaultShareMenuItem: true,
    });

    return result;
  } catch (error) {
    console.error("Failed to open URL in browser:", error);
    throw error;
  }
}

/**
 * Dismisses the in-app browser if it's currently open.
 * This is a no-op on Android as Chrome Custom Tabs don't support programmatic dismissal.
 */
export function dismissBrowser(): void {
  WebBrowser.dismissBrowser();
}

