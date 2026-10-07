import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronDown, LayoutGrid } from 'lucide-react-native';
import { SkeletonList } from '../ui';
import { GroupsList } from './GroupsList';
import { useChatListPalette, type ChatListPalette } from '../../theme';
import { oneLine } from '../../logic/text';
import { tintForCode } from '../../logic/chatTile';
import { OTHER_CHIP } from '../../logic/groupFiling';
import { groupBizId, scopeCounts, withSender, type ScopeCounts } from '../../logic/groupsStrip';
import { relTime } from '../../utils/time';
import { mediaUrl } from '../../api/media';

// Media types whose preview gets the small image glyph — the same set the Chats tab uses.
const PICTORIAL = new Set(['image', 'video']);
import { useDirectoryStore } from '../../store/directoryStore';
import { useAccessStore } from '../../store/accessStore';
import { useUiStore } from '../../store/uiStore';
import { useMessagingStore } from '../../store/messagingStore';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

interface BizOption { id: string; code: string; name: string; counts: ScopeCounts }

// The Chats tab's Groups chip — every group the user belongs to, filed by business and branch.
// Layout = option 6B of the redesign canvas (picked 2026-10-07): the business is a title you tap to
// switch (a sheet lists them with their counts), and the branches are a strip of tiles in GroupsList.
// The title replaced a row of business pills that looked exactly like the All/Unread/Groups chips
// above it and the branch chips below it — three rows of the same pill, three levels of filter.
export function GroupsPane({ onLongPressGroup }: { onLongPressGroup: (conversationId: string) => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // read out here: native insets do not reach inside a Modal
  const pal = useChatListPalette(); // the Chats tab's theme — this pane lives inside its list
  const access = useAccessStore((s) => s.access());
  const users = useAccessStore((s) => s.users);
  const activeBizId = useUiStore((s) => s.activeBizId);
  const setBiz = useUiStore((s) => s.setBiz);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Real CRM org directory (companies/branches), access-scoped by the backend. We show the
  // real org ONLY — no mock fallback — so dummy pills/tabs never flash before the real data loads.
  const dir = useDirectoryStore();
  // Refetch on focus (not just mount), so businesses/branches created elsewhere show up without an
  // app restart.
  useFocusEffect(useCallback(() => { void useDirectoryStore.getState().load(); }, []));
  const usingReal = dir.businesses.length > 0;
  const bizSource = dir.businesses;

  const isSuper = !!access?.isSuper;
  // The businesses this person can pick between — the same rule the old pills used: "All" is a
  // Super-Admin choice; real data is already access-scoped server-side; the mock path keeps the
  // client-side bizIds filter.
  const pickable = [
    ...(isSuper ? [{ id: 'all', code: 'ALL', name: 'All businesses' }] : []),
    ...(usingReal || isSuper ? bizSource : bizSource.filter((b) => (access?.bizIds || []).includes(b.id))),
  ];

  // Real group conversations the user belongs to — they surface under their branch. The Chats tab
  // already refetches conversations on focus, so unread/previews stay current here too.
  // Groups render the SAME row component as the All/Unread lists, so every field that row reads is
  // mapped here exactly as the Chats tab maps it — a group must not read differently in two places.
  const conversations = useMessagingStore((s) => s.conversations);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const groupConvs = conversations.filter((c) => c.type === 'group' && !c.archived).map((c) => {
    const last = c.lastMessage;
    const text = last ? (last.type === 'text' ? oneLine(last.text) : `[${last.type}]`) : undefined;
    // Who wrote it leads the preview, as on the Chats list — not on my own message (the ticks say
    // that) nor on a system line ("X added Y" already names its people).
    const sender = last && last.senderId !== myUserId && last.type !== 'system' ? nameOf.get(last.senderId) : null;
    return {
      id: c.id, name: c.name, branchId: c.branchId ?? null, companyId: c.companyId ?? null, unread: c.unread,
      preview: text === undefined ? undefined : withSender(text, sender),
      pinned: !!c.pinned, // pinned groups float to the top of the list
      // Stamped with the SAME helper as the chat rows, so a conversation reads identically in both views.
      time: c.lastActivityAt ? relTime(c.lastActivityAt) : '',
      ts: c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0,
      members: c.memberCount,
      image: c.image ? mediaUrl(c.image) : null,
      muted: !!c.muted,
      isImage: !!last && PICTORIAL.has(last.type),
      // List ticks — only for MY last message, as on the Chats tab.
      lastStatus: last && myUserId && last.senderId === myUserId ? last.status ?? null : null,
    };
  });

  // Each group's business, by the rule GroupsList files it by, for the title row and the sheet's
  // counts. A group whose branch the directory lacks counts under the one "Other" tile it shows on.
  const branchBiz = useMemo(() => new Map(dir.branches.map((br) => [br.id, br.companyId ?? 'tk'])), [dir.branches]);
  const fallbackBiz = bizSource[0]?.id ?? 'tk';
  const placed = groupConvs.map((g) => ({
    bizId: groupBizId(g, branchBiz, fallbackBiz),
    branchId: g.branchId && branchBiz.has(g.branchId) ? g.branchId : OTHER_CHIP,
    unread: g.unread,
  }));
  const scope = scopeCounts(placed, activeBizId);
  const options: BizOption[] = pickable.map((b) => ({ id: b.id, code: b.code, name: b.name, counts: scopeCounts(placed, b.id) }));
  const title = pickable.find((b) => b.id === activeBizId)?.name ?? 'All businesses';

  return (
    <View>
      {/* Which business's groups are on screen — tap to switch. Only when there is a choice to make:
          someone in a single business gets the branch tiles alone. On the right, either the scope's
          size or, when a business is picked and another one has new messages, how many — so
          narrowing to one business never hides unread groups. */}
      {pickable.length > 1 ? (
        <View className="flex-row items-center" style={{ gap: 8, paddingLeft: 8, paddingRight: 16, paddingTop: 4, backgroundColor: pal.bar }}>
          <Pressable onPress={() => setSheetOpen(true)} accessibilityRole="button" accessibilityLabel={`Business: ${title}. Change business`}
            className="flex-row items-center" style={{ height: 44, flexShrink: 1, paddingLeft: 12, paddingRight: 8, gap: 4, borderRadius: 10 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: pal.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 }}>{title}</Text>
            <ChevronDown size={18} color={pal.accent} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {scope.unreadElsewhere > 0 ? (
            <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={`${plural(scope.unreadElsewhere, 'group', 'groups')} with new messages in other businesses`}
              style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: pal.field, justifyContent: 'center' }}>
              <Text style={{ color: pal.accent, fontSize: 12, fontWeight: '800' }}>{scope.unreadElsewhere} new elsewhere</Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={{ color: pal.mute, fontSize: 12 }}>
              {plural(scope.branches, 'branch', 'branches')} · {plural(scope.groups, 'group', 'groups')}
            </Text>
          )}
        </View>
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

      <BusinessSheet
        open={sheetOpen} pal={pal} bottomInset={insets.bottom}
        options={options} activeId={activeBizId}
        onPick={(id) => { setBiz(id); setSheetOpen(false); }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// Bottom sheet: pick whose groups to show. Each business carries its size and how many of its groups
// have new messages, so the choice is made knowing where the unread are.
function BusinessSheet({ open, pal, bottomInset, options, activeId, onPick, onClose }: {
  open: boolean; pal: ChatListPalette; bottomInset: number; options: BizOption[]; activeId: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: pal.bar, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: Math.max(24, bottomInset + 12) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: pal.line }} /></View>
          <Text style={{ color: pal.text, fontSize: 17, fontWeight: '800', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>Show groups of</Text>
          <ScrollView style={{ flexGrow: 0, maxHeight: 460 }}>
            {options.map((o) => {
              const on = o.id === activeId;
              const tint = o.id === 'all' ? null : tintForCode(o.code);
              return (
                <Pressable key={o.id} onPress={() => onPick(o.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  accessibilityLabel={`${o.name}, ${plural(o.counts.groups, 'group', 'groups')}${o.counts.unread ? `, ${o.counts.unread} with new messages` : ''}`}
                  className="flex-row items-center" style={{ gap: 12, minHeight: 64, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: on ? pal.field : 'transparent' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint ? tint.bg : pal.field, alignItems: 'center', justifyContent: 'center' }}>
                    {tint
                      ? <Text numberOfLines={1} style={{ color: tint.fg, fontSize: 11.5, fontWeight: '800' }}>{o.code.slice(0, 4)}</Text>
                      : <LayoutGrid size={19} color={pal.text} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: pal.text, fontSize: 15, fontWeight: '700' }}>{o.name}</Text>
                    <Text numberOfLines={1} style={{ color: pal.mute, fontSize: 12.5, marginTop: 1 }}>
                      {plural(o.counts.branches, 'branch', 'branches')} · {plural(o.counts.groups, 'group', 'groups')}
                    </Text>
                  </View>
                  {o.counts.unread > 0 ? (
                    <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: pal.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: pal.onAccent, fontSize: 11, fontWeight: '700' }}>{o.counts.unread}</Text>
                    </View>
                  ) : null}
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? pal.accent : pal.line, alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pal.accent }} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
