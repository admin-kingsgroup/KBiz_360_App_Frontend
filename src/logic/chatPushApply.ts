import type { ChatConversation } from '../api/chat';

// Pure application of a background chat push (FCM data message) to the PERSISTED messaging
// snapshot — the WhatsApp-style "open the app and unread is already there" path. Runs in the
// headless background handler against the JSON in AsyncStorage (the in-memory store is not
// alive there), so it must be side-effect-free and defensive about partial payloads.

export interface ChatPushData {
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  convType?: string;
  convName?: string;
  preview?: string;
  msgType?: string;
  sentAt?: string;
  mention?: string; // '1' when this recipient was @-mentioned (FCM data values are strings)
  // The message itself, for writing straight into the on-device database (services/chatDb) as the
  // push lands. `full: '1'` is the server's signal that `text`/`att` are the COMPLETE message and not
  // the truncated notification preview — without it, nothing is stored and the next catch-up sync
  // fetches the message instead.
  full?: string;
  text?: string;
  att?: string; // JSON-encoded attachment array
}

// Build the storable message from a push payload, or null when the payload isn't the whole message.
// Shaped like the REST DTO so the on-device copy is indistinguishable from a synced one; the next
// catch-up replaces it with the server's version anyway (same id ⇒ upsert, never a duplicate).
export function pushedMessage(data: ChatPushData): Record<string, unknown> | null {
  if (data.full !== '1' || !data.messageId || !data.conversationId) return null;
  let attachments: unknown[] = [];
  if (data.att) {
    try {
      const parsed: unknown = JSON.parse(data.att);
      if (!Array.isArray(parsed)) return null;
      attachments = parsed;
    } catch { return null; } // malformed payload — let the sync fetch it properly
  }
  const at = data.sentAt || new Date().toISOString();
  return {
    id: data.messageId,
    conversationId: data.conversationId,
    senderId: data.senderId || '',
    type: data.msgType || 'text',
    text: data.text ?? '',
    deletedForEveryone: false,
    attachments,
    replyTo: null,
    forwardedFrom: null,
    mentions: [],
    reactions: [],
    status: 'sent',
    sentAt: at,
    deliveredAt: null,
    readAt: null,
    pinned: false,
    edited: false,
    editedAt: null,
    createdAt: at,
    mine: false, // pushes only ever go to recipients
    starred: false,
  };
}

// The notification line for one pushed message, WhatsApp-style: group lines carry the sender's
// name, an @-mention says so explicitly ("Faiz mentioned you: …").
export function chatPushLine(data: ChatPushData): string {
  const preview = data.preview ?? '';
  if (data.mention === '1' && data.senderName) return `${data.senderName} mentioned you: ${preview}`;
  return data.convType === 'group' && data.senderName ? `${data.senderName}: ${preview}` : preview;
}

export interface ApplyResult {
  conversations: ChatConversation[];
  changed: boolean;
  /** Conversations with unread messages AFTER applying — feeds the app-icon badge (WhatsApp counts chats, not messages, and muted chats don't count). */
  unreadChats: number;
}

const countUnreadChats = (cs: ChatConversation[]): number => cs.filter((c) => (c.unread || 0) > 0 && !c.muted).length;

export function applyChatPush(conversations: ChatConversation[], data: ChatPushData): ApplyResult {
  const convId = data.conversationId;
  if (!convId) return { conversations, changed: false, unreadChats: countUnreadChats(conversations) };
  const at = data.sentAt || new Date().toISOString();
  const lastMessage = {
    messageId: data.messageId || null,
    id: data.messageId || null,
    text: data.preview || '',
    type: data.msgType || 'text',
    senderId: data.senderId || '',
    at,
    status: 'sent' as const,
  };

  const existing = conversations.find((c) => c.id === convId);
  // Dedupe: FCM can redeliver — if the snapshot already carries this exact message, do nothing.
  if (existing && data.messageId && existing.lastMessage?.messageId === data.messageId) {
    return { conversations, changed: false, unreadChats: countUnreadChats(conversations) };
  }

  const isGroup = data.convType === 'group';
  const updated: ChatConversation[] = existing
    ? conversations.map((c) => (c.id === convId ? { ...c, unread: (c.unread || 0) + 1, lastMessage, lastActivityAt: at } : c))
    : [
        // First message of a conversation the snapshot has never seen — stub it from the push so it
        // shows immediately on cold open; the next loadConversations() fills in the real metadata.
        {
          id: convId,
          type: (isGroup ? 'group' : 'direct') as ChatConversation['type'],
          name: (isGroup ? data.convName : data.senderName) || data.senderName || 'New message',
          image: null,
          ...(isGroup ? {} : { otherUserId: data.senderId || undefined }),
          memberCount: isGroup ? 0 : 2,
          unread: 1,
          muted: false,
          archived: false,
          lastMessage,
          lastActivityAt: at,
        },
        ...conversations,
      ];

  const sorted = [...updated].sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  return { conversations: sorted, changed: true, unreadChats: countUnreadChats(sorted) };
}
