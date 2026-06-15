/**
 * withNotificationServiceExtension
 *
 * Adds an iOS Notification Service Extension (NSE) so remote pushes with
 * `mutable-content: 1` can download and attach an image (rich notifications).
 * Without this, iOS shows the text only and silently drops the image — the
 * reason fact notifications had no picture on iOS.
 *
 * Mirrors the app's withFactWidget pattern: source lives in
 * ios-notification-service/, this plugin creates the app-extension target in
 * the Xcode project at prebuild (ios/ is gitignored/generated, so a hand-added
 * target would be wiped — it must come from a config plugin).
 *
 * Native change: takes effect only after `expo prebuild` + a dev/EAS build.
 */

const { withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BUNDLE_ID = 'dev.seyrek.factsaday';
const NSE_NAME = 'FactsaDayNotificationService';
const NSE_BUNDLE_ID = `${BUNDLE_ID}.NotificationService`;
const NSE_SOURCE_DIR = 'ios-notification-service';
const DEPLOYMENT_TARGET = '16.4'; // match expo-build-properties ios.deploymentTarget

// ---------------------------------------------------------------------------
// 1. Write the extension's source + Info.plist into ios/<NSE_NAME>/
// ---------------------------------------------------------------------------
function withNSEFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosDir = cfg.modRequest.platformProjectRoot;
      const srcDir = path.join(projectRoot, NSE_SOURCE_DIR);
      const destDir = path.join(iosDir, NSE_NAME);

      fs.mkdirSync(destDir, { recursive: true });

      // Copy the Swift source (copy, not symlink, so EAS build context is clean)
      fs.copyFileSync(
        path.join(srcDir, 'NotificationService.swift'),
        path.join(destDir, 'NotificationService.swift')
      );

      // Extension Info.plist — the service extension point + principal class.
      // Version keys read from build settings (synced to the main app below).
      const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${NSE_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;
      fs.writeFileSync(path.join(destDir, 'Info.plist'), infoPlist);

      return cfg;
    },
  ]);
}

