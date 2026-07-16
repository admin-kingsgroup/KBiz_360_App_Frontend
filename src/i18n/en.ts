// English dictionary — the reference language. Keys are namespaced (screen.thing).
// Seeded with the most user-facing strings; grow it as screens adopt t().
export const en = {
  'common.retry': 'Try again',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.settings': 'Settings',
  'common.somethingWentWrong': 'Something went wrong',
  'alerts.title': 'System Alerts',
  'alerts.empty': 'No system alerts yet',
  'alerts.emptySub': 'Alert channels appear as modules go live.',
  'alerts.markedAllRead': 'Marked all read',
  'alerts.couldNotOpenPdf': 'Could not open PDF',
  'attendance.title': 'Attendance',
  'attendance.autoOff': 'Auto check-in is off',
  'attendance.autoOffSub': 'Set location to “Allow all the time” so the office geofence can punch you in even when the app is closed.',
} as const;
