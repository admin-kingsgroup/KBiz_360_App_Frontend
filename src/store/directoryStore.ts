import { create } from 'zustand';
import { listCompanies, listBranches, listDepartments } from '../api/directory';
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
