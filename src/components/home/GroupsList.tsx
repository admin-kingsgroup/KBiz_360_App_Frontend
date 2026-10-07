import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpDown, ChevronDown, ChevronUp, LayoutGrid, Lock, MessageCircle, X } from 'lucide-react-native';
import { colors, useChatListPalette, type ChatListPalette } from '../../theme';
import { ChatListItem } from '../chat';
import { businesses as mockBusinesses, branches as mockBranches } from '../../data/businesses';
import { makeAccessFilters } from '../../logic/accessFilters';
import { applyBranchOrder, moveCode } from '../../logic/branchOrder';
import { OTHER_CHIP, splitUnfiledGroups } from '../../logic/groupFiling';
import { mergeBranchChips } from '../../logic/branchChips';
import { ALL_BRANCHES, orderGroups, resolveStripPick, stripBranchPrefix } from '../../logic/groupsStrip';
import { tintForCode } from '../../logic/chatTile';
import { useBranchOrderStore } from '../../store/branchOrderStore';
import { tzTime } from '../../utils/time';
import type { AccessControl, Business, Branch } from '../../types';

// A real group conversation the user belongs to (manual "New group" groups are filed under a branch).
// Everything past `members` is what ChatListItem reads — a group is a chat, so it renders as one.
export interface GroupConv {
  id: string; name: string; branchId?: string | null; companyId?: string | null;
  unread?: number; preview?: string; pinned?: boolean; time?: string; members?: number;
  image?: string | null; muted?: boolean; isImage?: boolean;
  lastStatus?: 'sent' | 'delivered' | 'read' | null;
  /** Last activity, epoch ms — orders the list when several branches are on screen at once. */
  ts?: number;
}
export interface GroupOpen { id: string; name: string; bizId: string; branchId: string; branchCode?: string; convId?: string }
interface GItem extends GroupConv { bizId: string; branchId: string; branchCode?: string; convId?: string }
interface Sub { code: string; city: string; color: string; time: string; flag: string; items: GItem[]; }
interface Block { id: string; label: string; color: string; subs: Sub[]; }

