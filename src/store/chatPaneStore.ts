import { create } from 'zustand';

// The conversation open in the right-hand pane of the two-pane Chats view (iPhone Duo opened).
// On a phone-width window chats open as their own screen instead and this stays empty.
interface ChatPaneState {
  openId: string | null;
  /** A message to land on (from search / starred), like the chat screen's `messageId` param. */
  messageId: string | null;
  open: (id: string, messageId?: string | null) => void;
  close: () => void;
}

export const useChatPaneStore = create<ChatPaneState>((set) => ({
  openId: null,
  messageId: null,
  open: (id, messageId = null) => set({ openId: id, messageId }),
  close: () => set({ openId: null, messageId: null }),
}));
