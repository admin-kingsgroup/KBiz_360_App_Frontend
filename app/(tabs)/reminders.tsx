// The Tasks tab (spec 2026-11-16: tasks replace reminders). The route keeps its old name, `reminders`,
// on purpose: the home-screen widgets in the store builds open kbiz360://reminders, and reminder
// pushes already on phones route to /(tabs)/reminders — both now land on Tasks. The old Reminders
// screen (src/components/reminders/ReminderDashboard) is no longer reachable from the app.
export { default } from '../../src/components/tasks/TasksScreen';