// Groups segment. Data via props (real CRM directory) with a mock fallback. A strip of branch tiles
// (option 6B on the redesign canvas, picked 2026-10-07) that opens on "All", then the groups of the
// picked tile. `serverFiltered` skips client access filters (the backend already scoped the rows).
// View-As-aware otherwise. The business is picked one level up, in GroupsPane.
export function GroupsList({
  activeBizId, access, onOpen, onLongPressGroup,
  businesses = mockBusinesses, branches = mockBranches, serverFiltered = false, groupConversations = [],
}: {
  activeBizId: string; access: AccessControl | null; onOpen: (g: GroupOpen) => void;
  /** Long-press a group row → the mute/pin/archive sheet. */
  onLongPressGroup?: (conversationId: string) => void;
  businesses?: Business[]; branches?: Branch[]; serverFiltered?: boolean; groupConversations?: GroupConv[];
}) {
  const f = makeAccessFilters(access);
  const isSuper = f.isSuper;
  const yes = () => true; // permissive filter when the server already scoped the rows
  const bizOK: typeof f.bizOK = serverFiltered ? yes : f.bizOK;
  const brOK: typeof f.brOK = serverFiltered ? yes : f.brOK;
  const branchesForBiz = (bizId: string): Branch[] => branches.filter((br) => (br.companyId ?? 'tk') === bizId);
  // Picked tile, remembered per business ('all' included) — defaults to the All tile, so every
  // unread group is on screen until someone narrows it. ONE strip for everything on screen.
  const [selBranch, setSelBranch] = useState<Record<string, string>>({});
  const p = useChatListPalette(); // painted with the Chats tab's theme, like the rows below
  // Personal chip arrangement (device-local, per business pill — 'all' has its own) + whether the
  // arrange sheet is open.
  const chipOrder = useBranchOrderStore((s) => s.order);
  const [arranging, setArranging] = useState(false);

  // The Groups list shows the real group chats the user belongs to, grouped by branch — opened
  // directly by conversation id. New groups are created via the "+" New group action.
  const toItem = (c: GroupConv): GItem => ({ ...c, convId: c.id, bizId: '', branchId: c.branchId ?? '', branchCode: undefined });
  // A group whose branch the directory does not return (row deleted or retired in the shared
  // branches collection, or not synced yet) has no chip to live under. It used to vanish without a
  // trace — 21 INB groups did on 2026-09-01. It is filed under an "Other" chip instead.
  const { filed, unfiled } = splitUnfiledGroups(groupConversations, branches.map((br) => br.id));
  const myConvsByBranch = new Map<string, GItem[]>();
  filed.forEach((c) => {
    const arr = myConvsByBranch.get(c.branchId as string) ?? [];
    arr.push(toItem(c));
    myConvsByBranch.set(c.branchId as string, arr);
  });

  const bizBase = (activeBizId === 'all' ? businesses : businesses.filter((b) => b.id === activeBizId)).filter((b) => bizOK(b.id));
  const blocks: Block[] = bizBase.map((b) => {
    const subs = branchesForBiz(b.id).filter((br) => brOK(br.code)).map((br) => {
      const items: GItem[] = (myConvsByBranch.get(br.id) ?? []).map((m) => ({ ...m, bizId: b.id, branchCode: br.code }));
      return { code: br.code, city: br.city, color: br.color, time: tzTime(br.tz), flag: br.flag, items };
    }).filter((s) => s.items.length > 0);
    // Unfiled groups go to their own business; one with no business at all goes to the first shown.
    const orphans = unfiled.filter((c) => (c.companyId ?? bizBase[0].id) === b.id);
    if (orphans.length) {
      const items: GItem[] = orphans.map((c) => ({ ...toItem(c), bizId: b.id }));
      subs.push({ code: OTHER_CHIP, city: 'Branch not in directory', color: colors.coolText3, time: '', flag: '', items });
    }
    return { id: b.id, label: b.name, color: b.color, subs };
  });
  const allItems = blocks.flatMap((bl) => bl.subs.flatMap((s) => s.items));
  // The tiles: every branch that has groups, across every business on screen, in the user's own
  // arrangement (long-press a tile, or the ⇅ button, to change it). With one business picked this is
  // just that business's branches; under "All businesses" it spans them all, so picking BOM leaves
  // only BOM's groups on screen — not BOM for one business and whatever the others defaulted to.
  const chips = applyBranchOrder(mergeBranchChips(blocks), chipOrder[activeBizId]);
  // A single tile filters nothing, so with one branch the strip is not drawn and All is all there is.
  const pick = chips.length > 1 ? resolveStripPick(chips.map((s) => s.code), selBranch[activeBizId]) : ALL_BRANCHES;
  const active = pick === ALL_BRANCHES ? null : chips.find((s) => s.code === pick) ?? null;
  const shown = orderGroups(active ? active.items : allItems);
  const unreadOf = (items: GItem[]): number => items.filter((g) => (g.unread || 0) > 0).length;
  const pickTile = (code: string): void => setSelBranch((m) => ({ ...m, [activeBizId]: code }));
  const arrangeBlock: Block = { id: activeBizId, label: activeBizId === 'all' ? 'All businesses' : (bizBase[0]?.name ?? ''), color: colors.ink, subs: chips };

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<MessageCircle size={36} color={p.mute} />} title="No groups yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={34} color={p.mute} />} title="No groups in your access" sub="Ask your admin to grant the groups you need." />;
  }

  // A group IS a chat, so it renders as the chat row — the very same component the All and Unread
  // lists use, not a card that only looks like one. The tile then carries the group's real BRANCH
  // code (chatTile resolves it from branchCode) and a tint for what the room is for, instead of
  // initials on a colour hashed off the conversation id.
  // The member count has no slot in that row; it lives on the group's own info screen, which is
  // where someone actually goes to ask it.
  // Under a branch tile the name drops the code that tile (and the row's own tile) already shows.
  const GroupRow = (g: GItem) => (
    <ChatListItem
      key={g.id}
      chat={{
        id: g.id,
        name: active ? stripBranchPrefix(g.name, active.code) : g.name,
        initials: '',
        color: colors.primarySoft,
        preview: g.preview || 'No recent messages · tap to start',
        time: g.time ?? '',
        ts: 0,
        unread: g.unread,
        image: g.image ?? null,
        muted: g.muted,
        pinned: g.pinned,
        isImage: g.isImage,
        lastStatus: g.lastStatus,
        branchCode: g.branchCode ?? null,
      }}
      onPress={() => onOpen({ id: g.id, name: g.name, bizId: g.bizId, branchId: g.branchId, branchCode: g.branchCode, convId: g.convId })}
      onLongPress={() => g.convId && onLongPressGroup?.(g.convId)}
    />
  );

  return (
    <View>
      {/* Branch tiles — ONE strip for the whole list, opening on All. A tile is the branch's code on
          the same code-keyed tint as the rows' own tiles, with the city under it; the badge is the
          number of the branch's GROUPS with unread (chats, not messages — the unit every badge in
          the app uses). Only drawn with more than one branch: a single tile filters nothing. */}
      {chips.length > 1 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled
        style={{ flexGrow: 0, backgroundColor: p.bar, borderBottomWidth: 1, borderBottomColor: p.line }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, alignItems: 'flex-start' }}>
        <BranchTile p={p} label="All" selected={!active} unread={unreadOf(allItems)}
          a11y="All branches" onPress={() => pickTile(ALL_BRANCHES)} onLongPress={() => setArranging(true)} />
        <View style={{ width: 1, height: 44, marginTop: 11, marginHorizontal: 3, backgroundColor: p.line }} />
        {chips.map((s) => {
          const label = s.code === OTHER_CHIP ? 'Other' : (s.city || s.code);
          return (
            <BranchTile key={s.code} p={p} code={s.code} label={label} selected={active?.code === s.code} unread={unreadOf(s.items)}
              a11y={s.code === OTHER_CHIP ? 'Other groups' : `${s.code}${s.city ? `, ${s.city}` : ''}`}
              onPress={() => pickTile(s.code)} onLongPress={() => setArranging(true)} />
          );
        })}
        {/* Arrange — reorder the tiles to taste (long-pressing any tile opens the same sheet). */}
        <Pressable onPress={() => setArranging(true)} accessibilityRole="button" accessibilityLabel="Arrange branches"
          style={{ height: 34, width: 34, marginTop: 16, marginLeft: 2, borderRadius: 17, borderWidth: 1, borderColor: p.line, backgroundColor: p.bar, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpDown size={15} color={p.text} />
        </Pressable>
      </ScrollView>
      ) : null}

      {/* The picked branch in one line: its code, city and local time, and how many groups it has. */}
      {active ? (
        <View className="flex-row items-center" style={{ gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 }}>
          <Text style={{ color: p.text, fontSize: 15, fontWeight: '800' }}>{active.code === OTHER_CHIP ? 'Other' : active.code}</Text>
          <Text numberOfLines={1} style={{ flex: 1, color: p.mute, fontSize: 12.5 }}>
            {[active.code === OTHER_CHIP ? '' : active.city, active.time].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: p.mute, fontSize: 12 }}>{active.items.length} group{active.items.length === 1 ? '' : 's'}</Text>
        </View>
      ) : null}

      {/* The groups of the picked tile — the chat row, full-bleed, exactly as All/Unread. Under All
          every branch on screen is one list, newest first, so no unread group sits behind a tile. */}
      {shown.map(GroupRow)}

      <ArrangeBranchesSheet
        block={arranging ? arrangeBlock : null}
        onClose={() => setArranging(false)}
      />
    </View>
  );
}

