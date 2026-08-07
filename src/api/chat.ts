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
  mutedUntil?: string | null; // ISO; null with muted ⇒ muted forever ("Always")
  archived: boolean;
  pinned?: boolean;
  disappearAfterSec?: number | null;
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
// `before` pages backwards into history; `after` asks only for what arrived since a message we already
// hold locally (delta sync — see services/chatDb.ts). Both come back chronological.
export const getMessages = (conversationId: string, opts: { before?: string; after?: string; limit?: number } = {}): Promise<ChatMessage[]> => {
  const q = new URLSearchParams();
  if (opts.before) q.set('before', opts.before);
  if (opts.after) q.set('after', opts.after);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`);
};
// Catch-up sync: everything that changed across ALL my conversations since the watermark — new
// messages plus edits, deletions, reactions and receipt ticks. One call on connect replaces the
// per-chat refetch, which is what lets opening a chat touch the network not at all.
// The watermark is a PAIR: a timestamp plus the id of the last row seen at it. Receipt updates stamp
// many messages with one identical instant, and a timestamp-only cursor would drop the remainder of
// such a batch whenever a page ended inside it.
export interface SyncPage { messages: ChatMessage[]; until: string; untilId: string | null; more: boolean }
export const syncSince = (since: string, sinceId: string | null, limit = 200): Promise<SyncPage> =>
  apiFetch(`/api/chat/sync?since=${encodeURIComponent(since)}${sinceId ? `&sinceId=${encodeURIComponent(sinceId)}` : ''}&limit=${limit}`);

// ── per-chat settings (mute / archive / pin) — personal to the caller, never the whole group ──
export const setConversationSettings = (
  conversationId: string,
  patch: { muted?: boolean; muteHours?: number | null; archived?: boolean; pinned?: boolean },
): Promise<ChatConversation> => apiFetch(`/api/conversations/${conversationId}/settings`, { method: 'PATCH', body: patch });

// Disappearing messages: seconds until a NEW message self-deletes (null = off). Group admins only.
export const setDisappearing = (conversationId: string, seconds: number | null): Promise<{ disappearAfterSec: number | null }> =>
  apiFetch(`/api/conversations/${conversationId}/disappearing`, { method: 'PATCH', body: { seconds } });

// ── privacy + blocking ──
export interface ChatPrivacy { readReceipts: boolean; lastSeen: 'everyone' | 'nobody'; blocked: string[] }
export const getPrivacy = (): Promise<ChatPrivacy> => apiFetch('/api/chat/privacy');
export const updatePrivacy = (patch: { readReceipts?: boolean; lastSeen?: 'everyone' | 'nobody' }): Promise<ChatPrivacy> =>
  apiFetch('/api/chat/privacy', { method: 'PATCH', body: patch });
export const blockUser = (userId: string): Promise<ChatPrivacy> => apiFetch(`/api/chat/block/${userId}`, { method: 'POST' });
export const unblockUser = (userId: string): Promise<ChatPrivacy> => apiFetch(`/api/chat/block/${userId}`, { method: 'DELETE' });

// ── link preview ──
// Fetched server-side on purpose: asking the phone to load the page would leak every reader's IP to
// whatever was linked. Returns null when the URL is unreachable or has no card metadata.
export interface LinkPreview { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null }
export const getLinkPreview = (url: string): Promise<LinkPreview | null> =>
  apiFetch(`/api/chat/link-preview?url=${encodeURIComponent(url)}`);

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
// Global by default; `conversationId` scopes it to one thread (the in-chat search bar), `before`
// pages older results (message-id cursor, newest-first).
export const searchMessages = (q: string, opts: { conversationId?: string; before?: string } = {}): Promise<ChatMessage[]> =>
  apiFetch(`/api/messages/search?q=${encodeURIComponent(q)}`
    + (opts.conversationId ? `&conversationId=${encodeURIComponent(opts.conversationId)}` : '')
    + (opts.before ? `&before=${encodeURIComponent(opts.before)}` : ''));
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

// ── status (24-hour stories) ──
// Audience is fixed when posted: the colleagues you already share a conversation with, minus blocks.
export interface StatusItem {
  id: string;
  userId: string;
  type: 'image' | 'video' | 'text';
  caption: string;
  attachment: ChatAttachment | null;
  backgroundColor: string | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewers: { userId: string; at: string }[]; // populated for your OWN status only
  viewCount: number;
}
export interface StatusEntry {
  userId: string; name: string; avatar: string | null;
  items: StatusItem[]; lastAt: string; allViewed: boolean; mine: boolean;
}
export const listStatus = (): Promise<StatusEntry[]> => apiFetch('/api/status');
export const postStatus = (input: { type: 'image' | 'video' | 'text'; caption?: string; attachment?: ChatAttachment; backgroundColor?: string }): Promise<StatusItem> =>
  apiFetch('/api/status', { method: 'POST', body: input });
export const viewStatus = (id: string): Promise<{ ok: boolean }> => apiFetch(`/api/status/${id}/view`, { method: 'POST' });
export const deleteStatus = (id: string): Promise<{ ok: boolean }> => apiFetch(`/api/status/${id}`, { method: 'DELETE' });
