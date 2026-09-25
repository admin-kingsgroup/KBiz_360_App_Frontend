/**
 * Expo config plugin — wires Apple PushKit (VoIP) into the native iOS AppDelegate so an incoming
 * call shows the system CallKit screen (full-screen, ring, Accept/Reject, over the lock screen) even
 * when the app is killed — the same mechanism WhatsApp uses.
 *
 * It does three things at prebuild time:
 *   1. Ensures `voip` is in UIBackgroundModes (Info.plist).
 *   2. Registers PKPushRegistry on launch and forwards VoIP token + pushes to
 *      react-native-voip-push-notification.
 *   3. On an incoming VoIP push, reports the call to CallKit immediately via react-native-callkeep
 *      (Apple REQUIRES reporting in the same run loop as the push, or it kills the app).
 *
 * Pairs with src/services/iosCallKeep.ts (JS side: CallKit answer/end → CallManager, token upload).
 */
const { withInfoPlist, withAppDelegate, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '// VoIP-PushKit (kbiz360)';

// react-native-callkeep / react-native-voip-push-notification are Objective-C pods. Under
// `useFrameworks: static` a Swift `import RNVoipPushNotification` fails ("no such module"), so instead
// we expose their classes to Swift via the project's bridging header (see addBridgingImports). The
// only Swift import we add is PushKit (a system framework, always importable).
const SWIFT_IMPORTS = `${MARKER}
import PushKit
`;

// Obj-C headers appended to the app's bridging header so RNCallKeep / RNVoipPushNotificationManager
// are visible to the Swift AppDelegate without a Swift module import.
const BRIDGING_IMPORTS = `${MARKER}
#import <RNCallKeep/RNCallKeep.h>
#import <RNVoipPushNotification/RNVoipPushNotificationManager.h>
`;

// PKPushRegistryDelegate conformance + handlers, appended as an extension. The selector names are
// the exact Swift import of react-native-voip-push-notification / react-native-callkeep Obj-C APIs.
// iOS REQUIRES every VoIP push to report a call to CallKit in the same run loop, so we always report
// (even for a "cancel") and let the JS layer dismiss it — see src/services/iosCallKeep.ts.
const SWIFT_EXTENSION = `
${MARKER} — PushKit / CallKit incoming-call bridge
extension AppDelegate: PKPushRegistryDelegate {
  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue)
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {}

  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    let dict = payload.dictionaryPayload
    let callId = (dict["callId"] as? String) ?? UUID().uuidString
    let callerName = (dict["callerName"] as? String) ?? "KBiz 360"
    let isVideo = (dict["callType"] as? String) == "video"

    // Forward the raw payload to the JS layer (it emits the 'notification' / didLoadWithEvents event).
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)

    // Report to CallKit NOW (same run loop) — required by iOS for every VoIP push.
    RNCallKeep.reportNewIncomingCall(
      callId,
      handle: callerName,
      handleType: "generic",
      hasVideo: isVideo,
      localizedCallerName: callerName,
      supportsHolding: true,
      supportsDTMF: true,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: dict,
      withCompletionHandler: { completion() }
    )
  }
}
`;

function patchSwift(contents) {
  if (contents.includes(MARKER)) return contents; // idempotent

  // 1. imports — after the ExpoModulesCore import if present, else at the very top.
  if (contents.includes('import ExpoModulesCore')) {
    contents = contents.replace('import ExpoModulesCore', `import ExpoModulesCore\n${SWIFT_IMPORTS}`);
  } else {
    contents = `${SWIFT_IMPORTS}\n${contents}`;
  }

  // 2. register VoIP on launch — insert before the standard `return super.application(...)` call.
  const launchReturn = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
  if (contents.includes(launchReturn)) {
    contents = contents.replace(launchReturn, `RNVoipPushNotificationManager.voipRegistration()\n    ${launchReturn}`);
  } else {
    // Fallback: insert right after the didFinishLaunchingWithOptions opening brace.
    contents = contents.replace(/(didFinishLaunchingWithOptions[^{]*\{)/, `$1\n    RNVoipPushNotificationManager.voipRegistration()`);
  }

  // 3. PKPushRegistryDelegate extension at end of file.
  contents = `${contents}\n${SWIFT_EXTENSION}`;
  return contents;
}

// Append the Obj-C imports to the app's Swift bridging header (Expo generates
// `<name>/<name>-Bridging-Header.h` and already wires SWIFT_OBJC_BRIDGING_HEADER). If for some reason
// it doesn't exist, create it at that standard path.
function addBridgingImports(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const name = cfg.modRequest.projectName || cfg.name.replace(/[^A-Za-z0-9]/g, '');
      const dir = path.join(cfg.modRequest.platformProjectRoot, name);
      let headerPath = path.join(dir, `${name}-Bridging-Header.h`);
      if (!fs.existsSync(headerPath)) {
        // Fall back to any *-Bridging-Header.h already in the target dir.
        const found = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith('-Bridging-Header.h'));
        if (found) headerPath = path.join(dir, found);
      }
      const existing = fs.existsSync(headerPath) ? fs.readFileSync(headerPath, 'utf8') : '//\n// Bridging header\n//\n';
      if (!existing.includes(MARKER)) {
        fs.mkdirSync(path.dirname(headerPath), { recursive: true });
        fs.writeFileSync(headerPath, `${existing.trimEnd()}\n\n${BRIDGING_IMPORTS}`);
      }
      return cfg;
    },
  ]);
}

const withVoipPush = (config) => {
  // Ensure UIBackgroundModes contains voip (app.json already adds it, but be safe).
  config = withInfoPlist(config, (cfg) => {
    const modes = new Set(cfg.modResults.UIBackgroundModes || []);
    modes.add('voip');
    modes.add('remote-notification');
    modes.add('audio');
    cfg.modResults.UIBackgroundModes = Array.from(modes);
    return cfg;
  });

  // Expose the Obj-C call libraries to Swift via the bridging header.
  config = addBridgingImports(config);

  // Patch the native AppDelegate (Swift on Expo SDK 53+).
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language === 'swift') {
      cfg.modResults.contents = patchSwift(cfg.modResults.contents);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[withVoipPush] Objective-C AppDelegate detected — VoIP/PushKit wiring not applied. Expected Swift on Expo SDK 56.');
    }
    return cfg;
  });

  return config;
};

module.exports = withVoipPush;