// Bottom sheet: put the branch chips in YOUR order (per business, this device only). Up/down moves
// a branch one slot; the row list is the live chip order, so changes show through immediately.
function ArrangeBranchesSheet({ block, onClose }: { block: Block | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const setOrder = useBranchOrderStore((s) => s.setOrder);
  const resetOrder = useBranchOrderStore((s) => s.resetOrder);
  if (!block) return null;
  const codes = block.subs.map((s) => s.code); // already in the applied (personal) order
  const move = (code: string, delta: -1 | 1): void => setOrder(block.id, moveCode(codes, code, delta));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-2">
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Arrange branches</Text>
            <Pressable onPress={onClose} hitSlop={9} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, paddingHorizontal: 20, paddingBottom: 10 }}>The branch tiles follow this order. It is yours alone — it doesn't change anyone else's app.</Text>
          <ScrollView style={{ flexGrow: 0, maxHeight: 420 }}>
            {block.subs.map((s, i) => (
              <View key={s.code} className="flex-row items-center" style={{ gap: 10, paddingHorizontal: 20, paddingVertical: 9, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
                <Text style={{ width: 22, color: colors.textMuted2, fontSize: 12.5, fontWeight: '700' }}>{i + 1}</Text>
                <Text style={{ flex: 1, color: colors.ink, fontSize: 14.5, fontWeight: '700' }}>
                  {s.code}
                  {s.city ? <Text style={{ color: colors.textMuted, fontWeight: '500' }}>  ·  {s.flag} {s.city}</Text> : null}
                </Text>
                <Pressable disabled={i === 0} onPress={() => move(s.code, -1)} hitSlop={6}
                  style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: i === 0 ? 0.35 : 1 }}>
                  <ChevronUp size={17} color={colors.ink} />
                </Pressable>
                <Pressable disabled={i === block.subs.length - 1} onPress={() => move(s.code, 1)} hitSlop={6}
                  style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: i === block.subs.length - 1 ? 0.35 : 1 }}>
                  <ChevronDown size={17} color={colors.ink} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={() => resetOrder(block.id)} style={{ alignSelf: 'flex-start', marginLeft: 20, marginTop: 12, paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
            <Text style={{ color: colors.coolText, fontSize: 13, fontWeight: '600' }}>Reset to default order</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// One tile of the branch strip: the code on its code-keyed tint (the same tint the rows' tiles use, so
// a BOM tile and the BOM rooms under it read as one family), the city under it, an unread badge.
// No code = the All tile. The ring is always laid out and only coloured when picked, so picking a
// tile never shifts the strip.
function BranchTile({ p, code, label, selected, unread, a11y, onPress, onLongPress }: {
  p: ChatListPalette; code?: string; label: string; selected: boolean; unread: number; a11y: string;
  onPress: () => void; onLongPress: () => void;
}) {
  const tint = code ? tintForCode(code) : null;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={unread ? `${a11y}, ${unread} with new messages` : a11y}
      style={{ width: 66, alignItems: 'center', gap: 5 }}>
      <View style={{ width: 66, height: 66, borderRadius: 23, borderWidth: 2.5, borderColor: selected ? p.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: tint ? tint.bg : p.field, alignItems: 'center', justifyContent: 'center' }}>
          {tint
            ? <Text numberOfLines={1} style={{ color: tint.fg, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 }}>{code}</Text>
            : <LayoutGrid size={22} color={p.text} />}
        </View>
      </View>
      <Text numberOfLines={1} style={{ maxWidth: 66, color: selected ? p.text : p.mute, fontSize: 11.5, fontWeight: selected ? '800' : '600' }}>{label}</Text>
      {unread > 0 ? (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: 2, borderColor: p.bar, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: p.onAccent, fontSize: 10.5, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  const p = useChatListPalette();
  return (
    <View className="items-center px-6" style={{ paddingVertical: 64 }}>
      <View className="mb-3">{icon}</View>
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: p.mute, fontSize: 13.5, marginTop: 5, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
