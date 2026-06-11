import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Eye } from 'lucide-react-native';
import { KBLogo, Pill, Toast } from '../../src/components/ui';
import { ChatListItem } from '../../src/components/chat';
import { GroupsList, DepartmentsList, SystemAlertsList } from '../../src/components/home';
import { colors } from '../../src/theme';
import { businesses } from '../../src/data/businesses';
import { useAccessStore } from '../../src/store/accessStore';
import { useAuthStore } from '../../src/store/authStore';
import { useUiStore } from '../../src/store/uiStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import type { ChatConversation } from '../../src/api/chat';
import type { PresenceInfo } from '../../src/store/messagingStore';
import { ROLE_DEFS } from '../../src/constants/roles';

// Map a real conversation → the row shape ChatListItem renders.
const relTime = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString()
    ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getDate()}/${d.getMonth() + 1}`;
};
function convToItem(c: ChatConversation, presence: Record<string, PresenceInfo>) {
  const last = c.lastMessage;
  const online = c.type === 'direct' ? (presence[c.otherUserId ?? '']?.status === 'online' || !!c.online) : false;
  return {
    id: c.id,
    name: c.name,
    initials: (c.name[0] ?? '?').toUpperCase(),
    color: c.type === 'group' ? colors.purple : colors.blue,
    preview: last ? (last.type === 'text' ? last.text : `[${last.type}]`) : 'No messages yet',
    time: c.lastActivityAt ? relTime(c.lastActivityAt) : '',
    ts: c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0,
    unread: c.unread,
    online,
  };
}

type Segment = 'chats' | 'groups' | 'depts' | 'pulse';
const SEGMENTS: { k: Segment; l: string }[] = [
  { k: 'chats', l: 'Chats' }, { k: 'groups', l: 'Groups' }, { k: 'depts', l: 'Departments' }, { k: 'pulse', l: 'System Alerts' },
];

// Home — Phase 5: Chats segment only. Other segments are scaffolded (Phase 6).
// Business pills + View-As are access-driven (source-accurate). The DM list is NOT
// access-filtered and not affected by View-As — faithful to source (see Phase 5 report).
export default function Home() {
  const router = useRouter();
  const [seg, setSeg] = useState<Segment>('chats');
  const access = useAccessStore((s) => s.access());
  const viewAsUser = useAccessStore((s) => s.viewAsUser);
  const realUser = useAuthStore((s) => s.user);
  const activeBizId = useUiStore((s) => s.activeBizId);
  const setBiz = useUiStore((s) => s.setBiz);
  const toast = useUiStore((s) => s.toast);
  const showToast = useUiStore((s) => s.showToast);

  const isSuper = !!access?.isSuper;
  const totalUnread = businesses.reduce((s, b) => s + (b.unread || 0), 0);
  const pills = [
    ...(isSuper ? [{ id: 'all', code: 'ALL', name: 'All businesses', color: colors.ink, unread: totalUnread }] : []),
    ...(isSuper ? businesses : businesses.filter((b) => (access?.bizIds || []).includes(b.id))),
  ];

  // Real conversations from the messaging store (loaded on socket connect; refreshed on focus).
  const conversations = useMessagingStore((s) => s.conversations);
  const presence = useMessagingStore((s) => s.presence);
  useEffect(() => { void useMessagingStore.getState().loadConversations(); }, []);
  const chats = conversations.map((c) => convToItem(c, presence));
  void realUser;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      {/* Brand bar */}
      <View className="flex-row items-center justify-between px-4 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <View className="flex-row items-center gap-2">
          <KBLogo size={22} />
          <View>
            <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 14, fontWeight: '600', letterSpacing: -0.3 }}>KBiz 360</Text>
            <Text style={{ fontFamily: 'Fraunces', color: colors.warmMute, fontSize: 10.5, marginTop: 1 }}>Smart Connect</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.push('/chat/search')} style={icon(colors.card)}><Search size={16} color={colors.warmMute} /></Pressable>
          {isSuper || viewAsUser ? (
            <Pressable onPress={() => router.push('/view-as')} style={icon(viewAsUser ? colors.purple : colors.card)}>
              <Eye size={15} color={viewAsUser ? '#fff' : colors.warmMute} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* View-As banner */}
      {viewAsUser ? (
        <View className="flex-row items-center gap-2 px-4 py-1.5" style={{ backgroundColor: colors.purple + '14', borderBottomColor: colors.purple + '33', borderBottomWidth: 1 }}>
          <Eye size={13} color={colors.purple} />
          <Text numberOfLines={1} style={{ color: colors.purple, fontSize: 11, fontWeight: '700', flex: 1 }}>
            Viewing as {viewAsUser.name} · {ROLE_DEFS[viewAsUser.role]?.label}
          </Text>
          <Pressable onPress={() => { useAccessStore.getState().setViewAs(null); setBiz('all'); showToast('Back to your view'); }} style={{ backgroundColor: colors.purple, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Exit</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Business pills (access-filtered, View-As-aware) */}
      <View className="px-4 pt-3 pb-1.5">
        <View className="flex-row flex-wrap gap-1.5">
          {pills.map((p) => (
            <Pill key={p.id} label={p.code} color={p.color} active={activeBizId === p.id} unread={p.unread || 0} onPress={() => setBiz(p.id)} />
          ))}
        </View>
      </View>

      {/* Segment tabs */}
      <View className="flex-row gap-4 px-4 pt-1" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        {SEGMENTS.map((s) => {
          const on = s.k === seg;
          return (
            <Pressable key={s.k} onPress={() => setSeg(s.k)} className="pb-1.5">
              <Text style={{ fontFamily: 'Fraunces', fontSize: 14, color: on ? colors.ink : colors.warmMute, fontWeight: on ? '700' : '400' }}>{s.l}</Text>
              {on ? <View style={{ height: 2, backgroundColor: colors.ink, borderRadius: 2, marginTop: 4 }} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      {seg === 'chats' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}>
          {chats.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 56 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>No conversations yet</Text>
              <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4, textAlign: 'center' }}>Open Profile → Team &amp; Users and tap someone to start chatting.</Text>
            </View>
          ) : null}
          {chats.map((c) => <ChatListItem key={c.id} chat={c} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })} />)}
        </ScrollView>
      ) : seg === 'groups' ? (
        <ScrollView>
          <GroupsList activeBizId={activeBizId} access={access} onOpen={(openName) => router.push({ pathname: '/chat/[id]', params: { id: openName } })} />
        </ScrollView>
      ) : seg === 'depts' ? (
        <ScrollView>
          <DepartmentsList activeBizId={activeBizId} access={access} onOpenDept={(d) => router.push({ pathname: '/department/[id]', params: { id: d._key, biz: d.bizId, name: d.name } })} />
        </ScrollView>
      ) : (
        <ScrollView>
          <SystemAlertsList activeBizId={activeBizId} access={access} onOpenChannel={(ch) => router.push({ pathname: '/alert/[id]', params: { id: ch.id } })} />
        </ScrollView>
      )}

      <Toast message={toast} onHide={() => showToast(null)} />
    </SafeAreaView>
  );
}

const icon = (bg: string) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: bg, borderWidth: 1, borderColor: colors.cardEdge });
