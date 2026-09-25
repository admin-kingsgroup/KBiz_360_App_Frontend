// Pending chat-notification tap. Notifee press events can fire where the router can't run (the
// headless background handler) or before it is safe to route (cold start, while the auth gate is
// still redirecting login → tabs — a premature push gets stomped by the gate's replace()). So a
// tap only LATCHES the conversation here; useCallNotifications consumes it once the gate has
// settled on the app. Import-pure (no RN/native imports) so the headless handler can use it.

type Listener = () => void;

let pendingConversationId: string | null = null;
const listeners = new Set<Listener>();

export function setPendingChatTap(conversationId: string): void {
  pendingConversationId = conversationId;
  listeners.forEach((l) => l());
}

export function consumePendingChatTap(): string | null {
  const id = pendingConversationId;
  pendingConversationId = null;
  return id;
}

/** Notifies when a tap is latched while the app is already running (background press). */
export function subscribePendingChatTap(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
