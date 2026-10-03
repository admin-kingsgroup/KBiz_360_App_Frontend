import { createContext, useContext } from 'react';
import { useMessagingStore } from '../store/messagingStore';
import { chatThemeFor, DEFAULT_CHAT_THEME, type ChatTheme } from './chatThemes';
import { chatListPalette, type ChatListPalette } from './chatListPalette';

// Which palette a conversation paints with, resolved in one place.
//
//   1. the per-chat override  (chat menu -> Theme)      — that conversation, this device
//   2. the global chat theme  (Profile -> Chat theme)   — every conversation, this device
//   3. `slate`                                          — built in
//
// Order matters: someone who themed a single chat months ago keeps it when a global theme is set
// later. Clearing the override (the "Use my default" tile) drops that chat back to step 2.
export function useChatTheme(conversationId?: string): ChatTheme {
  const override = useMessagingStore((s) => (conversationId ? s.wallpapers[conversationId] : undefined));
  const global = useMessagingStore((s) => s.chatTheme);
  return chatThemeFor(override ?? global ?? DEFAULT_CHAT_THEME);
}

/** The globally chosen theme, ignoring any per-chat override — for Profile and the picker preview. */
export function useGlobalChatTheme(): ChatTheme {
  return chatThemeFor(useMessagingStore((s) => s.chatTheme));
}

/** The Chats list's colours — always the global theme (see chatListPalette.ts). */
export function useChatListPalette(): ChatListPalette {
  return chatListPalette(useGlobalChatTheme());
}

// The chat screen resolves the theme once and publishes it here, so the message bubble — which is a
// module-level component far down the file — can read it without threading a prop through every
// layer between. Defaults to the fallback theme so a bubble rendered outside a chat still paints.
export const ChatThemeContext = createContext<ChatTheme>(chatThemeFor(DEFAULT_CHAT_THEME));

export const useChatThemeCtx = (): ChatTheme => useContext(ChatThemeContext);
