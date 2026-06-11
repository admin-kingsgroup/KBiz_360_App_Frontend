import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../api/client';
import { getAccessToken } from '../api/tokens';
import { useMessagingStore } from '../store/messagingStore';
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

  socket.on('connect', () => { void store().loadConversations(); void store().flushOutbox(); });
  socket.on('chat:receive', (m) => store().onReceive(m));
  socket.on('chat:delivered', (p) => store().onDelivered(p));
  socket.on('chat:read', (p) => store().onRead(p));
  socket.on('chat:edit', (p) => store().onEdit(p));
  socket.on('chat:delete', (p) => store().onDelete(p));
  socket.on('chat:reaction', (p) => store().onReaction(p));
  socket.on('chat:typing', (p: { conversationId: string; userId: string }) => store().onTyping(p.conversationId, p.userId, true));
  socket.on('chat:stopTyping', (p: { conversationId: string; userId: string }) => store().onTyping(p.conversationId, p.userId, false));
  socket.on('chat:online', (p: { userId: string; status?: string }) => store().onPresence({ userId: p.userId, online: true, status: p.status }));
  socket.on('chat:offline', (p: { userId: string; lastSeen?: number | null }) => store().onPresence({ userId: p.userId, online: false, lastSeen: p.lastSeen ?? null }));
  socket.on('presence:update', (p: { userId: string; status?: string; lastSeen?: number | null }) => store().onPresence(p));
  socket.on('chat:conversationNew', () => void store().loadConversations());
  socket.on('chat:conversationUpdated', () => void store().loadConversations());
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
