const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Custom Expo config plugin to add `use_modular_headers!` to the iOS Podfile.
 * This is required for Firebase pods to work correctly with static frameworks.
 */
function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      if (!fs.existsSync(podfilePath)) {
        console.warn(
          "[withModularHeaders] Podfile not found, skipping modification"
        );
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, "utf-8");

      // Check if use_modular_headers! already exists
      if (podfileContent.includes("use_modular_headers!")) {
        console.log(
          "[withModularHeaders] use_modular_headers! already present in Podfile"
        );
        return config;
      }

      // Find the position to insert use_modular_headers!
      // We want to add it after prepare_react_native_project! and before the target block
      const prepareReactNativeMatch = podfileContent.match(
        /prepare_react_native_project!\s*\n/
      );

      if (prepareReactNativeMatch) {
        const insertPosition =
          prepareReactNativeMatch.index + prepareReactNativeMatch[0].length;

        const beforeInsert = podfileContent.slice(0, insertPosition);
        const afterInsert = podfileContent.slice(insertPosition);

        podfileContent =
          beforeInsert +
          "\n# Enable modular headers for Firebase Swift pods\nuse_modular_headers!\n" +
          afterInsert;

        fs.writeFileSync(podfilePath, podfileContent, "utf-8");
        console.log(
          "[withModularHeaders] Successfully added use_modular_headers! to Podfile"
        );
      } else {
        // Fallback: add after platform declaration
        const platformMatch = podfileContent.match(
          /platform :ios,.*\n/
        );

        if (platformMatch) {
          const insertPosition =
            platformMatch.index + platformMatch[0].length;

          const beforeInsert = podfileContent.slice(0, insertPosition);
          const afterInsert = podfileContent.slice(insertPosition);

          podfileContent =
            beforeInsert +
            "\n# Enable modular headers for Firebase Swift pods\nuse_modular_headers!\n" +
            afterInsert;

          fs.writeFileSync(podfilePath, podfileContent, "utf-8");
          console.log(
            "[withModularHeaders] Successfully added use_modular_headers! to Podfile (after platform)"
          );
        } else {
          console.warn(
            "[withModularHeaders] Could not find suitable position to insert use_modular_headers!"
          );
        }
      }

      return config;
    },
  ]);
}

module.exports = withModularHeaders;


