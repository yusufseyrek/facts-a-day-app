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
 * Updates AppDelegate.swift to initialize App Check with App Attest provider
 * Uses Debug provider in DEBUG builds for simulator/development testing
 */
function withAppCheckInitializationIOS(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      console.warn('withAppCheckAppAttest: AppDelegate is not Swift, skipping App Check initialization');
      return mod;
    }

    let contents = mod.modResults.contents;

    // Add FirebaseAppCheck import if not present
    if (!contents.includes('import FirebaseAppCheck')) {
      contents = contents.replace(
        'import FirebaseCore',
        'import FirebaseCore\nimport FirebaseAppCheck'
      );
    }

    // Add the AppCheckProviderFactory class if not present
    // This factory uses Debug provider in DEBUG builds, and App Attest in Release
    const appCheckProviderClass = `
// MARK: - App Check Provider Factory
class FactsaDayAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
  func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? {
    #if DEBUG
      // Use Debug provider for simulators and development
      // The debug token will be printed to console - register it in Firebase Console
      print("⚠️ App Check: Using DEBUG provider - copy the token from console and register in Firebase Console")
      return AppCheckDebugProvider(app: app)
    #else
      // Use App Attest in production (iOS 14+) with DeviceCheck fallback
      if #available(iOS 14.0, *) {
        return AppAttestProvider(app: app)
      } else {
        return DeviceCheckProvider(app: app)
      }
    #endif
  }
}
`;

    if (!contents.includes('FactsaDayAppCheckProviderFactory')) {
      // Add the class at the end of the file
      contents = contents + '\n' + appCheckProviderClass;
    } else {
      // Update existing class to include debug provider
      const oldClass = /\/\/ MARK: - App Check Provider Factory\nclass FactsaDayAppCheckProviderFactory[\s\S]*?\n\}/;
      if (oldClass.test(contents) && !contents.includes('AppCheckDebugProvider')) {
        contents = contents.replace(oldClass, appCheckProviderClass.trim());
      }
    }

    // Add App Check initialization before FirebaseApp.configure()
    const appCheckSetup = `
// @generated begin app-check-setup - expo prebuild (DO NOT MODIFY)
let providerFactory = FactsaDayAppCheckProviderFactory()
AppCheck.setAppCheckProviderFactory(providerFactory)
// @generated end app-check-setup
`;

    if (!contents.includes('AppCheck.setAppCheckProviderFactory')) {
      // Insert App Check setup right before FirebaseApp.configure()
      contents = contents.replace(
        'FirebaseApp.configure()',
        appCheckSetup + 'FirebaseApp.configure()'
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
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
 * Updates MainApplication.kt to initialize App Check with Play Integrity provider
 * Uses Debug provider in debug builds for emulator/development testing
 */
function withAppCheckInitializationAndroid(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      console.warn('withAppCheckAppAttest: MainApplication is not Kotlin, skipping App Check initialization');
      return mod;
    }

    let contents = mod.modResults.contents;

    // Add Firebase App Check imports if not present
    const appCheckImports = `import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory`;

    if (!contents.includes('import com.google.firebase.appcheck.FirebaseAppCheck')) {
      // Add imports after the package declaration
      contents = contents.replace(
        /^(package [^\n]+\n)/m,
        `$1\n${appCheckImports}\n`
      );
    }

    // Add App Check initialization in onCreate
    const appCheckInit = `
        // @generated begin app-check-setup - expo prebuild (DO NOT MODIFY)
        // Initialize Firebase App Check with Play Integrity (release) or Debug (debug)
        FirebaseApp.initializeApp(this)
        val firebaseAppCheck = FirebaseAppCheck.getInstance()
        if (BuildConfig.DEBUG) {
            // Use Debug provider for emulators and development
            // The debug token will be printed to logcat - register it in Firebase Console
            android.util.Log.w("AppCheck", "⚠️ Using DEBUG provider - copy token from logcat and register in Firebase Console")
            firebaseAppCheck.installAppCheckProviderFactory(
                DebugAppCheckProviderFactory.getInstance()
            )
        } else {
            // Use Play Integrity in production
            firebaseAppCheck.installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
            )
        }
        // @generated end app-check-setup`;

    if (!contents.includes('FirebaseAppCheck.getInstance()')) {
      // Find onCreate and add App Check initialization after super.onCreate()
      contents = contents.replace(
        /(override fun onCreate\(\) \{[\s\S]*?super\.onCreate\(\))/,
        `$1\n${appCheckInit}`
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
