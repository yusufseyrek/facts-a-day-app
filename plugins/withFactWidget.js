/**
 * Expo Config Plugin: Facts Widget
 *
 * Injects native iOS WidgetKit extension and Android AppWidget into the project.
 * Also registers the WidgetBridge native module for both platforms so the JS side
 * can push data to shared storage and trigger widget reloads.
 *
 * iOS:  Copies SwiftUI widget source from ios-widget/ into the Xcode project,
 *       adds a WidgetKit extension target to pbxproj, adds App Group entitlement,
 *       and registers the WidgetBridge module.
 * Android: Copies Kotlin/XML widget source from android-widget/, updates the
 *          manifest, and registers the WidgetBridge module.
 */

const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
  withPlugins,
  withAndroidManifest,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BUNDLE_ID = 'dev.seyrek.factsaday';
const APP_GROUP = `group.${BUNDLE_ID}`;
const WIDGET_EXTENSION_NAME = 'FactsaDayWidget';
const WIDGET_BUNDLE_ID = `${BUNDLE_ID}.widget`;
const ANDROID_PACKAGE = 'dev.seyrek.factsaday';

// ============================================================================
// iOS Configuration
// ============================================================================

/**
 * Add App Group entitlement for shared UserDefaults between app and widget extension
 */
function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    const groups = mod.modResults['com.apple.security.application-groups'] || [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    mod.modResults['com.apple.security.application-groups'] = groups;
    return mod;
  });
}

/**
 * Copy iOS widget extension source files into the ios/ directory.
 */
function withIOSWidgetFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      const projectRoot = config.modRequest.projectRoot;
      const widgetSrcDir = path.join(projectRoot, 'ios-widget');
      const widgetDestDir = path.join(iosDir, WIDGET_EXTENSION_NAME);

      // Create widget extension directory
      if (!fs.existsSync(widgetDestDir)) {
        fs.mkdirSync(widgetDestDir, { recursive: true });
      }

      // Symlink Swift source files from ios-widget/ into the extension dir.
      // This means edits to ios-widget/*.swift are picked up by Xcode builds
      // immediately without needing to rerun `expo prebuild`. Non-swift files
      // (like Info.plist overrides if any) are still copied.
      if (fs.existsSync(widgetSrcDir)) {
        const files = fs.readdirSync(widgetSrcDir);
        for (const file of files) {
          const src = path.join(widgetSrcDir, file);
          const dest = path.join(widgetDestDir, file);
          if (!fs.statSync(src).isFile()) continue;

          // Remove any existing file/symlink at dest
          try { fs.unlinkSync(dest); } catch (_) {}

          if (file.endsWith('.swift')) {
            // Relative symlink: ios/FactsaDayWidget/foo.swift -> ../../ios-widget/foo.swift
            const rel = path.relative(widgetDestDir, src);
            fs.symlinkSync(rel, dest);
          } else {
            fs.copyFileSync(src, dest);
          }
        }
      }

      // Write the widget extension Info.plist
      const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Facts a Day</string>
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
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>`;
      fs.writeFileSync(path.join(widgetDestDir, 'Info.plist'), infoPlist);

      // Write widget extension entitlements
      const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP}</string>
  </array>
</dict>
</plist>`;
      fs.writeFileSync(
        path.join(widgetDestDir, `${WIDGET_EXTENSION_NAME}.entitlements`),
        entitlements
      );

      return config;
    },
  ]);
}

/**
 * Add the WidgetKit extension target to the Xcode project (pbxproj).
 * Uses withXcodeProject to manipulate the project file via the xcode library.
 */
