import { useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SkeletonList } from '../ui';
import { GroupsList } from './GroupsList';
import { colors } from '../../theme';
import { oneLine } from '../../logic/text';
import { relTime } from '../../utils/time';
import { mediaUrl } from '../../api/media';

// Media types whose preview gets the small image glyph — the same set the Chats tab uses.
const PICTORIAL = new Set(['image', 'video']);
import { useDirectoryStore } from '../../store/directoryStore';
import { useAccessStore } from '../../store/accessStore';
import { useUiStore } from '../../store/uiStore';
import { useMessagingStore } from '../../store/messagingStore';

// The Chats tab's Groups chip — business pills + every group the user belongs to, filed by branch.
// This was the Groups bottom tab until Groups merged into Chats and Alerts took that tab slot; the
// business pills and branch filing moved here unchanged.
export function GroupsPane({ onLongPressGroup }: { onLongPressGroup: (conversationId: string) => void }) {
  const router = useRouter();
  const access = useAccessStore((s) => s.access());
  const activeBizId = useUiStore((s) => s.activeBizId);
  const setBiz = useUiStore((s) => s.setBiz);

  // Real CRM org directory (companies/branches), access-scoped by the backend. We show the
  // real org ONLY — no mock fallback — so dummy pills/tabs never flash before the real data loads.
  const dir = useDirectoryStore();
  // Refetch on focus (not just mount), so businesses/branches created elsewhere show up without an
  // app restart.
  useFocusEffect(useCallback(() => { void useDirectoryStore.getState().load(); }, []));
  const usingReal = dir.businesses.length > 0;
  const bizSource = dir.businesses;

  const isSuper = !!access?.isSuper;
  const totalUnread = bizSource.reduce((s, b) => s + (b.unread || 0), 0);
  const pills = [
    ...(isSuper ? [{ id: 'all', code: 'ALL', name: 'All businesses', color: colors.ink, unread: totalUnread }] : []),
    // Real data is already access-scoped server-side; the mock path keeps the client-side bizIds filter.
    ...(usingReal || isSuper ? bizSource : bizSource.filter((b) => (access?.bizIds || []).includes(b.id))),
  ];

  // Real group conversations the user belongs to — they surface under their branch. The Chats tab
  // already refetches conversations on focus, so unread/previews stay current here too.
  // Groups render the SAME row component as the All/Unread lists, so every field that row reads is
  // mapped here exactly as the Chats tab maps it — a group must not read differently in two places.
  const conversations = useMessagingStore((s) => s.conversations);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const groupConvs = conversations.filter((c) => c.type === 'group' && !c.archived).map((c) => {
    const last = c.lastMessage;
    return {
      id: c.id, name: c.name, branchId: c.branchId ?? null, companyId: c.companyId ?? null, unread: c.unread,
      preview: last ? (last.type === 'text' ? oneLine(last.text) : `[${last.type}]`) : undefined,
      pinned: !!c.pinned, // pinned groups float to the top of their branch's list
      // Stamped with the SAME helper as the chat rows, so a conversation reads identically in both views.
      time: c.lastActivityAt ? relTime(c.lastActivityAt) : '',
      members: c.memberCount,
      image: c.image ? mediaUrl(c.image) : null,
      muted: !!c.muted,
      isImage: !!last && PICTORIAL.has(last.type),
      // List ticks — only for MY last message, as on the Chats tab.
      lastStatus: last && myUserId && last.senderId === myUserId ? last.status ?? null : null,
    };
  });

  return (
    <View>
      {/* Business pills that filter the groups (access-filtered, View-As-aware). Hidden when there
          is only one pill, since a filter with a single option cannot do anything and the business
          name already reads on the row below. */}
      {pills.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 8 }}>
          {pills.map((p) => {
            const on = activeBizId === p.id;
            return (
              <Pressable key={p.id} onPress={() => setBiz(p.id)} style={[chip, { backgroundColor: on ? colors.ink : colors.card, borderWidth: 1, borderColor: on ? colors.ink : colors.coolDivider }]}>
                <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{p.id === 'all' ? 'All' : p.code}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!dir.loaded ? <SkeletonList /> : (
        <GroupsList
          activeBizId={activeBizId} access={access} serverFiltered
          businesses={dir.businesses}
          branches={dir.branches}
          groupConversations={groupConvs}
          onLongPressGroup={onLongPressGroup}
          onOpen={(g) => {
            // A group is an existing conversation — open it directly by id.
            if (g.convId) router.push({ pathname: '/chat/[id]', params: { id: g.convId } });
          }}
        />
      )}
    </View>
  );
}

// 34px filter chip (mockup dimensions).
const chip = { height: 34, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const };
