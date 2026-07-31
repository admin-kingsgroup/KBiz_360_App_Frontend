// API layer barrel. Stores become cache/state; the backend is the source of truth.
// Mocks in `src/data/*` remain as the offline/dev fallback and the test fixtures.
export * from './client';
export * from './tokens';

export * as authApi from './auth';
export * as usersApi from './users';
export * as businessesApi from './businesses';
export * as remindersApi from './reminders';
export * as attendanceApi from './attendance';
export * as chatsApi from './chats';
export * as emailApi from './email';
export * as pushApi from './push';
export * as adminApi from './admin';
export * as alertsApi from './alerts';
export * as notificationsApi from './notifications';
export * as uploadsApi from './uploads';

export { hydrateStoresFromApi } from './bootstrap';
