import { apiFetch } from './client';

export interface LastMessage { messageId: string | null; text: string; type: string; senderId: string; at: string; id?: string | null; status?: 'sent' | 'delivered' | 'read' | null }
export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  image: string | null;
  otherUserId?: string;
  online?: boolean;
  lastSeen?: number | null; // epoch ms (older servers sent an ISO string — normalize via toEpochMs at consumers)
  memberCount: number;
  unread: number;
  muted: boolean;
  archived: boolean;
  lastMessage: LastMessage | null;
  lastActivityAt: string;
  myRole?: 'admin' | 'member';
  description?: string | null;
  createdBy?: string;
  members?: { userId: string; role: 'admin' | 'member' }[];
  deptKey?: string | null; // "<branchId>:<departmentId>" lookup key (non-unique)
  companyId?: string | null; // the business this group belongs to
  branchId?: string | null; // the branch this group belongs to (member picker scopes to it)
  departmentId?: string | null; // the department this group belongs to
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
  mentions?: string[]; // @-mentioned userIds (optional: pre-mentions servers/messages omit it)
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
export const sendMessage = (input: { conversationId: string; text?: string; type?: ChatMessage['type']; attachments?: ChatAttachment[]; replyToId?: string; clientId?: string; mentions?: string[] }): Promise<ChatMessage> =>
  apiFetch('/api/messages', { method: 'POST', body: input });
export const editMessage = (id: string, text: string): Promise<ChatMessage> => apiFetch(`/api/messages/${id}`, { method: 'PUT', body: { text } });
export const deleteMessage = (id: string, scope: 'me' | 'everyone'): Promise<{ ok: boolean }> => apiFetch(`/api/messages/${id}?scope=${scope}`, { method: 'DELETE' });
export const reactMessage = (id: string, emoji: string): Promise<{ ok: boolean }> => apiFetch(`/api/messages/${id}/reaction`, { method: 'POST', body: { emoji } });
export const starMessage = (id: string): Promise<{ starred: boolean }> => apiFetch(`/api/messages/${id}/star`, { method: 'POST' });
export const pinMessage = (id: string): Promise<{ pinned: boolean }> => apiFetch(`/api/messages/${id}/pin`, { method: 'POST' });
// Per-user receipts for one message ("message info"). Sender-only — the backend 404s for anyone else.
export interface MessageReceipts { readBy: { userId: string; at: number | null }[]; deliveredTo: string[]; participants: string[] }
export const getReceipts = (messageId: string): Promise<MessageReceipts> => apiFetch(`/api/messages/${messageId}/receipts`);
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

// ── presence ──
export const getPresence = (userIds: string[]): Promise<Record<string, { status: string; lastSeen: number | null }>> =>
  apiFetch(`/api/chat/presence?userIds=${encodeURIComponent(userIds.join(','))}`);

// ── groups ──
export const createGroup = (input: { name: string; memberIds: string[]; description?: string; image?: string; companyId?: string; branchId?: string; departmentId?: string }): Promise<ChatConversation> =>
  apiFetch('/api/groups', { method: 'POST', body: input });
// Get-or-create the auto group chat for a (branch, department) and open it (members = the branch).
export const getOrCreateDepartmentGroup = (branchId: string, departmentId: string, name: string): Promise<ChatConversation> =>
  apiFetch('/api/groups/department', { method: 'POST', body: { branchId, departmentId, name } });
export const updateGroup = (id: string, patch: { name?: string; description?: string; image?: string }): Promise<ChatConversation> =>
  apiFetch(`/api/groups/${id}`, { method: 'PUT', body: patch });
export const deleteGroup = (id: string): Promise<{ ok: boolean }> => apiFetch(`/api/groups/${id}`, { method: 'DELETE' });
export const addGroupMembers = (id: string, memberIds: string[]): Promise<ChatConversation> => apiFetch(`/api/groups/${id}/members`, { method: 'POST', body: { memberIds } });
export const removeGroupMember = (id: string, memberId: string): Promise<{ ok: boolean }> => apiFetch(`/api/groups/${id}/members/${memberId}`, { method: 'DELETE' });
export const promoteGroupAdmin = (id: string, memberId: string): Promise<{ ok: boolean }> => apiFetch(`/api/groups/${id}/admins`, { method: 'POST', body: { memberId } });
