const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Kotlin metadata compatibility shim for the Google Mobile Ads SDK.
 *
 * play-services-ads 25.4.0 (pulled transitively by react-native-google-mobile-ads
 * 16.4.0) is compiled with Kotlin 2.3.0 metadata, which is AHEAD of the Kotlin
 * 2.1.20 toolchain Expo SDK 57 / RN 0.86 ships (set via expo-build-properties
 * android.kotlinVersion). kotlinc is forward-incompatible across two minor
 * versions, so every module that reads the ads jar fails to compile with:
 *   "Module was compiled with an incompatible version of Kotlin.
 *    The binary version of its metadata is 2.3.0, expected version is 2.1.0."
 *
 * This appends -Xskip-metadata-version-check to EVERY module's Kotlin compile
 * (android/ is CNG-regenerated, so this must be a plugin, not a manual edit), so
 * the 2.1.20 compiler consumes the newer metadata. Consuming a binary library's
 * API this way is safe; the check is conservative. Remove this plugin once the
 * Expo/RN Android toolchain ships Kotlin >= 2.3 (or once RNGMA pins an ads SDK
 * built with an older Kotlin).
 */
const MARKER = "-Xskip-metadata-version-check";

const SNIPPET = `

// [withGoogleAdsKotlinMetadata] play-services-ads 25.4.0 (RNGMA 16.4.0) ships
// Kotlin 2.3.0 metadata, ahead of the SDK-57 toolchain's Kotlin 2.1.20; let the
// compiler read it. Remove when the toolchain ships Kotlin >= 2.3.
allprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions {
      freeCompilerArgs.add("${MARKER}")
    }
  }
}
`;

module.exports = function withGoogleAdsKotlinMetadata(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "[withGoogleAdsKotlinMetadata] Expected a groovy android/build.gradle",
      );
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
