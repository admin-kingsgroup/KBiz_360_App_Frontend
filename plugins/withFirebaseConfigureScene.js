// Expo SDK 58 generates a scene-based AppDelegate.swift (the iOS 27 SDK requires the scene life
// cycle): React Native now starts in SceneDelegate, so the anchors @react-native-firebase/app v24's
// config plugin looks for (`factory.startReactNative(` / `self.moduleName = …`) are gone and it
// prints "Unable to determine correct Firebase insertion point" and skips `FirebaseApp.configure()`.
// Without that call FCM never registers and push stops arriving. v27 knows the new template, but it
// is Swift-Package-only and needs dynamic frameworks, which this app (static, with the widget and
// share-extension targets) does not use.
//
// This plugin adds the one missing line, right before AppDelegate hands launch to Expo. It runs
// after @react-native-firebase/app (listed later in app.json), which still adds `import FirebaseCore`.
// Idempotent: does nothing when the call is already there (e.g. a future v24 plugin learns the anchor).
const { withAppDelegate } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const ANCHOR = /return\s+super\.application\(\s*application\s*,\s*didFinishLaunchingWithOptions:\s*launchOptions\s*\)/;

module.exports = function withFirebaseConfigureScene(config) {
  return withAppDelegate(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (language !== 'swift') return cfg;
    let src = contents;
    if (src.includes('FirebaseApp.configure()')) return cfg;
    if (!ANCHOR.test(src)) {
      throw new Error('[withFirebaseConfigureScene] AppDelegate.swift has no `return super.application(application, didFinishLaunchingWithOptions: launchOptions)` — the Expo template changed; FirebaseApp.configure() would be missing and push would silently stop.');
    }
    if (!/^\s*import\s+FirebaseCore\s*$/m.test(src)) {
      src = src.replace(/^(\s*(?:internal\s+)?import\s+Expo\s*)$/m, '$1\nimport FirebaseCore');
    }
    cfg.modResults.contents = mergeContents({
      tag: 'kbiz-firebase-configure-scene',
      src,
      newSrc: '    FirebaseApp.configure()',
      anchor: ANCHOR,
      offset: 0,
      comment: '//',
    }).contents;
    return cfg;
  });
};
