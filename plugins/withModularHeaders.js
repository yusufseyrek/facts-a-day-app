const { withDangerousMod, withPlugins } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Modifies the Podfile to configure modular headers for Firebase
 * and fix non-modular header errors with React Native Firebase.
 */
function withPodfileModifications(config) {
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

      // Add pod-specific modular headers for Firebase instead of global use_modular_headers!
      if (
        !podfileContent.includes("pod 'FirebaseCore', :modular_headers => true")
      ) {
        const targetMatch = podfileContent.match(
          /target ['"].*['"] do\s*\n\s*use_expo_modules!/
        );

        if (targetMatch) {
          const insertPosition = targetMatch.index + targetMatch[0].length;
          const beforeInsert = podfileContent.slice(0, insertPosition);
          const afterInsert = podfileContent.slice(insertPosition);

          const modularHeadersPods = `

  # Enable modular headers for Firebase Swift pods (required for static frameworks)
  pod 'FirebaseCore', :modular_headers => true
  pod 'FirebaseCoreInternal', :modular_headers => true
  pod 'FirebaseInstallations', :modular_headers => true
  pod 'GoogleUtilities', :modular_headers => true
  pod 'FirebaseCoreExtension', :modular_headers => true
  pod 'FirebaseSessions', :modular_headers => true
  pod 'GoogleDataTransport', :modular_headers => true
  pod 'nanopb', :modular_headers => true`;

          podfileContent = beforeInsert + modularHeadersPods + afterInsert;
          console.log(
            "[withModularHeaders] Successfully added pod-specific modular headers to Podfile"
          );
        }
      }

      // Add CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES fix
      const nonModularFix = `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES`;
      if (!podfileContent.includes(nonModularFix)) {
        const fixCode = `

    # Fix for non-modular header errors with React Native Firebase
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        # Disable Clang modules for RNFB pods to fix module import order issues
        if target.name.start_with?('RNFB')
          config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        end
      end
    end`;

        if (podfileContent.includes("post_install do |installer|")) {
          podfileContent = podfileContent.replace(
            /(\)\n  end\nend\s*)$/,
            `)${fixCode}\n  end\nend\n`
          );
          console.log(
            "[withModularHeaders] Successfully added non-modular header fix to Podfile"
          );
        }
      }

      // Remove global use_modular_headers! if present
      if (podfileContent.includes("use_modular_headers!")) {
        podfileContent = podfileContent.replace(
          /\n?# Enable modular headers for Firebase Swift pods\nuse_modular_headers!\n?/g,
          "\n"
        );
        console.log(
          "[withModularHeaders] Removed global use_modular_headers!"
        );
      }

      fs.writeFileSync(podfilePath, podfileContent, "utf-8");
      return config;
    },
  ]);
}

/**
 * Modifies the AppDelegate.swift to use Objective-C runtime for RNFBAppCheck
 * instead of a direct Swift module import, which avoids module compilation issues.
 */
function withAppDelegateModification(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        "AppDelegate.swift"
      );

      if (!fs.existsSync(appDelegatePath)) {
        console.warn(
          "[withModularHeaders] AppDelegate.swift not found, skipping modification"
        );
        return config;
      }

      let content = fs.readFileSync(appDelegatePath, "utf-8");

      // Check if RNFBAppCheck import exists and needs to be replaced
      if (
        content.includes("import RNFBAppCheck") &&
        content.includes("RNFBAppCheckModule.sharedInstance()")
      ) {
        // Remove the import statement
        content = content.replace(/import RNFBAppCheck\n/g, "");

        // Replace direct call with Objective-C runtime call
        content = content.replace(
          /RNFBAppCheckModule\.sharedInstance\(\)/g,
          `// Initialize RNFBAppCheck via Objective-C runtime (avoids module import issues)
    if let appCheckClass = NSClassFromString("RNFBAppCheckModule") as? NSObject.Type,
       appCheckClass.responds(to: Selector(("sharedInstance"))) {
      _ = appCheckClass.perform(Selector(("sharedInstance")))
    }`
        );

        fs.writeFileSync(appDelegatePath, content, "utf-8");
        console.log(
          "[withModularHeaders] Modified AppDelegate.swift to use runtime-based RNFBAppCheck initialization"
        );
      }

      return config;
    },
  ]);
}

/**
 * Main plugin that applies all modular header fixes for Firebase with static frameworks.
 */
function withModularHeaders(config) {
  return withPlugins(config, [
    withPodfileModifications,
    withAppDelegateModification,
  ]);
}

module.exports = withModularHeaders;
