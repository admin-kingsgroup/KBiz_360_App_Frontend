import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Eye, FileText } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getTask, getTaskMessages, setTaskWatchers, type Task } from '../../src/api/tasks';
import { isFinished, TASK_MESSAGES_PAGE } from '../../src/logic/taskRules';
import type { ChatMessage } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';
import { ApiError } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useTasksStore } from '../../src/store/tasksStore';
import { useUiStore } from '../../src/store/uiStore';
import { useOpenChat } from '../../src/components/layout/ChatSplit';
import { useWideLayout } from '../../src/hooks/useWideLayout';

// A task's chat, read-only, straight from the task (GET /api/tasks/:id/messages). Two cases:
// - the task is closed or cancelled (owner, 2026-11-17): the chat is off everyone's list and refuses
//   messages — everything in it can still be read here, by anyone who can see the task;
// - a manager above the assignee (decision 2) on an open task: they read it, and watching the task
//   adds them to the chat, where they can write.
// There is never a composer here.

const stamp = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export default function TaskChatReadOnly() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useAuthStore((s) => s.user?.id) ?? '';
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const [task, setTask] = useState<Task | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const openPane = useOpenChat();
  const wide = useWideLayout();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      // The server takes at most 100 a page (GET /tasks/:id/messages); asking for 200 was refused
      // outright, and this screen said "Could not load the chat" (seen 2026-11-17).
      const [d, msgs] = await Promise.all([getTask(id), getTaskMessages(id, { limit: TASK_MESSAGES_PAGE })]);
      setTask(d.task);
      setMessages([...msgs].sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? 'This chat is not available to you.' : 'Could not load the chat.');
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const nameOf = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.name]));
    return (uid: string): string => (uid === meId ? 'You' : map.get(uid) ?? 'Member');
  }, [users, meId]);

  const join = async (): Promise<void> => {
    if (!task) return;
    setJoining(true);
    try {
      const t = await setTaskWatchers(task.id, { add: [meId] });
      useTasksStore.getState().upsert(t);
      await useMessagingStore.getState().loadConversations().catch(() => undefined);
      // Phone width: the real chat replaces this read-only one. Wide: back to the task, with the
      // chat beside it.
      if (t.chatId) { openPane(t.chatId, { replace: true }); if (wide) router.back(); }
      else router.back();
      showToast('You are watching this task and are in its chat');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not join the chat');
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 54, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{task?.title ?? 'Task chat'}</Text>
          <Text style={{ color: colors.coolText, fontSize: 11.5 }}>{task && isFinished(task.status) ? `Read-only · task ${task.status === 'cancelled' ? 'cancelled' : 'closed'}` : 'Read-only'}</Text>
        </View>
      </View>
      {!messages ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={{ color: colors.coolText, textAlign: 'center', padding: 24 }}>No messages yet.</Text>}
          renderItem={({ item: m }) => m.type === 'system' ? (
            <View style={{ alignSelf: 'center', backgroundColor: colors.coolMuted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginVertical: 5, maxWidth: '90%' }}>
              <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center' }}>{m.text}</Text>
            </View>
          ) : (
            <View style={{ alignSelf: 'flex-start', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, paddingHorizontal: 11, paddingVertical: 7, marginVertical: 4, maxWidth: '86%' }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{nameOf(m.senderId)}</Text>
              {m.deletedForEveryone ? <Text style={{ color: colors.coolText3, fontStyle: 'italic' }}>This message was deleted</Text> : m.text ? <Text selectable style={{ color: colors.ink, fontSize: 14.5, marginTop: 1 }}>{m.text}</Text> : null}
              {m.attachments?.map((a, i) => (
                <Pressable key={`${a.url}-${i}`} onPress={() => void Linking.openURL(mediaUrl(a.url))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <FileText size={14} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{a.name}</Text>
                </Pressable>
              ))}
              <Text style={{ color: colors.coolText3, fontSize: 10.5, marginTop: 3, alignSelf: 'flex-end' }}>{stamp(m.sentAt ?? m.createdAt)}</Text>
            </View>
          )}
        />
      )}
      {task && isFinished(task.status) ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.coolDivider, backgroundColor: colors.card, alignItems: 'center' }}>
          <Text style={{ color: colors.coolText, fontSize: 13.5, textAlign: 'center' }}>This task is {task.status === 'cancelled' ? 'cancelled' : 'closed'} — the chat is read-only</Text>
        </View>
      ) : task && task.myRole === 'viewer' ? (
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.coolDivider, backgroundColor: colors.card }}>
          <Pressable onPress={() => void join()} disabled={joining} style={{ height: 46, borderRadius: 999, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: joining ? 0.7 : 1 }}>
            {joining ? <ActivityIndicator color="#fff" /> : <Eye size={17} color="#fff" />}
            <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>Watch the task to write here</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
