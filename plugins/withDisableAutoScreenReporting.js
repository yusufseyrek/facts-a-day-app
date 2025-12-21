const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

/**
 * Custom Expo config plugin to disable Firebase automatic screen reporting.
 * This prevents Firebase from sending automatic screen_view events on both iOS and Android.
 */
function withDisableAutoScreenReporting(config) {
  // Handle Android
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn(
        "[withDisableAutoScreenReporting] Could not find application element in AndroidManifest.xml"
      );
      return config;
    }

    // Initialize meta-data array if it doesn't exist
    if (!application["meta-data"]) {
      application["meta-data"] = [];
    }

    // Check if the meta-data already exists
    const existingMetaData = application["meta-data"].find(
      (item) =>
        item.$?.["android:name"] ===
        "google_analytics_automatic_screen_reporting_enabled"
    );

    if (existingMetaData) {
      console.log(
        "[withDisableAutoScreenReporting] google_analytics_automatic_screen_reporting_enabled already present in AndroidManifest.xml"
      );
      return config;
    }

    // Add the meta-data to disable automatic screen reporting
    // Using tools:replace to override the value from react-native-firebase_analytics
    application["meta-data"].push({
      $: {
        "android:name": "google_analytics_automatic_screen_reporting_enabled",
        "android:value": "false",
        "tools:replace": "android:value",
      },
    });

    console.log(
      "[withDisableAutoScreenReporting] Disabled automatic screen reporting in AndroidManifest.xml"
    );

    return config;
  });

  // Handle iOS
  config = withInfoPlist(config, (config) => {
    // Set FirebaseAutomaticScreenReportingEnabled to false
    config.modResults.FirebaseAutomaticScreenReportingEnabled = false;

    console.log(
      "[withDisableAutoScreenReporting] Disabled automatic screen reporting in Info.plist"
    );

    return config;
  });

  return config;
}

module.exports = withDisableAutoScreenReporting;
