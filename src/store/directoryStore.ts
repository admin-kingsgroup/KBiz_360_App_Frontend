import { create } from 'zustand';
import { listCompanies, listBranches, listDepartments, listUsers, toUser } from '../api/directory';
import { useAccessStore } from './accessStore';
import { buildDirectory, type Directory } from '../logic/directory';

// Real CRM org directory (companies / branches / departments) for the Home segments. Access-scoped by
// the backend. If the API is unavailable/empty (offline, older backend), `businesses` stays empty and
// Home falls back to the mock org data — so the screen never breaks.
interface DirectoryStore extends Directory {
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
}

export const useDirectoryStore = create<DirectoryStore>((set, get) => ({
  businesses: [],
  branches: [],
  businessDepts: {},
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [companies, branches, departments] = await Promise.all([
        listCompanies(),
        listBranches(),
        listDepartments(),
      ]);
      set({ ...buildDirectory(companies, branches, departments), loaded: true, loading: false });
    } catch {
      set({ loaded: true, loading: false }); // leave empty → Home uses the mock fallback
    }
  },
}));

// ── shared user directory (accessStore.users) ──
// Every people list in the app (member pickers, group info, search, office assignments…) renders
// from accessStore.users. It used to be fetched once ("if empty") and never again, so a user
// created / renamed / re-titled / deleted / deactivated elsewhere stayed stale until an app
// restart. Screens call this on focus (throttled — cheap, cached list shows instantly and is
// replaced when the fetch lands) and mutation handlers call it with { force: true } right after
// a save so the change is visible everywhere immediately.
let usersInFlight: Promise<void> | null = null;
let usersLoadedAt = 0;
const USERS_MAX_AGE_MS = 15_000;
export function refreshDirectoryUsers(opts?: { force?: boolean }): Promise<void> {
  if (usersInFlight) return usersInFlight;
  const empty = useAccessStore.getState().users.length === 0;
  if (!opts?.force && !empty && Date.now() - usersLoadedAt < USERS_MAX_AGE_MS) return Promise.resolve();
  usersInFlight = listUsers()
    .then((list) => { useAccessStore.getState().setUsers(list.map(toUser)); usersLoadedAt = Date.now(); })
    .catch(() => undefined) // offline / signed out — keep the cached list
    .finally(() => { usersInFlight = null; });
  return usersInFlight;
}
