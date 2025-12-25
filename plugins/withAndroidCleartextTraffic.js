const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Creates network_security_config.xml to allow cleartext traffic for local development
 */
function withNetworkSecurityConfig(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const resPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      
      // Create xml directory if it doesn't exist
      if (!fs.existsSync(resPath)) {
        fs.mkdirSync(resPath, { recursive: true });
      }

      // Create network_security_config.xml
      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow cleartext traffic for local development -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
    <!-- Default: require HTTPS for all other domains -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;

      const configPath = path.join(resPath, 'network_security_config.xml');
      fs.writeFileSync(configPath, networkSecurityConfig);
      
      console.log('[withAndroidCleartextTraffic] Created network_security_config.xml');
      
      return mod;
    },
  ]);
}

/**
 * Adds networkSecurityConfig to AndroidManifest.xml
 */
function withNetworkSecurityManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const mainApplication = mod.modResults.manifest.application?.[0];
    
    if (mainApplication) {
      // Add networkSecurityConfig attribute
      mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      console.log('[withAndroidCleartextTraffic] Added networkSecurityConfig to AndroidManifest.xml');
    }
    
    return mod;
  });
}

/**
 * Main plugin to enable cleartext traffic for Android local development
 */
function withAndroidCleartextTraffic(config) {
  config = withNetworkSecurityConfig(config);
  config = withNetworkSecurityManifest(config);
  return config;
}

module.exports = withAndroidCleartextTraffic;

