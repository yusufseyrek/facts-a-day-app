const { withAndroidStyles } = require("expo/config-plugins");

/**
 * Custom Expo config plugin to set android:windowBackground in styles.xml.
 * This prevents the white flash during screen transitions in dark mode by
 * ensuring the Android window background matches the app's dark theme.
 */
function withAndroidWindowBackground(config, { backgroundColor = "@color/splashscreen_background" } = {}) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults;
    
    // Find the AppTheme style
    const appTheme = styles.resources.style?.find(
      (style) => style.$.name === "AppTheme"
    );

    if (appTheme) {
      // Check if windowBackground already exists
      const existingItem = appTheme.item?.find(
        (item) => item.$?.name === "android:windowBackground"
      );

      if (!existingItem) {
        // Add the windowBackground item
        if (!appTheme.item) {
          appTheme.item = [];
        }
        appTheme.item.push({
          $: { name: "android:windowBackground" },
          _: backgroundColor,
        });
        console.log(
          "[withAndroidWindowBackground] Added android:windowBackground to AppTheme"
        );
      } else {
        console.log(
          "[withAndroidWindowBackground] android:windowBackground already exists in AppTheme"
        );
      }
    } else {
      console.warn(
        "[withAndroidWindowBackground] AppTheme not found in styles.xml"
      );
    }

    return config;
  });
}

module.exports = withAndroidWindowBackground;

