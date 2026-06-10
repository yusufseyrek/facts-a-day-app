const { withDangerousMod, withPlugins } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * AdMob Mediation Adapters Configuration
 *
 * Adds Liftoff Monetize (Vungle) and Unity Ads
 * as mediation partners for Google AdMob.
 */

// iOS CocoaPods dependencies. Deliberately unpinned: each adapter podspec
// declares its required Google-Mobile-Ads-SDK range, and RNGoogleMobileAds
// pins the exact GMA version, so CocoaPods automatically resolves the newest
// adapter compatible with the wrapper's GMA — newer-but-incompatible adapter
// releases are skipped, not broken against.
const IOS_PODS = [
  "GoogleMobileAdsMediationVungle",
  "GoogleMobileAdsMediationUnity",
];

// Android Gradle dependencies. Gradle has no equivalent compatibility
// resolution, so these are hand-pinned to the newest adapters built against
// the play-services-ads version that react-native-google-mobile-ads ships
// (25.0.0 as of RNGMA 16.3.3 — check node_modules/react-native-google-mobile-ads/
// package.json sdkVersions). Newer adapters (unity 4.18+, vungle 7.7.3+) are
// built against play-services-ads 25.2.0 and would transitively drag the core
// ads SDK past what the wrapper was tested with — revisit when RNGMA bumps
// its GMA pin. The adapter POMs at
// https://dl.google.com/dl/android/maven2/com/google/ads/mediation/ declare
// each version's play-services-ads target.
const ANDROID_DEPENDENCIES = [
  "com.google.ads.mediation:vungle:7.7.2.0",
  "com.unity3d.ads:unity-ads:4.17.0",
  "com.google.ads.mediation:unity:4.17.0.0",
];

/**
 * Adds mediation adapter pods to the iOS Podfile.
 */
function withMediationPods(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      if (!fs.existsSync(podfilePath)) {
        console.warn(
          "[withAdMobMediation] Podfile not found, skipping iOS mediation setup"
        );
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, "utf-8");

      // Check if mediation pods are already added
      if (podfileContent.includes("GoogleMobileAdsMediationUnity")) {
        console.log(
          "[withAdMobMediation] Mediation pods already present in Podfile"
        );
        return config;
      }

      // Find the target block to insert pods
      const targetMatch = podfileContent.match(
        /target ['"].*['"] do\s*\n\s*use_expo_modules!/
      );

      if (targetMatch) {
        const insertPosition = targetMatch.index + targetMatch[0].length;
        const beforeInsert = podfileContent.slice(0, insertPosition);
        const afterInsert = podfileContent.slice(insertPosition);

        const mediationPods = IOS_PODS.map(
          (pod) => `  pod '${pod}'`
        ).join("\n");

        const insertion = `

  # AdMob Mediation Adapters (Liftoff/Vungle, Unity Ads)
${mediationPods}`;

        podfileContent = beforeInsert + insertion + afterInsert;

        fs.writeFileSync(podfilePath, podfileContent, "utf-8");
        console.log(
          "[withAdMobMediation] Successfully added mediation adapter pods to Podfile"
        );
      } else {
        console.warn(
          "[withAdMobMediation] Could not find target block in Podfile"
        );
      }

      return config;
    },
  ]);
}

/**
 * Adds mediation adapter dependencies to the Android build.gradle.
 */
function withMediationGradle(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const buildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "build.gradle"
      );

      if (!fs.existsSync(buildGradlePath)) {
        console.warn(
          "[withAdMobMediation] app/build.gradle not found, skipping Android mediation setup"
        );
        return config;
      }

      let gradleContent = fs.readFileSync(buildGradlePath, "utf-8");

      // Check if mediation dependencies are already added
      if (gradleContent.includes("com.google.ads.mediation:unity")) {
        console.log(
          "[withAdMobMediation] Mediation dependencies already present in build.gradle"
        );
        return config;
      }

      // Find the dependencies block
      const depsMatch = gradleContent.match(/dependencies\s*\{/);

      if (depsMatch) {
        const insertPosition = depsMatch.index + depsMatch[0].length;
        const beforeInsert = gradleContent.slice(0, insertPosition);
        const afterInsert = gradleContent.slice(insertPosition);

        const mediationDeps = ANDROID_DEPENDENCIES.map(
          (dep) => `    implementation("${dep}")`
        ).join("\n");

        const insertion = `
    // AdMob Mediation Adapters (Liftoff/Vungle, Unity Ads)
${mediationDeps}
`;

        gradleContent = beforeInsert + insertion + afterInsert;

        fs.writeFileSync(buildGradlePath, gradleContent, "utf-8");
        console.log(
          "[withAdMobMediation] Successfully added mediation adapter dependencies to build.gradle"
        );
      } else {
        console.warn(
          "[withAdMobMediation] Could not find dependencies block in build.gradle"
        );
      }

      return config;
    },
  ]);
}

/**
 * Main plugin that adds AdMob mediation adapters for both platforms.
 */
function withAdMobMediation(config) {
  return withPlugins(config, [withMediationPods, withMediationGradle]);
}

module.exports = withAdMobMediation;
