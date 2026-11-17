import { create } from 'zustand';
import { colors } from '../theme';

// iPhone Duo: on the closed (outer) screen, and on the open screen held sideways, iOS moves the
// status bar, camera and system buttons into a vertical strip down one side. SideSafeArea keeps the
// app out of that strip; this is the colour painted under it. It follows the screen in front, the
// way WhatsApp does there, so the clock (dark or light status-bar text) stays readable:
// a screen that turns the status bar light (dark Chats theme, login) sets a dark strip, and
// hands back the default on blur.
export const SIDE_STRIP_DEFAULT = colors.card;

interface SideStripState {
  color: string;
  setColor: (color: string | null) => void;
}

export const useSideStripStore = create<SideStripState>((set) => ({
  color: SIDE_STRIP_DEFAULT,
  setColor: (color) => set({ color: color ?? SIDE_STRIP_DEFAULT }),
}));
