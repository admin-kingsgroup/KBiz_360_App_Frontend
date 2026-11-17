import { Dimensions } from 'react-native';
import { router } from 'expo-router';
import { isWideWidth } from '../logic/wideLayout';
import { openChatWith, type ChatOpenNav } from '../logic/openChatRoute';
import { useChatPaneStore } from '../store/chatPaneStore';

/**
 * Open a chat from outside the chat lists (a notification tap, a call screen): beside the Chats list
 * on a wide window, as its own screen otherwise. See logic/openChatRoute.
 */
export function openChatFromOutside(id: string, messageId: string | null = null): void {
  // expo-router's typed Href is stricter than the two plain routes used here.
  const nav = router as unknown as ChatOpenNav;
  openChatWith(nav, isWideWidth(Dimensions.get('window').width), (c, m) => useChatPaneStore.getState().open(c, m), id, messageId);
}
