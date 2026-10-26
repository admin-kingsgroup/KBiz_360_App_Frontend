import { useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LayoutGrid } from 'lucide-react-native';
import { SkeletonList } from '../ui';
import { GroupsList } from './GroupsList';
import { BrandMark } from '../ui/BrandMark';
import { useChatListPalette, type ChatListPalette } from '../../theme';
import { oneLine } from '../../logic/text';
import { tintForCode } from '../../logic/chatTile';
import { OTHER_CHIP } from '../../logic/groupFiling';
import { brandLogoFor, groupBizId, resolveCompanyPick, scopeCounts, withSender, type BrandLogo } from '../../logic/groupsStrip';
import { relTime } from '../../utils/time';
import { mediaUrl } from '../../api/media';

// Media types whose preview gets the small image glyph — the same set the Chats tab uses.
const PICTORIAL = new Set(['image', 'video']);
import { useDirectoryStore } from '../../store/directoryStore';
import { useAccessStore } from '../../store/accessStore';
import { useUiStore } from '../../store/uiStore';
import { useMessagingStore } from '../../store/messagingStore';

interface CompanyTileData { id: string; code: string; name: string; logo: BrandLogo | null; unread: number }

// The Chats tab's Groups chip — every group the user belongs to, filed by company and branch.
// Company-first (owner, 2026-10-10): every company is a logo tile along the top; tap one and its
// groups show under GroupsList's branch sections, which fold open and shut. This replaced option 6B
// (a business title opening a sheet, over a strip of branch tiles) — the companies were one tap
// away and the branches were one more, with no way to see a company's branches at a glance.
export function GroupsPane({ onLongPressGroup }: { onLongPressGroup: (conversationId: string) => void }) {
  const router = useRouter();
  const pal = useChatListPalette(); // the Chats tab's theme — this pane lives inside its list
  const access = useAccessStore((s) => s.access());
  const users = useAccessStore((s) => s.users);
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
  // The companies this person can pick between — the same rule the old pills used: "All" is a
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

  // Each group's company, by the rule GroupsList files it by, for the tiles' unread badges. A group
  // whose branch the directory lacks counts under the one "Other" section it shows in.
  const branchBiz = useMemo(() => new Map(dir.branches.map((br) => [br.id, br.companyId ?? 'tk'])), [dir.branches]);
  const fallbackBiz = bizSource[0]?.id ?? 'tk';
  const placed = groupConvs.map((g) => ({
    bizId: groupBizId(g, branchBiz, fallbackBiz),
    branchId: g.branchId && branchBiz.has(g.branchId) ? g.branchId : OTHER_CHIP,
    unread: g.unread,
  }));
  // The tiles only when there is a choice to make: someone in a single company gets its branch
  // sections alone, under whatever pick they had (so their saved branch order still applies).
  const tiles: CompanyTileData[] = pickable.length > 1 ? pickable.map((b) => ({
    id: b.id, code: b.code, name: b.name,
    logo: b.id === 'all' ? null : brandLogoFor(b, dir.branches.filter((br) => (br.companyId ?? 'tk') === b.id).map((br) => br.code)),
    unread: scopeCounts(placed, b.id).unread,
  })) : [];
  const bizId = resolveCompanyPick(tiles.map((t) => t.id), activeBizId);
  const title = tiles.length ? (bizId === 'all' ? 'All companies' : tiles.find((t) => t.id === bizId)?.name ?? null) : null;

  return (
    <View>
      {/* Every company, by its logo — tap one to see its groups. The badge is how many of that
          company's groups have new messages, so a pick never hides where the unread are. */}
      {tiles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled
          style={{ flexGrow: 0, backgroundColor: pal.bar, borderBottomWidth: 1, borderBottomColor: pal.line }}
          contentContainerStyle={{ gap: 4, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, alignItems: 'flex-start' }}>
          {tiles.map((t) => (
            <CompanyTile key={t.id} pal={pal} tile={t} selected={t.id === bizId} onPress={() => setBiz(t.id)} />
          ))}
        </ScrollView>
      ) : null}

      {!dir.loaded ? <SkeletonList /> : (
        <GroupsList
          activeBizId={bizId} title={title} access={access} serverFiltered
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

// One company tile: its logo on a white chip (the logos are drawn for a white page), else its code on
// the code-keyed tint; the name under it; an unread badge. The All tile is the grid glyph. The ring is
// always laid out and only coloured when picked, so picking a tile never shifts the row.
function CompanyTile({ pal, tile, selected, onPress }: {
  pal: ChatListPalette; tile: CompanyTileData; selected: boolean; onPress: () => void;
}) {
  const all = tile.id === 'all';
  const tint = all || tile.logo ? null : tintForCode(tile.code);
  const name = all ? 'All' : tile.name;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={`${all ? 'All companies' : tile.name}${tile.unread ? `, ${tile.unread} with new messages` : ''}`}
      style={{ width: 80, alignItems: 'center', gap: 5 }}>
      <View style={{ width: 70, height: 70, borderRadius: 24, borderWidth: 2.5, borderColor: selected ? pal.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {tile.logo ? <BrandMark logo={tile.logo} size={58} radius={19} border={pal.line} /> : (
          <View style={{ width: 58, height: 58, borderRadius: 19, backgroundColor: tint ? tint.bg : pal.field, alignItems: 'center', justifyContent: 'center' }}>
            {tint
              ? <Text numberOfLines={1} style={{ color: tint.fg, fontSize: 13, fontWeight: '800' }}>{tile.code.slice(0, 4)}</Text>
              : <LayoutGrid size={23} color={pal.text} />}
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ maxWidth: 80, color: selected ? pal.text : pal.mute, fontSize: 11.5, fontWeight: selected ? '800' : '600' }}>{name}</Text>
      {tile.unread > 0 ? (
        <View style={{ position: 'absolute', top: -2, right: 2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: 2, borderColor: pal.bar, backgroundColor: pal.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: pal.onAccent, fontSize: 10.5, fontWeight: '700' }}>{tile.unread > 99 ? '99+' : tile.unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
