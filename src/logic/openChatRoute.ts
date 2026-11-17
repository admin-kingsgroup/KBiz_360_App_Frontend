// Opening a chat from OUTSIDE the chat lists — a notification tap, a call screen's "message" action.
// Pure (no router or React Native import), so it is unit-tested; services/openChatFromOutside wires
// it to the real router, the window width and the pane store.

/** The parts of expo-router's router this needs. */
export interface ChatOpenNav {
  navigate: (href: string | { pathname: string; params: Record<string, string> }) => void;
  dismissAll: () => void;
  canDismiss: () => boolean;
}

/**
 * Phone width: the chat screen, as before (navigate, not push — a tap for the chat already in front
 * focuses it instead of stacking a second one). Wide window (the iPhone Duo opened): the chat in the
 * Chats tab's right pane, beside the list — close whatever is on top of the tabs, then show the
 * Chats tab. It used to open the chat screen over the whole opened Duo (owner, 2026-11-17).
 */
export function openChatWith(
  nav: ChatOpenNav,
  wide: boolean,
  openPane: (id: string, messageId: string | null) => void,
  id: string,
  messageId: string | null = null,
): void {
  if (!id) return;
  if (!wide) {
    nav.navigate({ pathname: '/chat/[id]', params: messageId ? { id, messageId } : { id } });
    return;
  }
  openPane(id, messageId);
  if (nav.canDismiss()) nav.dismissAll();
  nav.navigate('/(tabs)');
}
