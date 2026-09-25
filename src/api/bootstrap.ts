import { listUsers } from './users';
import { listChats } from './chats';
import { useAccessStore } from '../store/accessStore';
import { useChatStore } from '../store/chatStore';

// Hydrate the existing Zustand stores from the API (stores become cache; backend is source of truth).
// Call this after login when a backend is configured. Screens keep rendering from the same stores,
// so no component changes are required. Reminders/attendance/pulse are loaded by their own screens
// via the api modules (their server shapes differ from the seed stores) — see the Phase 10 report.
export async function hydrateStoresFromApi(): Promise<void> {
  const [users, chatsRes] = await Promise.all([listUsers(), listChats()]);
  useAccessStore.getState().setUsers(users);
  useChatStore.getState().setChats(chatsRes.chats);
}
