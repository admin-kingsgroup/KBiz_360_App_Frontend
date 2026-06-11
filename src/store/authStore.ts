import { create } from 'zustand';
import type { User } from '../types';

// Auth state only. Token refresh / session validation require a backend [NEEDS BACKEND].
export interface AuthState {
  user: User | null;
  token: string | null;
  status: 'signedOut' | 'signedIn';
  signIn: (user: User, token?: string) => void;
  signOut: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  status: 'signedOut',
  signIn: (user, token = null as unknown as string) => set({ user, token, status: 'signedIn' }),
  signOut: () => set({ user: null, token: null, status: 'signedOut' }),
  isAuthenticated: () => get().status === 'signedIn',
}));
