const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Xcode 14+ signs resource bundles by default, which fails on EAS Build with:
 *   "resource bundles are signed by default, which requires setting the
 *    development team for each resource bundle target."
 *
 * Several pods we depend on ship resource bundles (Firebase, GoogleMobileAds,
 * Google UMP/consent SDK, etc.). Resource bundles don't need signing.
 *
 * The robust, Expo-merged fix (expo/expo#19095, facebook/react-native#34826)
 * iterates CocoaPods' own installation-result objects — NOT the raw Xcode
 * project targets — and disables signing on every `resource_bundle_target`.
 * It MUST run AFTER `react_native_post_install(...)`, otherwise RN's own
 * post_install overwrites the build settings and the fix never sticks.
 *
 * Our previous attempt iterated `installer.pods_project.targets` filtered by
 * `product_type == 'com.apple.product-type.bundle'` and ran BEFORE
 * react_native_post_install — both wrong, which is why the error recurred.
 */
const MARKER = '# [withIosResourceBundleSigning] disable resource-bundle signing';

const SNIPPET = `
    ${MARKER}
    installer.target_installation_results.pod_target_installation_results
      .each do |pod_name, target_installation_result|
      target_installation_result.resource_bundle_targets.each do |resource_bundle_target|
        resource_bundle_target.build_configurations.each do |bundle_config|
          bundle_config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        end
      end
    end
`;

module.exports = function withIosResourceBundleSigning(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.warn('[withIosResourceBundleSigning] Podfile not found, skipping');
        return config;
      }

      let contents = fs.readFileSync(podfilePath, 'utf-8');
      if (contents.includes(MARKER)) {
        return config; // already applied (idempotent)
      }

      // Anchor: insert immediately AFTER the react_native_post_install(...) call
      // so RN's post_install can't overwrite our build settings. The call spans
      // multiple lines and contains a nested paren (ccache_enabled?(...)), so we
      // match allowing exactly one level of nesting to land on the real close.
      const anchorRe = /react_native_post_install\((?:[^()]|\([^()]*\))*\)/;
      const match = contents.match(anchorRe);
      if (!match) {
        console.warn(
          '[withIosResourceBundleSigning] react_native_post_install(...) not found, skipping'
        );
        return config;
      }
      const insertAt = match.index + match[0].length;
      contents = contents.slice(0, insertAt) + '\n' + SNIPPET + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents, 'utf-8');
      console.log(
        '[withIosResourceBundleSigning] disabled resource-bundle signing (after react_native_post_install)'
      );
      return config;
    },
  ]);
};
