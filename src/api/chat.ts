import { apiFetch } from './client';

export interface LastMessage { messageId: string | null; text: string; type: string; senderId: string; at: string }
export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  image: string | null;
  otherUserId?: string;
  online?: boolean;
  lastSeen?: string | null;
  memberCount: number;
  unread: number;
  muted: boolean;
  archived: boolean;
  lastMessage: LastMessage | null;
  lastActivityAt: string;
  myRole?: 'admin' | 'member';
  description?: string | null;
}
export interface ChatReaction { userId: string; emoji: string }
export interface ChatReplyTo { messageId: string; senderId: string; preview: string; type: string }
export interface ChatAttachment {
  url: string; key?: string; name: string; size: number; mime: string;
  width?: number; height?: number; durationMs?: number; thumbnailUrl?: string; waveform?: number[];
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'video' | 'document' | 'voice' | 'system';
  text: string;
  deletedForEveryone: boolean;
  attachments: ChatAttachment[];
  replyTo: ChatReplyTo | null;
  forwardedFrom: { messageId: string; conversationId: string } | null;
  reactions: ChatReaction[];
  status: 'sent' | 'delivered' | 'read';
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  pinned: boolean;
  edited: boolean;
  editedAt: string | null;
  createdAt: string;
  mine: boolean;
  starred: boolean;
  clientId?: string;
}

// ── conversations ──
export const listConversations = (): Promise<ChatConversation[]> => apiFetch('/api/conversations');
export const getConversation = (id: string): Promise<ChatConversation> => apiFetch(`/api/conversations/${id}`);
export const getOrCreateDirect = (otherUserId: string): Promise<ChatConversation> =>
  apiFetch('/api/conversations', { method: 'POST', body: { otherUserId } });
export const getMessages = (conversationId: string, opts: { before?: string; limit?: number } = {}): Promise<ChatMessage[]> => {
  const q = new URLSearchParams();
  if (opts.before) q.set('before', opts.before);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`);
};
export const markConversationRead = (conversationId: string): Promise<{ read: number }> =>
  apiFetch(`/api/conversations/${conversationId}/read`, { method: 'POST' });
export const getPinned = (conversationId: string): Promise<ChatMessage[]> => apiFetch(`/api/conversations/${conversationId}/pinned`);

// ── messages ──
export const sendMessage = (input: { conversationId: string; text?: string; type?: ChatMessage['type']; attachments?: ChatAttachment[]; replyToId?: string; clientId?: string }): Promise<ChatMessage> =>
  apiFetch('/api/messages', { method: 'POST', body: input });
export const editMessage = (id: string, text: string): Promise<ChatMessage> => apiFetch(`/api/messages/${id}`, { method: 'PUT', body: { text } });
export const deleteMessage = (id: string, scope: 'me' | 'everyone'): Promise<{ ok: boolean }> => apiFetch(`/api/messages/${id}?scope=${scope}`, { method: 'DELETE' });
export const reactMessage = (id: string, emoji: string): Promise<{ ok: boolean }> => apiFetch(`/api/messages/${id}/reaction`, { method: 'POST', body: { emoji } });
export const starMessage = (id: string): Promise<{ starred: boolean }> => apiFetch(`/api/messages/${id}/star`, { method: 'POST' });
export const pinMessage = (id: string): Promise<{ pinned: boolean }> => apiFetch(`/api/messages/${id}/pin`, { method: 'POST' });
export const forwardMessage = (messageId: string, conversationIds: string[]): Promise<ChatMessage[]> => apiFetch('/api/messages/forward', { method: 'POST', body: { messageId, conversationIds } });
export const searchMessages = (q: string): Promise<ChatMessage[]> => apiFetch(`/api/messages/search?q=${encodeURIComponent(q)}`);
export const starredMessages = (): Promise<ChatMessage[]> => apiFetch('/api/messages/starred');

// ── admin analytics (Super-Admin only) ──
export interface ChatAnalytics {
  messagesSent: number;
  messagesToday: number;
  dau: number;
  mau: number;
  conversations: { direct: number; group: number; total: number };
  mediaUsage: Record<string, number>;
  messagesPerDay: { date: string; count: number }[];
  mostActiveUsers: { userId: string; name: string; count: number }[];
  mostActiveGroups: { conversationId: string; name: string; count: number }[];
  generatedAt: string;
}
export const getChatAnalytics = (): Promise<ChatAnalytics> => apiFetch('/api/chat/analytics');

// ── groups ──
export const createGroup = (input: { name: string; memberIds: string[]; description?: string; image?: string }): Promise<ChatConversation> =>
  apiFetch('/api/groups', { method: 'POST', body: input });
export const updateGroup = (id: string, patch: { name?: string; description?: string; image?: string }): Promise<ChatConversation> =>
  apiFetch(`/api/groups/${id}`, { method: 'PUT', body: patch });
export const addGroupMembers = (id: string, memberIds: string[]): Promise<ChatConversation> => apiFetch(`/api/groups/${id}/members`, { method: 'POST', body: { memberIds } });
export const removeGroupMember = (id: string, memberId: string): Promise<{ ok: boolean }> => apiFetch(`/api/groups/${id}/members/${memberId}`, { method: 'DELETE' });
export const promoteGroupAdmin = (id: string, memberId: string): Promise<{ ok: boolean }> => apiFetch(`/api/groups/${id}/admins`, { method: 'POST', body: { memberId } });
