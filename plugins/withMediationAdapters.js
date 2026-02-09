const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Adds AdMob mediation adapter dependencies to app/build.gradle
 */
function withMediationAdapters(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      console.warn('withMediationAdapters: build.gradle is not Groovy, skipping');
      return mod;
    }

    let contents = mod.modResults.contents;

    const mediationDependencies = `
    // AdMob mediation adapters (added by withMediationAdapters plugin)
    implementation 'com.unity3d.ads:unity-ads:4.16.6'
    implementation 'com.google.ads.mediation:unity:4.16.6.0'
    implementation 'com.vungle:vungle-ads:7.7.0'
    implementation 'com.google.ads.mediation:vungle:7.7.0.0'
    implementation 'com.google.ads.mediation:ironsource:9.3.0.0'`;

    if (!contents.includes('mediation:unity')) {
      contents = contents.replace(
        /implementation\("com\.facebook\.react:react-android"\)/,
        `implementation("com.facebook.react:react-android")\n${mediationDependencies}`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = withMediationAdapters;
