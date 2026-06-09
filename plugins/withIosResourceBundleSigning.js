const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Xcode 14+ signs resource bundles by default, which fails on EAS Build with:
 *   "resource bundles are signed by default, which requires setting the
 *    development team for each resource bundle target."
 *
 * Several pods we depend on ship resource bundles (Firebase, GoogleMobileAds,
 * Google UMP/consent SDK, etc.). Resource bundles don't need signing, so we
 * disable it for every resource-bundle target in the Podfile's post_install.
 *
 * This is a dedicated plugin (rather than folding into withModularHeaders)
 * because it appends to post_install via a robust marker check instead of a
 * brittle tail regex, so it lands regardless of the generated Podfile shape.
 */
const MARKER = '# [withIosResourceBundleSigning] disable resource-bundle signing';

const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.bundle'
        target.build_configurations.each do |bundle_config|
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

      // Insert just inside the existing `post_install do |installer|` block.
      const anchor = 'post_install do |installer|';
      const idx = contents.indexOf(anchor);
      if (idx === -1) {
        console.warn('[withIosResourceBundleSigning] no post_install block found, skipping');
        return config;
      }
      const insertAt = idx + anchor.length;
      contents = contents.slice(0, insertAt) + '\n' + SNIPPET + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents, 'utf-8');
      console.log('[withIosResourceBundleSigning] disabled resource-bundle signing in Podfile');
      return config;
    },
  ]);
};
