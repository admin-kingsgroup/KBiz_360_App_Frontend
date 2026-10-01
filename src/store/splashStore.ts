import { create } from 'zustand';

// Launch splash hand-off. The login screen mounts underneath the splash while the session restores;
// it holds its sign-in card back until the splash starts dissolving, so the card slides up from the
// bottom AFTER the spinning logo has landed instead of playing unseen under the splash. Flips once
// per launch and stays true — a later sign-out shows the login (and its slide-up) straight away.
export interface SplashState {
  handedOff: boolean;
  handOff: () => void;
}

export const useSplashStore = create<SplashState>((set, get) => ({
  handedOff: false,
  handOff: () => { if (!get().handedOff) set({ handedOff: true }); },
}));