// Find the NSE native target's uuid, matching the name whether or not the
// xcode lib quoted it. pbxTargetByName matches the raw (quoted) comment, so a
// plain unquoted lookup can miss an existing target and create a DUPLICATE on a
// non-clean re-prebuild (two targets -> ambiguous .appex -> signing breaks).
function findNSETargetUuid(xcodeProject) {
  const nativeTargets = xcodeProject.pbxNativeTargetSection();
  for (const key in nativeTargets) {
    if (key.endsWith('_comment')) continue;
    const t = nativeTargets[key];
    if (typeof t === 'object' && t.name && String(t.name).replace(/"/g, '') === NSE_NAME) {
      return key;
    }
  }
  return null;
}

// Keep the NSE's version + automatic-signing intent in sync on every prebuild
// (runs even when the target already exists, so a plain `expo prebuild` fixes an
// existing ios/ without --clean).
//
// Signing strategy — deliberately do NOT set DEVELOPMENT_TEAM here. Expo's
// run:ios signer only adds `-allowProvisioningUpdates` (which lets Xcode
// register + generate the brand-new extension App ID's profile) when it detects
// that NOT all targets already carry a team. If we hardcode the NSE's team, Expo
// concludes signing is "already configured", skips the flag, and the build fails
// with "No profiles for '...NotificationService' / Automatic signing is
// disabled". Leaving the team off lets Expo's signer engage: it sets the team +
// CODE_SIGN_STYLE=Automatic on every target (incl. this one) AND passes the flag,
// so the profile is generated on first build. We still pin CODE_SIGN_STYLE +
// ProvisioningStyle = Automatic so the target is unambiguously auto-signed.
function syncNSEBuildSettings(xcodeProject, config) {
  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  for (const key in configurations) {
    const cfg = configurations[key];
    if (
      typeof cfg === 'object' &&
      cfg.buildSettings &&
      cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === `"${NSE_BUNDLE_ID}"`
    ) {
      cfg.buildSettings.CODE_SIGN_STYLE = 'Automatic';
      cfg.buildSettings.MARKETING_VERSION = config.version || '1.0';
      cfg.buildSettings.CURRENT_PROJECT_VERSION = String(config.ios?.buildNumber ?? '1');
      // No DEVELOPMENT_TEAM on purpose (see above) — Expo's signer sets it and,
      // crucially, only then passes -allowProvisioningUpdates.
    }
  }

  // Mirror automatic signing into the project's TargetAttributes for the NSE.
  const nseUuid = findNSETargetUuid(xcodeProject);
  if (nseUuid) {
    const project = xcodeProject.getFirstProject().firstProject;
    project.attributes = project.attributes || {};
    project.attributes.TargetAttributes = project.attributes.TargetAttributes || {};
    project.attributes.TargetAttributes[nseUuid] = {
      ...(project.attributes.TargetAttributes[nseUuid] || {}),
      ProvisioningStyle: 'Automatic',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Create the app-extension target in the Xcode project
// ---------------------------------------------------------------------------
function withNSETarget(config) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;

    if (findNSETargetUuid(xcodeProject)) {
      syncNSEBuildSettings(xcodeProject, config);
      return mod;
    }

    const target = xcodeProject.addTarget(NSE_NAME, 'app_extension', NSE_NAME, NSE_BUNDLE_ID);
    if (!target || !target.uuid) return mod;

    // Group holding the extension's files.
    const nseGroup = xcodeProject.addPbxGroup(['Info.plist'], NSE_NAME, NSE_NAME);
    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(nseGroup.uuid, mainGroupId);

    // addTarget('app_extension') only adds a CopyFiles embed phase to the main
    // target — we must create the extension's own Sources + Frameworks phases.
    const sourcesPhaseUuid = xcodeProject.generateUuid();
    const sourcesSection = xcodeProject.hash.project.objects['PBXSourcesBuildPhase'];
    sourcesSection[sourcesPhaseUuid] = {
      isa: 'PBXSourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    sourcesSection[`${sourcesPhaseUuid}_comment`] = 'Sources';

    const frameworksPhaseUuid = xcodeProject.generateUuid();
    const frameworksSection = xcodeProject.hash.project.objects['PBXFrameworksBuildPhase'];
    frameworksSection[frameworksPhaseUuid] = {
      isa: 'PBXFrameworksBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    frameworksSection[`${frameworksPhaseUuid}_comment`] = 'Frameworks';

    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    const nseNativeTarget = nativeTargets[target.uuid];
    if (nseNativeTarget) {
      nseNativeTarget.buildPhases.push(
        { value: sourcesPhaseUuid, comment: 'Sources' },
        { value: frameworksPhaseUuid, comment: 'Frameworks' }
      );
    }

    // Register NotificationService.swift: file ref + build file + into Sources.
    const file = 'NotificationService.swift';
    const buildFileSection = xcodeProject.pbxBuildFileSection();
    const fileRefSection = xcodeProject.pbxFileReferenceSection();
    const groupSection = xcodeProject.hash.project.objects['PBXGroup'];

    const fileRefUuid = xcodeProject.generateUuid();
    fileRefSection[fileRefUuid] = {
      isa: 'PBXFileReference',
      lastKnownFileType: 'sourcecode.swift',
      name: `"${file}"`,
      path: `"${file}"`,
      sourceTree: '"<group>"',
    };
    fileRefSection[`${fileRefUuid}_comment`] = file;

    if (groupSection[nseGroup.uuid]) {
      groupSection[nseGroup.uuid].children.push({ value: fileRefUuid, comment: file });
    }

    const buildFileUuid = xcodeProject.generateUuid();
    buildFileSection[buildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: fileRefUuid,
      fileRef_comment: file,
    };
    buildFileSection[`${buildFileUuid}_comment`] = `${file} in Sources`;
    sourcesSection[sourcesPhaseUuid].files.push({
      value: buildFileUuid,
      comment: `${file} in Sources`,
    });

    // Build settings for the extension target.
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const cfg = configurations[key];
      if (
        typeof cfg === 'object' &&
        cfg.buildSettings &&
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === `"${NSE_BUNDLE_ID}"`
      ) {
        cfg.buildSettings.SWIFT_VERSION = '5.0';
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
        cfg.buildSettings.INFOPLIST_FILE = `"${NSE_NAME}/Info.plist"`;
        cfg.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
        cfg.buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
        cfg.buildSettings.SKIP_INSTALL = 'YES';
        cfg.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
        cfg.buildSettings.CLANG_ENABLE_MODULES = 'YES';
        // DEVELOPMENT_TEAM intentionally omitted — see syncNSEBuildSettings:
        // Expo's signer must see the NSE as "team-less" to engage automatic
        // provisioning (-allowProvisioningUpdates) and generate its profile.
      }
    }

    syncNSEBuildSettings(xcodeProject, config);
    return mod;
  });
}

function withNotificationServiceExtension(config) {
  config = withNSEFiles(config);
  config = withNSETarget(config);
  return config;
}

module.exports = withNotificationServiceExtension;