function withIOSWidgetTarget(config) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;

    // Check if the target already exists
    const existingTarget = xcodeProject.pbxTargetByName(WIDGET_EXTENSION_NAME);
    if (existingTarget) {
      return mod;
    }

    // Collect source and resource files from the widget extension directory
    const iosDir = mod.modRequest.platformProjectRoot;
    const widgetDir = path.join(iosDir, WIDGET_EXTENSION_NAME);
    const allFiles = fs.existsSync(widgetDir) ? fs.readdirSync(widgetDir) : [];
    const swiftFiles = allFiles.filter((f) => f.endsWith('.swift'));
    // Image resources bundled into the widget extension (e.g. icon-512.png)
    const resourceFiles = allFiles.filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

    // Add the widget extension target as an app extension.
    // This creates the native target, a Sources build phase, a Frameworks phase,
    // a product reference, and a "Copy Files" embed phase in the main target.
    const target = xcodeProject.addTarget(
      WIDGET_EXTENSION_NAME,
      'app_extension',
      WIDGET_EXTENSION_NAME,
      WIDGET_BUNDLE_ID
    );

    if (target && target.uuid) {
      // Create a PBXGroup for the widget extension files
      const widgetGroup = xcodeProject.addPbxGroup(
        ['Info.plist', `${WIDGET_EXTENSION_NAME}.entitlements`],
        WIDGET_EXTENSION_NAME,
        WIDGET_EXTENSION_NAME
      );

      // Add the group to the main project group
      const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
      xcodeProject.addToPbxGroup(widgetGroup.uuid, mainGroupId);

      // addTarget('app_extension') does NOT create a Sources build phase for the
      // new target — it only adds a CopyFiles embed phase to the main target.
      // We must manually create a PBXSourcesBuildPhase and attach it to the widget target.
      const sourcesPhaseUuid = xcodeProject.generateUuid();
      const sourcesSection = xcodeProject.hash.project.objects['PBXSourcesBuildPhase'];
      sourcesSection[sourcesPhaseUuid] = {
        isa: 'PBXSourcesBuildPhase',
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      sourcesSection[`${sourcesPhaseUuid}_comment`] = 'Sources';

      // Frameworks build phase (required for WidgetKit/SwiftUI linking)
      const frameworksPhaseUuid = xcodeProject.generateUuid();
      const frameworksSection = xcodeProject.hash.project.objects['PBXFrameworksBuildPhase'];
      frameworksSection[frameworksPhaseUuid] = {
        isa: 'PBXFrameworksBuildPhase',
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      frameworksSection[`${frameworksPhaseUuid}_comment`] = 'Frameworks';

      // Resources build phase — copies bundled images (icon-512.png, etc.)
      // into the widget extension so SwiftUI `Image("name")` can find them.
      const resourcesPhaseUuid = xcodeProject.generateUuid();
      let resourcesSection = xcodeProject.hash.project.objects['PBXResourcesBuildPhase'];
      if (!resourcesSection) {
        resourcesSection = {};
        xcodeProject.hash.project.objects['PBXResourcesBuildPhase'] = resourcesSection;
      }
      resourcesSection[resourcesPhaseUuid] = {
        isa: 'PBXResourcesBuildPhase',
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      resourcesSection[`${resourcesPhaseUuid}_comment`] = 'Resources';

      // Attach all three build phases to the widget native target
      const nativeTargets = xcodeProject.pbxNativeTargetSection();
      const widgetNativeTarget = nativeTargets[target.uuid];
      if (widgetNativeTarget) {
        widgetNativeTarget.buildPhases.push(
          { value: sourcesPhaseUuid, comment: 'Sources' },
          { value: frameworksPhaseUuid, comment: 'Frameworks' },
          { value: resourcesPhaseUuid, comment: 'Resources' }
        );
      }

      // Add Swift source files: create file references, build files, and
      // add to the widget target's Sources build phase
      const buildFileSection = xcodeProject.pbxBuildFileSection();
      const fileRefSection = xcodeProject.pbxFileReferenceSection();
      const groupSection = xcodeProject.hash.project.objects['PBXGroup'];

      for (const file of swiftFiles) {
        // 1. PBXFileReference
        const fileRefUuid = xcodeProject.generateUuid();
        fileRefSection[fileRefUuid] = {
          isa: 'PBXFileReference',
          lastKnownFileType: 'sourcecode.swift',
          name: `"${file}"`,
          path: `"${file}"`,
          sourceTree: '"<group>"',
        };
        fileRefSection[`${fileRefUuid}_comment`] = file;

        // 2. Add to the widget PBXGroup
        if (groupSection[widgetGroup.uuid]) {
          groupSection[widgetGroup.uuid].children.push({
            value: fileRefUuid,
            comment: file,
          });
        }

        // 3. PBXBuildFile (links file ref to the build phase)
        const buildFileUuid = xcodeProject.generateUuid();
        buildFileSection[buildFileUuid] = {
          isa: 'PBXBuildFile',
          fileRef: fileRefUuid,
          fileRef_comment: file,
        };
        buildFileSection[`${buildFileUuid}_comment`] = `${file} in Sources`;

        // 4. Add to the widget's Sources build phase
        sourcesSection[sourcesPhaseUuid].files.push({
          value: buildFileUuid,
          comment: `${file} in Sources`,
        });
      }

      // Register PNG/JPG resource files and add them to the widget's
      // Resources build phase so they're bundled into the .appex.
      for (const file of resourceFiles) {
        const ext = file.split('.').pop().toLowerCase();
        const fileType = ext === 'png' ? 'image.png' : 'image.jpeg';

        const fileRefUuid = xcodeProject.generateUuid();
        fileRefSection[fileRefUuid] = {
          isa: 'PBXFileReference',
          lastKnownFileType: fileType,
          name: `"${file}"`,
          path: `"${file}"`,
          sourceTree: '"<group>"',
        };
        fileRefSection[`${fileRefUuid}_comment`] = file;

        if (groupSection[widgetGroup.uuid]) {
          groupSection[widgetGroup.uuid].children.push({
            value: fileRefUuid,
            comment: file,
          });
        }

        const buildFileUuid = xcodeProject.generateUuid();
        buildFileSection[buildFileUuid] = {
          isa: 'PBXBuildFile',
          fileRef: fileRefUuid,
          fileRef_comment: file,
        };
        buildFileSection[`${buildFileUuid}_comment`] = `${file} in Resources`;

        resourcesSection[resourcesPhaseUuid].files.push({
          value: buildFileUuid,
          comment: `${file} in Resources`,
        });
      }

      // Configure build settings for the widget extension target
      const configurations = xcodeProject.pbxXCBuildConfigurationSection();
      for (const key in configurations) {
        const cfg = configurations[key];
        if (
          typeof cfg === 'object' &&
          cfg.buildSettings &&
          cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === `"${WIDGET_BUNDLE_ID}"`
        ) {
          cfg.buildSettings.SWIFT_VERSION = '5.0';
          cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
          cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
          cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${WIDGET_EXTENSION_NAME}/${WIDGET_EXTENSION_NAME}.entitlements"`;
          cfg.buildSettings.INFOPLIST_FILE = `"${WIDGET_EXTENSION_NAME}/Info.plist"`;
          cfg.buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
          cfg.buildSettings.PRODUCT_NAME = `"$(TARGET_NAME)"`;
          cfg.buildSettings.SKIP_INSTALL = 'YES';
          cfg.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
          // Version settings — must exactly match the main app's
          // MARKETING_VERSION and CURRENT_PROJECT_VERSION or App Store
          // submission will fail. Read them from the main target configs.
          let mainMarketing = '1.0';
          let mainBuild = '1';
          for (const otherKey in configurations) {
            const other = configurations[otherKey];
            if (typeof other === 'object' &&
                other.buildSettings &&
                other.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === `"${BUNDLE_ID}"` &&
                other.name === cfg.name) {
              if (other.buildSettings.MARKETING_VERSION) {
                mainMarketing = other.buildSettings.MARKETING_VERSION;
              }
              if (other.buildSettings.CURRENT_PROJECT_VERSION) {
                mainBuild = other.buildSettings.CURRENT_PROJECT_VERSION;
              }
              break;
            }
          }
          cfg.buildSettings.MARKETING_VERSION = mainMarketing;
          cfg.buildSettings.CURRENT_PROJECT_VERSION = mainBuild;
        }
      }
    }

    return mod;
  });
}

