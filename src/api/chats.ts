import { apiFetch } from './client';
import type { Chat, Message } from '../types';

export interface ChatListResponse {
  chats: Chat[];
  unreadTotal: number;
}

export const listChats = (): Promise<ChatListResponse> => apiFetch('/api/chats');
export const getMessages = (chatId: string): Promise<Message[]> => apiFetch(`/api/chats/${chatId}/messages`);
export const markChatRead = (chatId: string): Promise<void> => apiFetch(`/api/chats/${chatId}/read`, { method: 'POST' });
export const sendMessage = (chatId: string, body: string): Promise<Message> =>
  apiFetch('/api/messages', { method: 'POST', body: { chatId, body } });
