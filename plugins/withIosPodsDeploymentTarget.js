const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BUMP_MARKER = '# expo-build-properties deployment_target bump';

/**
 * Some third-party pods (e.g. expo-iap, posthog-react-native-session-replay,
 * react-native-view-shot) pin IPHONEOS_DEPLOYMENT_TARGET below the umbrella
 * Podfile platform. CocoaPods does not auto-raise those values, so importing
 * a framework built for the higher umbrella target (ExpoModulesCore on iOS
 * 16.4) fails with "compiling for iOS 15.1, but module has minimum 16.4".
 *
 * This patches the Podfile's post_install to bump every pod's
 * IPHONEOS_DEPLOYMENT_TARGET up to the value declared in
 * Podfile.properties.json (ios.deploymentTarget), which expo-build-properties
 * writes from app.json.
 */
function withIosPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );

      if (!fs.existsSync(podfilePath)) {
        console.warn(
          '[withIosPodsDeploymentTarget] Podfile not found, skipping'
        );
        return config;
      }

      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (contents.includes(BUMP_MARKER)) {
        return config;
      }

      const snippet = `

    ${BUMP_MARKER}
    min_ios = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new(min_ios)
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_ios
        end
      end
    end`;

      // Inject just before the closing 'end' of the post_install block.
      const postInstallMatch = contents.match(
        /(post_install do \|installer\|[\s\S]*?)\n(\s*)end\s*\nend\s*$/
      );

      if (!postInstallMatch) {
        console.warn(
          '[withIosPodsDeploymentTarget] Could not locate post_install block in Podfile'
        );
        return config;
      }

      const insertAt = postInstallMatch.index + postInstallMatch[1].length;
      contents =
        contents.slice(0, insertAt) + snippet + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents, 'utf-8');
      console.log(
        '[withIosPodsDeploymentTarget] Patched Podfile post_install to bump pod deployment targets'
      );

      return config;
    },
  ]);
}

module.exports = withIosPodsDeploymentTarget;
