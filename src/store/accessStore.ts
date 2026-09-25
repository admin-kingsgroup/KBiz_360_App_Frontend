import { create } from 'zustand';
import type { AccessControl, User } from '../types';
import { deriveAccess } from '../logic/access';

// Drives access enforcement + "View as". `user` = real user; `viewAsUser` = preview override.
export interface AccessState {
  user: User | null;
  viewAsUser: User | null;
  users: User[];
  setUser: (user: User | null) => void;
  setViewAs: (user: User | null) => void;
  setUsers: (users: User[]) => void;
  upsertUser: (user: User) => void;
  effUser: () => User | null;
  access: () => AccessControl | null;   // derived; null when no user
  canManage: () => boolean;
}

export const useAccessStore = create<AccessState>((set, get) => ({
  user: null,
  viewAsUser: null,
  users: [],
  setUser: (user) => set({ user }),
  setViewAs: (viewAsUser) => set({ viewAsUser }),
  setUsers: (users) => set({ users }),
  upsertUser: (user) =>
    set((s) => ({
      users: s.users.some((u) => u.id === user.id)
        ? s.users.map((u) => (u.id === user.id ? { ...u, ...user } : u))
        : [...s.users, user],
    })),
  effUser: () => get().viewAsUser || get().user,
  access: () => {
    const eff = get().viewAsUser || get().user;
    return eff ? deriveAccess(eff) : null;
  },
  canManage: () => {
    const a = get().access();
    return a ? a.canManage : false;
  },
}));
