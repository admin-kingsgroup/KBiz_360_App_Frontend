import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../api/client';
import { getAccessToken } from '../api/tokens';
import type { ChatMessage } from '../api/chat';
import { useMessagingStore } from '../store/messagingStore';
import { useReminderBadgeStore } from '../store/reminderBadgeStore';
import { usePulseStore } from '../store/pulseStore';
import { callManager } from '../services/rtc/CallManager';

// Single Socket.IO client for the whole app. Connects with the JWT, wires chat events into the
// messaging store, and reconnects automatically (socket.io built-in backoff).
let socket: Socket | null = null;

export function connectChatSocket(): void {
  const token = getAccessToken();
  if (!token) return;
  if (socket) { socket.auth = { token }; if (!socket.connected) socket.connect(); return; }

  socket = io(getApiBaseUrl(), { auth: { token }, transports: ['websocket'], reconnection: true });
  const store = useMessagingStore.getState;

  // Audio calling: wire the WebRTC signaling (call:incoming/accept/reject/end/missed + offer/answer/ice).
  callManager.attach(socket);

  socket.on('connect', () => {
    void store().loadConversations(); void store().flushOutbox(); void useReminderBadgeStore.getState().refresh(); void usePulseStore.getState().refresh();
    // Reconnect healing: after a transient drop the server no longer has this socket in the open
    // conversation's room (typing/receipt events would silently die) and events were missed — rejoin
    // and reload the thread from REST.
    const active = store().activeConversationId;
    if (active) { socket?.emit('chat:join', { conversationId: active }); void store().loadMessages(active); }
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
  socket.on('chat:conversationNew', () => void store().loadConversations());
  socket.on('chat:conversationUpdated', () => void store().loadConversations());
  socket.on('chat:conversationDeleted', () => void store().loadConversations());

  // Reminders: refresh the tab badge when one is assigned to me / sent back for my review.
  socket.on('reminder:new', () => void useReminderBadgeStore.getState().refresh());
  socket.on('reminder:update', () => void useReminderBadgeStore.getState().refresh());

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
  callManager.detach();
  socket?.disconnect();
  socket = null;
}

export const getSocket = (): Socket | null => socket;

export const joinConversation = (conversationId: string): void => { socket?.emit('chat:join', { conversationId }); };
export const leaveConversation = (conversationId: string): void => { socket?.emit('chat:leave', { conversationId }); };
export const emitTyping = (conversationId: string): void => { socket?.emit('chat:typing', { conversationId }); };
export const emitStopTyping = (conversationId: string): void => { socket?.emit('chat:stopTyping', { conversationId }); };
export const emitRead = (conversationId: string): void => { socket?.emit('chat:read', { conversationId }); };