/**
 * Add the WidgetBridge native module to the iOS main app target.
 * This module writes data to App Group UserDefaults and reloads widget timelines.
 */
function withIOSWidgetBridge(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      const appName = config.modRequest.projectName || 'FactsaDay';
      const bridgeDir = path.join(iosDir, appName);

      // Write WidgetBridge.swift (native module)
      const bridgeSwift = `import Foundation
import React
import WidgetKit

@objc(WidgetBridge)
class WidgetBridge: NSObject {

  private static let suiteName = "${APP_GROUP}"
  private static let dataKey = "widget_fact_data"

  @objc
  func setWidgetData(_ jsonString: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: WidgetBridge.suiteName) else {
      reject("ERR_DEFAULTS", "Failed to access App Group UserDefaults", nil)
      return
    }
    defaults.set(jsonString, forKey: WidgetBridge.dataKey)
    defaults.synchronize()
    resolve(nil)
  }

  @objc
  func reloadWidgets(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    resolve(nil)
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
`;

      // Write WidgetBridge.m (Obj-C bridge to expose to React Native)
      const bridgeObjC = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetBridge, NSObject)

RCT_EXTERN_METHOD(setWidgetData:(NSString *)jsonString
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reloadWidgets:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
`;

      fs.writeFileSync(path.join(bridgeDir, 'WidgetBridge.swift'), bridgeSwift);
      fs.writeFileSync(path.join(bridgeDir, 'WidgetBridge.m'), bridgeObjC);

      return config;
    },
  ]);
}

/**
 * Register WidgetBridge.swift and WidgetBridge.m in the main app target's
 * Sources build phase so they're compiled into the app binary.
 */
function withIOSWidgetBridgeTarget(config) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const appName = mod.modRequest.projectName || 'FactsaDay';

    // Find the main app target by scanning the native targets section
    // (pbxTargetByName returns the target object without its UUID)
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    let mainNativeTarget = null;
    for (const key in nativeTargets) {
      if (typeof nativeTargets[key] === 'string') continue;
      const t = nativeTargets[key];
      const tName = (t.name || '').replace(/"/g, '');
      if (tName === appName) {
        mainNativeTarget = t;
        break;
      }
    }
    if (!mainNativeTarget) return mod;

    let mainSourcesPhaseUuid = null;
    for (const phase of mainNativeTarget.buildPhases) {
      if (phase.comment === 'Sources') {
        mainSourcesPhaseUuid = phase.value;
        break;
      }
    }
    if (!mainSourcesPhaseUuid) return mod;

    // Find the main app's PBXGroup (where AppDelegate.swift lives)
    const groupSection = xcodeProject.hash.project.objects['PBXGroup'];
    let mainAppGroupUuid = null;
    for (const key in groupSection) {
      if (typeof groupSection[key] === 'string') continue;
      const g = groupSection[key];
      if (g.path === appName || g.path === `"${appName}"` || g.name === appName || g.name === `"${appName}"`) {
        mainAppGroupUuid = key;
        break;
      }
    }

    const buildFileSection = xcodeProject.pbxBuildFileSection();
    const fileRefSection = xcodeProject.pbxFileReferenceSection();
    const sourcesSection = xcodeProject.hash.project.objects['PBXSourcesBuildPhase'];

    // Files to add: WidgetBridge.swift (source) and WidgetBridge.m (source)
    const filesToAdd = [
      { name: 'WidgetBridge.swift', type: 'sourcecode.swift' },
      { name: 'WidgetBridge.m', type: 'sourcecode.c.objc' },
    ];

    for (const { name, type } of filesToAdd) {
      // Skip if already present
      const expectedPath = `${appName}/${name}`;
      let alreadyAdded = false;
      for (const key in fileRefSection) {
        if (typeof fileRefSection[key] === 'string') continue;
        const ref = fileRefSection[key];
        if (ref.path === expectedPath || ref.path === `"${expectedPath}"` || ref.name === name) {
          alreadyAdded = true;
          break;
        }
      }
      if (alreadyAdded) continue;

      // 1. PBXFileReference — use the FactsaDay/ prefix so Xcode resolves the
      // path relative to the project root (matching how AppDelegate.swift is registered).
      const fileRefUuid = xcodeProject.generateUuid();
      fileRefSection[fileRefUuid] = {
        isa: 'PBXFileReference',
        lastKnownFileType: type,
        name: name,
        path: `${appName}/${name}`,
        sourceTree: '"<group>"',
      };
      fileRefSection[`${fileRefUuid}_comment`] = name;

      // 2. Add to main app group
      if (mainAppGroupUuid && groupSection[mainAppGroupUuid]) {
        groupSection[mainAppGroupUuid].children.push({
          value: fileRefUuid,
          comment: name,
        });
      }

      // 3. PBXBuildFile
      const buildFileUuid = xcodeProject.generateUuid();
      buildFileSection[buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUuid,
        fileRef_comment: name,
      };
      buildFileSection[`${buildFileUuid}_comment`] = `${name} in Sources`;

      // 4. Add to main target's Sources phase
      if (sourcesSection[mainSourcesPhaseUuid]) {
        sourcesSection[mainSourcesPhaseUuid].files.push({
          value: buildFileUuid,
          comment: `${name} in Sources`,
        });
      }
    }

    return mod;
  });
}

// ============================================================================
// Android Configuration
// ============================================================================

/**
 * Copy Android widget source files (Kotlin, XML layouts, widget_info) into the project.
 */
function withAndroidWidgetFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidDir = config.modRequest.platformProjectRoot;
      const widgetSrcDir = path.join(projectRoot, 'android-widget');

      const packagePath = ANDROID_PACKAGE.replace(/\./g, '/');
      const widgetKotlinDir = path.join(
        androidDir,
        'app',
        'src',
        'main',
        'java',
        packagePath,
        'widget'
      );
      const resDir = path.join(androidDir, 'app', 'src', 'main', 'res');
      const layoutDir = path.join(resDir, 'layout');
      const xmlDir = path.join(resDir, 'xml');
      const drawableDir = path.join(resDir, 'drawable');

      // Create directories
      for (const dir of [widgetKotlinDir, layoutDir, xmlDir, drawableDir]) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Copy Kotlin files
      if (fs.existsSync(widgetSrcDir)) {
        const kotlinFiles = fs
          .readdirSync(widgetSrcDir)
          .filter((f) => f.endsWith('.kt'));
        for (const file of kotlinFiles) {
          fs.copyFileSync(
            path.join(widgetSrcDir, file),
            path.join(widgetKotlinDir, file)
          );
        }

        // Copy res/ subdirectories
        const resSrcDir = path.join(widgetSrcDir, 'res');
        if (fs.existsSync(resSrcDir)) {
          for (const subDir of ['layout', 'xml', 'drawable']) {
            const srcSubDir = path.join(resSrcDir, subDir);
            if (fs.existsSync(srcSubDir)) {
              const destSubDir = path.join(resDir, subDir);
              if (!fs.existsSync(destSubDir)) {
                fs.mkdirSync(destSubDir, { recursive: true });
              }
              for (const file of fs.readdirSync(srcSubDir)) {
                fs.copyFileSync(
                  path.join(srcSubDir, file),
                  path.join(destSubDir, file)
                );
              }
            }
          }
        }
      }

      return config;
    },
  ]);
}

/**
 * Add widget receiver and meta-data to AndroidManifest.xml
 */
function withAndroidWidgetManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const mainApplication =
      mod.modResults.manifest.application?.[0];
    if (!mainApplication) return mod;

    // Check if already added
    const receivers = mainApplication.receiver || [];
    const alreadyAdded = receivers.some(
      (r) =>
        r.$?.['android:name'] === `.widget.FactWidgetProvider`
    );
    if (alreadyAdded) return mod;

    // Add widget receivers for each size
    const widgetSizes = [
      { provider: 'FactWidgetProvider', info: 'widget_info_small' },
      { provider: 'FactWidgetMediumProvider', info: 'widget_info_medium' },
      { provider: 'FactWidgetLargeProvider', info: 'widget_info_large' },
    ];

    for (const { provider, info } of widgetSizes) {
      receivers.push({
        $: {
          'android:name': `.widget.${provider}`,
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
                },
              },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': `@xml/${info}`,
            },
          },
        ],
      });
    }

    mainApplication.receiver = receivers;
    return mod;
  });
}

/**
 * Add WidgetBridge native module to the Android main application.
 */
function withAndroidWidgetBridge(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidDir = config.modRequest.platformProjectRoot;
      const packagePath = ANDROID_PACKAGE.replace(/\./g, '/');
      const widgetDir = path.join(
        androidDir,
        'app',
        'src',
        'main',
        'java',
        packagePath,
        'widget'
      );

      if (!fs.existsSync(widgetDir)) {
        fs.mkdirSync(widgetDir, { recursive: true });
      }

      // Write WidgetBridgeModule.kt
      const bridgeModule = `package ${ANDROID_PACKAGE}.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class WidgetBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetBridge"

    @ReactMethod
    fun setWidgetData(jsonString: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            // 1) Persist JSON so providers can read it from any process.
            context
                .getSharedPreferences(WidgetConfig.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(WidgetConfig.DATA_KEY, jsonString)
                .apply()

            // 2) Kick off image downloads in the background. onUpdate will
            //    read whatever is already on disk — missing images just show
            //    the fallback color.
            Thread { downloadImages(context, jsonString) }.start()

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_WRITE", "Failed to write widget data", e)
        }
    }

    @ReactMethod
    fun reloadWidgets(promise: Promise) {
        try {
            val context = reactApplicationContext
            val appWidgetManager = AppWidgetManager.getInstance(context)

            val providers = arrayOf(
                FactWidgetProvider::class.java,
                FactWidgetMediumProvider::class.java,
                FactWidgetLargeProvider::class.java,
            )

            for (provider in providers) {
                val componentName = ComponentName(context, provider)
                val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
                if (widgetIds.isNotEmpty()) {
                    val intent = android.content.Intent(context, provider)
                    intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
                    context.sendBroadcast(intent)
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_RELOAD", "Failed to reload widgets", e)
        }
    }

    /**
     * Fetch every fact's imageUrl and cache to files/widget_images/. Uses the
     * same filename scheme as WidgetDataStore.cacheFileFor so providers can
     * look them up by URL.
     */
    private fun downloadImages(context: Context, jsonString: String) {
        try {
            val json = JSONObject(jsonString)
            val facts = json.getJSONArray("facts")
            val cacheDir = WidgetDataStore.imageCacheDir(context)

            for (i in 0 until facts.length()) {
                val fact = facts.getJSONObject(i)
                if (!fact.has("imageUrl") || fact.isNull("imageUrl")) continue
                val urlString = fact.getString("imageUrl")
                val dest = WidgetDataStore.cacheFileFor(context, urlString) ?: continue
                if (dest.exists() && dest.length() > 0) continue // already cached

                try {
                    val url = URL(urlString)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 8000
                    conn.readTimeout = 8000
                    conn.requestMethod = "GET"
                    conn.doInput = true
                    conn.connect()
                    conn.inputStream.use { input ->
                        FileOutputStream(dest).use { output ->
                            input.copyTo(output)
                        }
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    // Individual download failure: skip and move on
                }
            }

            // After images are cached, refresh widgets so they pick up the
            // newly downloaded bitmaps.
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val providers = arrayOf(
                FactWidgetProvider::class.java,
                FactWidgetMediumProvider::class.java,
                FactWidgetLargeProvider::class.java,
            )
            for (provider in providers) {
                val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, provider))
                if (ids.isNotEmpty()) {
                    val intent = android.content.Intent(context, provider)
                    intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    context.sendBroadcast(intent)
                }
            }
        } catch (e: Exception) {
            // Parsing or I/O failure — swallow, widgets still show text
        }
    }
}
`;

      // Write WidgetBridgePackage.kt
      const bridgePackage = `package ${ANDROID_PACKAGE}.widget

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WidgetBridgePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(WidgetBridgeModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

      fs.writeFileSync(path.join(widgetDir, 'WidgetBridgeModule.kt'), bridgeModule);
      fs.writeFileSync(path.join(widgetDir, 'WidgetBridgePackage.kt'), bridgePackage);

      return config;
    },
  ]);
}

