import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../api/client';
import { getAccessToken } from '../api/tokens';
import type { ChatMessage } from '../api/chat';
import { useMessagingStore } from '../store/messagingStore';
import { useReminderBadgeStore } from '../store/reminderBadgeStore';
import { useTasksStore } from '../store/tasksStore';
import { useAuthStore } from '../store/authStore';
import { usePulseStore } from '../store/pulseStore';
import { useApprovalBadgeStore } from '../store/approvalBadgeStore';
import { useOwnerReviewStore } from '../store/ownerReviewStore';

// Single Socket.IO client for the whole app. Connects with the JWT, wires chat events into the
// messaging store, and reconnects automatically (socket.io built-in backoff).
let socket: Socket | null = null;

export function connectChatSocket(): void {
  const token = getAccessToken();
  if (!token) return;
  if (socket) { socket.auth = { token }; if (!socket.connected) socket.connect(); return; }

  socket = io(getApiBaseUrl(), { auth: { token }, transports: ['websocket'], reconnection: true });
  const store = useMessagingStore.getState;

  socket.on('connect', () => {
    void store().loadConversations(); void store().flushOutbox(); void useReminderBadgeStore.getState().refresh(); void useTasksStore.getState().refreshBadge(useAuthStore.getState().user?.id); void useTasksStore.getState().refreshNotifications(); void usePulseStore.getState().refresh(); void useApprovalBadgeStore.getState().refresh(); void useOwnerReviewStore.getState().refresh();
    // Catch-up: one request for everything that changed anywhere while this device was away — new
    // messages, edits, deletions, reactions, ticks. This is what keeps the local database current, so
    // opening a chat needs no request of its own.
    void store().catchUp();
    // Reconnect healing: after a transient drop the server no longer has this socket in the open
    // conversation's room (typing/receipt events would silently die) — rejoin. The catch-up above
    // already refilled anything missed while the socket was down.
    const active = store().activeConversationId;
    if (active) socket?.emit('chat:join', { conversationId: active });
  });
  // Reconnect attempts reuse the handshake auth — refresh it so a rotated token doesn't get rejected.
  socket.io.on('reconnect_attempt', () => { if (socket) socket.auth = { token: getAccessToken() ?? '' }; });
  // Handshake token failed verification (expired mid-session) → refresh the session, re-auth, reconnect.
  // If the refresh fails it already signs out (existing logout flow) — nothing more to do here.
  socket.on('auth:invalid', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void (require('../api/auth') as typeof import('../api/auth')).refresh().then((ok) => {
      if (!ok || !socket) return;
      socket.auth = { token: getAccessToken() ?? '' };
      if (!socket.connected) socket.connect();
    });
  });
  socket.on('chat:receive', (m: ChatMessage & { clientId?: string }) => {
    store().onReceive(m);
    // Delivered receipt (the missing half of double ticks): I received it here but am not looking at
    // this conversation — the active one already fires markRead in onReceive, which implies delivery.
    const s = store();
    if (m.senderId !== s.myUserId && s.activeConversationId !== m.conversationId) socket?.emit('chat:delivered', { conversationId: m.conversationId });
  });
  socket.on('chat:delivered', (p) => store().onDelivered(p));
  socket.on('chat:read', (p) => store().onRead(p));
  socket.on('chat:edit', (p) => store().onEdit(p));
  socket.on('chat:delete', (p) => store().onDelete(p));
  socket.on('chat:reaction', (p) => store().onReaction(p));
  socket.on('chat:typing', (p: { conversationId: string; userId: string }) => store().onTyping(p.conversationId, p.userId, true));
  socket.on('chat:stopTyping', (p: { conversationId: string; userId: string }) => store().onTyping(p.conversationId, p.userId, false));
  socket.on('chat:online', (p: { userId: string; status?: string }) => store().onPresence({ userId: p.userId, online: true, status: p.status }));
  socket.on('chat:offline', (p: { userId: string; lastSeen?: number | string | null }) => store().onPresence({ userId: p.userId, online: false, lastSeen: p.lastSeen ?? null }));
  socket.on('presence:update', (p: { userId: string; status?: string; lastSeen?: number | string | null }) => store().onPresence(p));
  // A new chat — or a task chat back on the list because its task was reopened: drop the read-only
  // marks (a task that is still closed stays read-only by its status) and reload the list.
  socket.on('chat:conversationNew', () => { store().clearReadOnlyChats(); void store().loadConversations(); });
  socket.on('chat:conversationUpdated', () => void store().loadConversations());
  // Deleted / removed-from: drop the thread's local history too, so the device isn't left holding
  // messages from a conversation the user can no longer open.
  // A task chat leaves the list when its task is closed or cancelled (owner, 2026-11-17): it is not
  // gone — the task still shows it read-only — so it is closed, not forgotten, and a chat screen open
  // on it keeps its messages and turns read-only instead of going blank.
  socket.on('chat:conversationDeleted', (p: { conversationId?: string }) => {
    const id = p?.conversationId;
    if (id) {
      const s = store();
      const conv = s.conversations.find((c) => c.id === id);
      if (conv?.type === 'task' || (!conv && s.activeConversationId === id)) {
        s.closeTaskChat(id);
        if (conv?.taskId) useTasksStore.getState().markTouched(conv.taskId); // the open task card refetches its status
      } else void s.forgetConversation(id);
    }
    void store().loadConversations();
  });

  // Reminders: refresh the tab badge when one is assigned to me / sent back for my review.
  socket.on('reminder:new', () => void useReminderBadgeStore.getState().refresh());
  socket.on('reminder:update', () => void useReminderBadgeStore.getState().refresh());
  // Tasks: 'task:update' { taskId } reaches everyone on a task when it changes — refresh the tab badge
  // (and the widget list) and tell any open screen showing that task to refetch. 'task:notification'
  // goes to the one person it is for — refresh the in-app list's unread count.
  socket.on('task:update', (p?: { taskId?: string; deleted?: boolean }) => {
    // A Super Admin deleted it (owner, 2026-11-28): off every list at once, before the refetch.
    if (p?.deleted && p.taskId) useTasksStore.getState().remove(p.taskId);
    useTasksStore.getState().markTouched(p?.taskId);
    void useTasksStore.getState().refreshBadge(useAuthStore.getState().user?.id);
  });
  socket.on('task:notification', () => void useTasksStore.getState().refreshNotifications());

  // System alerts: the broadcast carries only a channelId — refetch the access-filtered feed.
  socket.on('alert:new', () => void usePulseStore.getState().refresh());
  // A super-admin changed which alert channels I can see → re-derive access + refetch the feed.
  socket.on('alert:visibility', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void (require('../api/auth') as typeof import('../api/auth')).refreshMe();
    void usePulseStore.getState().refresh();
  });

  // A super-admin disabled this user's app access → log out immediately.
  socket.on('auth:revoked', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void require('../api/auth').logout();
  });
}

export function disconnectChatSocket(): void {
  socket?.disconnect();
  socket = null;
}

export const getSocket = (): Socket | null => socket;

export const joinConversation = (conversationId: string): void => { socket?.emit('chat:join', { conversationId }); };
export const leaveConversation = (conversationId: string): void => { socket?.emit('chat:leave', { conversationId }); };
export const emitTyping = (conversationId: string): void => { socket?.emit('chat:typing', { conversationId }); };
export const emitStopTyping = (conversationId: string): void => { socket?.emit('chat:stopTyping', { conversationId }); };
export const emitRead = (conversationId: string): void => { socket?.emit('chat:read', { conversationId }); };
