// Custom entry point. Registers the headless background handlers for background chat pushes
// (FCM data + notifee) and the legacy attendance geofence task BEFORE React mounts, then hands
// off to expo-router's normal entry.
import './src/services/callBackground';
import './src/services/backgroundAttendance';
import './src/services/locationTrail'; // work-hours location trail task (check-in → check-out)
import 'expo-router/entry';
