import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { ensureTaskChat, type Task } from '../../api/tasks';
import { ApiError } from '../../api/client';
import { taskChatTap } from '../../logic/taskRules';
import { useWideLayout } from '../../hooks/useWideLayout';
import { useChatPaneStore } from '../../store/chatPaneStore';
import { useMessagingStore } from '../../store/messagingStore';
import { useTasksStore } from '../../store/tasksStore';
import { useUiStore } from '../../store/uiStore';
import { useOpenChat } from '../layout/ChatSplit';

export interface OpenTaskChatOptions {
  /**
   * Opened from a task list. On a wide window (the iPhone Duo opened) the Tasks tab has no chat pane,
   * so the task page opens with the chat beside it; elsewhere the chat opens on its own.
   */
  fromList?: boolean;
  /** The chat was just started: the task now has its chatId. */
  onStarted?: (task: Task) => void;
  /** True while the chat is being started. */
  onBusy?: (busy: boolean) => void;
}

/**
 * Opens a task's chat. Shared by the task page's chat card and the chat icon on a task in a list —
 * Afshin, 2026-11-17: the icon goes straight to the task's chat instead of into the task.
 * - a chat: opens it;
 * - none yet, and I gave the task or am doing it (task open): starts it, then opens it;
 * - closed or cancelled, or a manager above reading: the read-only chat;
 * - none, and I can't start one: says why.
 */
export function useOpenTaskChat(options: OpenTaskChatOptions = {}): (task: Task) => Promise<void> {
  const router = useRouter();
  const wide = useWideLayout();
  const openChat = useOpenChat();
  const showToast = useUiStore((s) => s.showToast);
  const opts = useRef(options);
  opts.current = options;
  const starting = useRef(false);

  return useCallback(async (task: Task) => {
    const tap = taskChatTap(task);
    if (tap.do === 'explain') { showToast(tap.text); return; }
    if (tap.do === 'read') { router.push({ pathname: '/task/chat', params: { id: task.id } }); return; }
    let chatId = tap.do === 'open' ? tap.chatId : null;
    if (!chatId) {
      if (starting.current) return;
      starting.current = true;
      opts.current.onBusy?.(true);
      try {
        chatId = (await ensureTaskChat(task.id)).chatId;
        const started = { ...task, chatId };
        useTasksStore.getState().upsert(started);
        opts.current.onStarted?.(started);
      } catch (e) {
        showToast(e instanceof ApiError && e.status === 403 ? 'Only the person who gave the task, or the one doing it, can start its chat'
          : e instanceof ApiError && e.message ? e.message : 'Could not start the chat');
        return;
      } finally {
        starting.current = false;
        opts.current.onBusy?.(false);
      }
    }
    // The chat screen reads the conversation from my chat list; one started a moment ago (or one I
    // was just added to as a watcher) is not in it yet.
    const messaging = useMessagingStore.getState();
    if (!messaging.conversations.some((c) => c.id === chatId)) await messaging.loadConversations().catch(() => undefined);
    if (opts.current.fromList && wide) {
      useChatPaneStore.getState().open(chatId, null);
      router.push({ pathname: '/task/[id]', params: { id: task.id } });
      return;
    }
    openChat(chatId);
  }, [router, wide, openChat, showToast]);
}