/**
 * Register the WidgetBridgePackage in MainApplication.kt
 */
function withAndroidWidgetBridgeRegistration(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      console.warn('withFactWidget: MainApplication is not Kotlin, skipping widget bridge registration');
      return mod;
    }

    let contents = mod.modResults.contents;

    // Add import
    const importLine = `import ${ANDROID_PACKAGE}.widget.WidgetBridgePackage`;
    if (!contents.includes(importLine)) {
      contents = contents.replace(
        /^(package [^\n]+\n)/m,
        `$1\n${importLine}\n`
      );
    }

    // Add package to getPackages(). Handles both expression-body and block syntax.
    if (!contents.includes('WidgetBridgePackage()')) {
      // Expression body: `override fun getPackages(): List<ReactPackage> =\n    PackageList(this).packages.apply {`
      // Block body:      `override fun getPackages(): List<ReactPackage> {\n    return PackageList(this).packages.apply {`
      const blockPattern = /(override fun getPackages\(\): List<ReactPackage> \{[\s\S]*?return PackageList\(this\)\.packages\.apply \{)/;
      const exprPattern = /(override fun getPackages\(\): List<ReactPackage> =[\s\S]*?PackageList\(this\)\.packages\.apply \{)/;

      if (blockPattern.test(contents)) {
        contents = contents.replace(blockPattern, `$1\n            add(WidgetBridgePackage())`);
      } else if (exprPattern.test(contents)) {
        contents = contents.replace(exprPattern, `$1\n              add(WidgetBridgePackage())`);
      } else {
        console.warn('withFactWidget: could not find getPackages() to inject WidgetBridgePackage');
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

// ============================================================================
// Main Plugin
// ============================================================================

function withFactWidget(config) {
  return withPlugins(config, [
    // iOS
    withAppGroupEntitlement,
    withIOSWidgetFiles,
    withIOSWidgetTarget,
    withIOSWidgetBridge,
    withIOSWidgetBridgeTarget,
    // Android
    withAndroidWidgetFiles,
    withAndroidWidgetManifest,
    withAndroidWidgetBridge,
    withAndroidWidgetBridgeRegistration,
  ]);
}

module.exports = withFactWidget;
