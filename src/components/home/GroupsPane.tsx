import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { AnchoredMenu, MenuHeading, anchorOfPress, type AnchorRect } from '../ui/AnchoredMenu';
import { PickChip, PickRow, PickTile, plural } from './PickMenu';
import { useFocusEffect } from 'expo-router';
import { Building2 } from 'lucide-react-native';
import { SkeletonList } from '../ui';
import { GroupsList } from './GroupsList';
import { useChatListPalette, type ChatListPalette } from '../../theme';
import { oneLine } from '../../logic/text';
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

interface BizOption { id: string; code: string; name: string; counts: ScopeCounts }

// The Chats tab's Groups chip — every group the user belongs to, filed by business and branch.
// Above the list, one row of two dropdowns: the business here, the branch in GroupsList (owner,
// 2026-11-17: "just like all business make drop down for branches also", then "phones too"). It
// replaced option 6B of the redesign canvas (2026-10-07) — a business title row over a strip of 66-pt
// branch tiles, about 150 pt of a phone's height — on every screen size.
export function GroupsPane({ onOpenChat, openId = null, onLongPressGroup }: {
  /** The Chats tab's opener: the right pane on a wide window, the chat screen otherwise. */
  onOpenChat: (conversationId: string) => void;
  /** The chat open in the right pane (wide window), marked in the list as the All rows mark it. */
  openId?: string | null;
  onLongPressGroup: (conversationId: string, at?: AnchorRect) => void;
}) {
  const pal = useChatListPalette(); // the Chats tab's theme — this pane lives inside its list
  const access = useAccessStore((s) => s.access());
  const users = useAccessStore((s) => s.users);
  const activeBizId = useUiStore((s) => s.activeBizId);
  const setBiz = useUiStore((s) => s.setBiz);
  // The business picker: a menu that opens from the control that was tapped (see AnchoredMenu).
  const [menuAt, setMenuAt] = useState<AnchorRect | null>(null);

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

  // Each group's business, by the rule GroupsList files it by, for the dropdown's dot and the menu's
  // counts. A group whose branch the directory lacks counts under the one "Other" branch it shows on.
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
  // The business dropdown — its code, or "All businesses" — drawn first in GroupsList's row. New
  // messages in another business show as a dot on it; the menu lists every business with its counts.
  // Only when there is a choice to make: someone in a single business gets the branch dropdown alone.
  const bizCode = activeBizId === 'all' ? 'All businesses' : (pickable.find((b) => b.id === activeBizId)?.code || title);
  const bizChip = pickable.length > 1 ? (showIcon: boolean) => (
    <PickChip pal={pal} Icon={Building2} label={bizCode} dot={scope.unreadElsewhere > 0} showIcon={showIcon}
      a11y={`Business: ${title}. Change business${scope.unreadElsewhere > 0 ? `. ${plural(scope.unreadElsewhere, 'group', 'groups')} with new messages in other businesses` : ''}`}
      onPress={(e) => { void anchorOfPress(e).then(setMenuAt); }} />
  ) : null;

  return (
    <View>
      {!dir.loaded ? <SkeletonList /> : (
        <GroupsList
          activeBizId={activeBizId} access={access} serverFiltered leading={bizChip}
          businesses={dir.businesses}
          branches={dir.branches}
          groupConversations={groupConvs}
          onLongPressGroup={onLongPressGroup} selectedId={openId}
          onOpen={(g) => {
            // A group is an existing conversation — opened by id, through the tab's opener: beside the
            // list on a wide window, like every other row. It used to push the chat screen itself,
            // so on the Duo a group took over the whole window (owner, 2026-11-17).
            if (g.convId) onOpenChat(g.convId);
          }}
        />
      )}

      <BusinessMenu
        anchor={menuAt} pal={pal}
        options={options} activeId={activeBizId}
        onPick={(id) => { setBiz(id); setMenuAt(null); }}
        onClose={() => setMenuAt(null)}
      />
    </View>
  );
}

// Pick whose groups to show — a menu that opens from the business dropdown. Each business
// carries its size and how many of its groups have new messages, so the choice is made knowing where
// the unread are. Was a bottom sheet over a dark scrim (owner, 2026-11-17: "remove that black thing").
function BusinessMenu({ anchor, pal, options, activeId, onPick, onClose }: {
  anchor: AnchorRect | null; pal: ChatListPalette; options: BizOption[]; activeId: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={340} background={pal.bar} border={pal.line} label="Show groups of">
      <MenuHeading color={pal.mute}>Show groups of</MenuHeading>
      <ScrollView style={{ flexGrow: 0 }} bounces={false}>
        {options.map((o, i) => (
          <PickRow key={o.id} pal={pal} index={i} animate={!!anchor} on={o.id === activeId}
            tile={<PickTile pal={pal} code={o.id === 'all' ? undefined : o.code} />}
            title={o.name} sub={`${plural(o.counts.branches, 'branch', 'branches')} · ${plural(o.counts.groups, 'group', 'groups')}`}
            unread={o.counts.unread}
            a11y={`${o.name}, ${plural(o.counts.groups, 'group', 'groups')}${o.counts.unread ? `, ${o.counts.unread} with new messages` : ''}`}
            onPress={() => onPick(o.id)} />
        ))}
        <View style={{ height: 6 }} />
      </ScrollView>
    </AnchoredMenu>
  );
}
