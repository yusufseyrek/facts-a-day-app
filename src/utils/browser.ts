import * as WebBrowser from "expo-web-browser";
import { tokens } from "../theme/tokens";

export interface OpenBrowserOptions {
  /** Theme mode for styling the browser controls */
  theme?: "light" | "dark";
}

/**
 * Opens a URL in an in-app browser instead of the external browser app.
 * Uses Safari View Controller on iOS and Chrome Custom Tabs on Android.
 */
export async function openInAppBrowser(
  url: string,
  options: OpenBrowserOptions = {}
): Promise<WebBrowser.WebBrowserResult> {
  const { theme = "dark" } = options;
  const colors = tokens.color[theme];

  try {
    const result = await WebBrowser.openBrowserAsync(url, {
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

