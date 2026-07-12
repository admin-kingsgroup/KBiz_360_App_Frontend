/**
 * Expo config plugin — register @notifee/react-native's local Android Maven repo in the app's
 * `allprojects.repositories`, so Gradle can resolve `app.notifee:core` (notifee ships its AAR inside
 * node_modules/@notifee/react-native/android/libs rather than on a public repo). Without this the
 * Android build fails with "Could not find any matches for app.notifee:core:+".
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const REPO = `maven { url("$rootDir/../node_modules/@notifee/react-native/android/libs") } // notifee`;

module.exports = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes('@notifee/react-native/android/libs')) return cfg; // idempotent
    // Insert into the FIRST `allprojects { repositories {` block.
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      (match) => `${match}\n        ${REPO}`,
    );
    return cfg;
  });
