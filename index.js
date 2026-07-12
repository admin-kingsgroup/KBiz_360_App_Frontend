// Custom entry point. Registers the headless background handlers for the native full-screen
// incoming-call UI (FCM data + notifee) and the attendance geofence task BEFORE React mounts —
// required so calls ring/display and geofence enter/exit punches fire when the app is killed —
// then hands off to expo-router's normal entry.
import './src/services/callBackground';
import './src/services/backgroundAttendance';
import 'expo-router/entry';
