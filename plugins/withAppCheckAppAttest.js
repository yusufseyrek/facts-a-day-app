const { 
  withEntitlementsPlist, 
  withAppDelegate, 
  withPlugins,
  withMainApplication,
  withAppBuildGradle,
} = require('expo/config-plugins');

// ==================== iOS Configuration ====================

/**
 * Adds the App Attest entitlement to the iOS entitlements file
 */
function withAppAttestEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.devicecheck.appattest-environment'] = 'production';
    return mod;
  });
}

/**
 * NOTE: Native App Check initialization has been REMOVED for iOS.
 * 
 * React Native Firebase's @react-native-firebase/app-check package handles
 * App Check initialization from the JavaScript side using ReactNativeFirebaseAppCheckProvider.
 * 
 * Having both native (AppCheck.setAppCheckProviderFactory) AND JS initialization
 * causes conflicts where the providers fight over control.
 * 
 * The JS-side initialization in firebase.ts (initializeAppCheckService) uses
 * ReactNativeFirebaseAppCheckProvider which configures the native providers via the bridge.
 * 
 * The App Attest entitlement is still added via withAppAttestEntitlement() for
 * App Attest to work properly in production.
 */
function withAppCheckInitializationIOS(config) {
  // No-op: Let React Native Firebase's JS SDK handle App Check initialization
  // The entitlement for App Attest is still added separately
  return config;
}

// ==================== Android Configuration ====================

/**
 * Adds Firebase App Check dependencies to app/build.gradle
 */
function withAppCheckDependencies(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      console.warn('withAppCheckAppAttest: build.gradle is not Groovy, skipping dependency injection');
      return mod;
    }

    let contents = mod.modResults.contents;

    // Add Firebase App Check dependencies if not present
    const appCheckDependencies = `
    // Firebase App Check dependencies (added by withAppCheckAppAttest plugin)
    implementation platform('com.google.firebase:firebase-bom:33.7.0')
    implementation 'com.google.firebase:firebase-appcheck'
    implementation 'com.google.firebase:firebase-appcheck-playintegrity'
    implementation 'com.google.firebase:firebase-appcheck-debug'`;

    if (!contents.includes('firebase-appcheck')) {
      // Add dependencies after the react-android implementation
      contents = contents.replace(
        /implementation\("com\.facebook\.react:react-android"\)/,
        `implementation("com.facebook.react:react-android")\n${appCheckDependencies}`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Initializes Firebase App on Android.
 * 
 * IMPORTANT: We only initialize FirebaseApp here, NOT AppCheck.
 * React Native Firebase's @react-native-firebase/app-check package handles
 * App Check initialization from the JavaScript side using ReactNativeFirebaseAppCheckProvider.
 * 
 * Having both native AND JS App Check initialization causes conflicts.
 * The JS-side initialization in firebase.ts (initializeAppCheckService) handles App Check.
 */
function withAppCheckInitializationAndroid(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      console.warn('withAppCheckAppAttest: MainApplication is not Kotlin, skipping Firebase initialization');
      return mod;
    }

    let contents = mod.modResults.contents;

    // Add Firebase import if not present
    if (!contents.includes('import com.google.firebase.FirebaseApp')) {
      // Add import after the package declaration
      contents = contents.replace(
        /^(package [^\n]+\n)/m,
        `$1\nimport com.google.firebase.FirebaseApp\n`
      );
    }

    // Add Firebase initialization in onCreate (but NOT App Check - JS handles that)
    const firebaseInit = `
        // @generated begin firebase-init - expo prebuild (DO NOT MODIFY)
        // Initialize Firebase App (App Check is initialized from JS via ReactNativeFirebaseAppCheckProvider)
        FirebaseApp.initializeApp(this)
        // @generated end firebase-init`;

    if (!contents.includes('FirebaseApp.initializeApp(this)')) {
      // Find onCreate and add Firebase initialization after super.onCreate()
      contents = contents.replace(
        /(override fun onCreate\(\) \{[\s\S]*?super\.onCreate\(\))/,
        `$1\n${firebaseInit}`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

// ==================== Main Plugin ====================

/**
 * Main plugin function that applies all App Check related configurations
 * for both iOS (App Attest) and Android (Play Integrity)
 */
function withAppCheckAppAttest(config) {
  return withPlugins(config, [
    // iOS
    withAppAttestEntitlement,
    withAppCheckInitializationIOS,
    // Android
    withAppCheckDependencies,
    withAppCheckInitializationAndroid,
  ]);
}

module.exports = withAppCheckAppAttest;
