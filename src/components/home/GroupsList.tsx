import { textStyles } from '../../theme/typography';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, type GestureResponderEvent } from 'react-native';
import { ArrowUpDown, ChevronDown, ChevronUp, FolderOpen, Lock, MapPin, MessageCircle, X } from 'lucide-react-native';
import { colors, useChatListPalette, type ChatListPalette } from '../../theme';
import { ChatListItem } from '../chat';
import { businesses as mockBusinesses, branches as mockBranches } from '../../data/businesses';
import { makeAccessFilters } from '../../logic/accessFilters';
import { applyBranchOrder, moveCode } from '../../logic/branchOrder';
import { OTHER_CHIP, splitUnfiledGroups } from '../../logic/groupFiling';
import { mergeBranchChips } from '../../logic/branchChips';
import { ALL_BRANCHES, orderGroups, resolveStripPick, stripBranchPrefix, unreadOutsidePick } from '../../logic/groupsStrip';
import { AnchoredMenu, MenuHeading, MenuItem, anchorOfPress, type AnchorRect } from '../ui/AnchoredMenu';
import { PickChip, PickRow, PickTile, plural } from './PickMenu';
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

// Under this row width the business and branch dropdowns drop their icons. Each chip spends 56 pt on
// padding, icon and chevron; "All businesses" and "All branches" need ~180 pt between them. At the
// narrowest list (320 pt, the two-pane minimum) the icons are what cut the labels to "All busines…".
const ROOMY_ROW = 360;

// Groups segment. Data via props (real CRM directory) with a mock fallback. A branch dropdown that
// opens on "All branches", then the groups of the picked branch. `serverFiltered` skips client access
// filters (the backend already scoped the rows). View-As-aware otherwise. The business is picked one
// level up, in GroupsPane, with a dropdown drawn first in the same row (`leading`).
export function GroupsList({
  activeBizId, access, onOpen, onLongPressGroup, selectedId = null,
  businesses = mockBusinesses, branches = mockBranches, serverFiltered = false, groupConversations = [],
  leading = null,
}: {
  activeBizId: string; access: AccessControl | null; onOpen: (g: GroupOpen) => void;
  /** Drawn first in the dropdown row — GroupsPane's business dropdown, told whether to show its icon. */
  leading?: ((showIcon: boolean) => ReactNode) | null;
  /** The chat open in the right pane (wide window) — its row is marked, as on the All list. */
  selectedId?: string | null;
  /** Long-press a group row → the mute/pin/archive sheet. */
  onLongPressGroup?: (conversationId: string, at?: AnchorRect) => void;
  businesses?: Business[]; branches?: Branch[]; serverFiltered?: boolean; groupConversations?: GroupConv[];
}) {
  const f = makeAccessFilters(access);
  const isSuper = f.isSuper;
  const yes = () => true; // permissive filter when the server already scoped the rows
  const bizOK: typeof f.bizOK = serverFiltered ? yes : f.bizOK;
  const brOK: typeof f.brOK = serverFiltered ? yes : f.brOK;
  const branchesForBiz = (bizId: string): Branch[] => branches.filter((br) => (br.companyId ?? 'tk') === bizId);
  // Picked branch, remembered per business ('all' included) — defaults to All branches, so every
  // unread group is on screen until someone narrows it. ONE pick for everything on screen.
  const [selBranch, setSelBranch] = useState<Record<string, string>>({});
  const p = useChatListPalette(); // painted with the Chats tab's theme, like the rows below
  // Personal chip arrangement (device-local, per business pill — 'all' has its own) + whether the
  // arrange sheet is open.
  const chipOrder = useBranchOrderStore((s) => s.order);
  // The arrange card, open at the control that opened it (the arrange button or a long-pressed chip).
  const [arranging, setArranging] = useState<AnchorRect | null>(null);
  const openArrange = (e: GestureResponderEvent): void => { void anchorOfPress(e).then(setArranging); };
  // The dropdown row's width: under ROOMY_ROW the two dropdowns drop their icons (see below).
  const [rowW, setRowW] = useState(0);
  const roomy = rowW === 0 || rowW >= ROOMY_ROW;
  // The branch dropdown's menu, open at the dropdown.
  const [branchMenuAt, setBranchMenuAt] = useState<AnchorRect | null>(null);
  // "Arrange branches" from that menu: the arrange card opens where the menu was, once the menu has
  // faded out (one AnchoredMenu at a time — each is its own Modal).
  const arrangeFromMenu = (): void => {
    const at = branchMenuAt;
    setBranchMenuAt(null);
    setTimeout(() => setArranging(at), 250);
  };

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
  // The branches: every branch that has groups, across every business on screen, in the user's own
  // arrangement ("Arrange branches" in the branch menu, or hold the dropdown, to change it). With one business picked this is
  // just that business's branches; under "All businesses" it spans them all, so picking BOM leaves
  // only BOM's groups on screen — not BOM for one business and whatever the others defaulted to.
  const chips = applyBranchOrder(mergeBranchChips(blocks), chipOrder[activeBizId]);
  // A single branch filters nothing, so with one branch there is no dropdown and All is all there is.
  const pick = chips.length > 1 ? resolveStripPick(chips.map((s) => s.code), selBranch[activeBizId]) : ALL_BRANCHES;
  const active = pick === ALL_BRANCHES ? null : chips.find((s) => s.code === pick) ?? null;
  const shown = orderGroups(active ? active.items : allItems);
  const unreadOf = (items: GItem[]): number => items.filter((g) => (g.unread || 0) > 0).length;
  const pickTile = (code: string): void => setSelBranch((m) => ({ ...m, [activeBizId]: code }));
  const elsewhere = unreadOutsidePick(chips.map((s) => ({ code: s.code, unread: unreadOf(s.items) })), pick);
  const pickLabel = !active ? 'All branches' : active.code === OTHER_CHIP ? 'Other' : active.code;
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
  // Under a picked branch the name drops the code the dropdown (and the row's own tile) already shows.
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
      selected={!!selectedId && g.convId === selectedId}
      onPress={() => onOpen({ id: g.id, name: g.name, bizId: g.bizId, branchId: g.branchId, branchCode: g.branchCode, convId: g.convId })}
      onLongPress={(e) => { const id = g.convId; if (id && onLongPressGroup) void anchorOfPress(e, { atFinger: true }).then((at) => onLongPressGroup(id, at)); }}
    />
  );

  return (
    <View>
      {/* The business and the branch: two dropdowns in ONE row, on every screen size (owner,
          2026-11-17: "just like all business make drop down for branches also", then "phones
          too"). They replaced a business title row over a strip of 66-pt branch tiles on phones
          (~150 pt) and a scrolling row of branch chips on short windows. The branch menu lists each
          branch's unread groups; the dropdown dots itself when a branch not on screen has some. */}
      {chips.length > 1 || leading ? (
        <View onLayout={(e) => setRowW(Math.round(e.nativeEvent.layout.width))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
            backgroundColor: p.bar, borderBottomWidth: 1, borderBottomColor: p.line }}>
          {leading?.(roomy)}
          {chips.length > 1 ? (
            <PickChip pal={p} Icon={MapPin} label={pickLabel} dot={elsewhere > 0} showIcon={roomy}
              a11y={`Branch: ${pickLabel}. Change branch${elsewhere > 0 ? `. ${plural(elsewhere, 'group', 'groups')} with new messages in other branches` : ''}`}
              onPress={(e) => { void anchorOfPress(e).then(setBranchMenuAt); }} onLongPress={openArrange} />
          ) : null}
        </View>
      ) : null}

      {/* The picked branch in one line: its code, city and local time, and how many groups it has. */}
      {active ? (
        <View className="flex-row items-center" style={{ gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
          <Text style={{ color: p.text, ...textStyles.headline }}>{active.code === OTHER_CHIP ? 'Other' : active.code}</Text>
          <Text numberOfLines={1} style={{ flex: 1, color: p.mute, ...textStyles.footnote }}>
            {[active.code === OTHER_CHIP ? '' : active.city, active.time].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: p.mute, ...textStyles.footnote }}>{active.items.length} group{active.items.length === 1 ? '' : 's'}</Text>
        </View>
      ) : null}

      {/* The groups of the picked branch — the chat row, full-bleed, exactly as All/Unread. Under All
          every branch on screen is one list, newest first, so no unread group sits behind a pick. */}
      {shown.map(GroupRow)}

      <BranchMenu
        anchor={branchMenuAt} p={p} chips={chips} allItems={allItems} pick={pick}
        onPick={(code) => { pickTile(code); setBranchMenuAt(null); }}
        onArrange={arrangeFromMenu}
        onClose={() => setBranchMenuAt(null)}
      />

      <ArrangeBranchesSheet
        block={arranging ? arrangeBlock : null} anchor={arranging}
        onClose={() => setArranging(null)}
      />
    </View>
  );
}

// Pick which branch's groups to show — the branch dropdown's menu, built from the same
// parts as the business one (PickMenu). Each branch shows its city, its code, how many groups it has
// and how many of them have new messages. The last row opens the arrange card.
function BranchMenu({ anchor, p, chips, allItems, pick, onPick, onArrange, onClose }: {
  anchor: AnchorRect | null; p: ChatListPalette; chips: Sub[]; allItems: GItem[]; pick: string;
  onPick: (code: string) => void; onArrange: () => void; onClose: () => void;
}) {
  const unreadOf = (items: GItem[]): number => items.filter((g) => (g.unread || 0) > 0).length;
  const allUnread = unreadOf(allItems);
  const menuColors = { text: p.text, mute: p.mute, danger: colors.danger, pressed: p.line, divider: p.line };
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={340} background={p.bar} border={p.line} label="Show groups from">
      <MenuHeading color={p.mute}>Show groups from</MenuHeading>
      <ScrollView style={{ flexGrow: 0 }} bounces={false}>
        <PickRow pal={p} index={0} animate={!!anchor} on={pick === ALL_BRANCHES}
          tile={<PickTile pal={p} />} title="All branches"
          sub={`${plural(chips.length, 'branch', 'branches')} · ${plural(allItems.length, 'group', 'groups')}`}
          unread={allUnread}
          a11y={`All branches, ${plural(allItems.length, 'group', 'groups')}${allUnread ? `, ${allUnread} with new messages` : ''}`}
          onPress={() => onPick(ALL_BRANCHES)} />
        {chips.map((s, i) => {
          const other = s.code === OTHER_CHIP;
          const unread = unreadOf(s.items);
          const title = other ? 'Other' : (s.city || s.code);
          // No local time here: beside a group count it reads as the last message's time. The line
          // under the dropdowns gives it once a branch is picked.
          const sub = `${other ? s.city : s.code} · ${plural(s.items.length, 'group', 'groups')}`;
          return (
            <PickRow key={s.code} pal={p} index={i + 1} animate={!!anchor} on={pick === s.code}
              tile={other ? <PickTile pal={p} Icon={FolderOpen} /> : <PickTile pal={p} code={s.code} />}
              title={title} sub={sub} unread={unread}
              a11y={`${other ? 'Other groups' : `${s.code}, ${s.city}`}, ${plural(s.items.length, 'group', 'groups')}${unread ? `, ${unread} with new messages` : ''}`}
              onPress={() => onPick(s.code)} />
          );
        })}
      </ScrollView>
      <MenuItem index={chips.length + 1} label="Arrange branches" Icon={ArrowUpDown} onPress={onArrange} colors={menuColors} />
    </AnchoredMenu>
  );
}

// Put the branch chips in YOUR order (per business, this device only): a card that opens from the
// arrange button or the long-pressed chip (AnchoredMenu) — it was a bottom sheet over a dark scrim
// (owner, 2026-11-17). Up/down moves a branch one slot; the list is the live chip order, so changes
// show through immediately.
function ArrangeBranchesSheet({ block: open, anchor, onClose }: { block: Block | null; anchor: AnchorRect | null; onClose: () => void }) {
  const setOrder = useBranchOrderStore((s) => s.setOrder);
  const resetOrder = useBranchOrderStore((s) => s.resetOrder);
  // The last block shown stays drawn while the card fades out after it is closed.
  const last = useRef<Block | null>(null);
  if (open) last.current = open;
  const block = last.current;
  if (!block) return null;
  const codes = block.subs.map((s) => s.code); // already in the applied (personal) order
  const move = (code: string, delta: -1 | 1): void => setOrder(block.id, moveCode(codes, code, delta));
  return (
    <AnchoredMenu anchor={open ? anchor : null} onClose={onClose} width={360} background={colors.paper} border={colors.cardEdge} label="Arrange branches">
      <View className="flex-row items-center justify-between" style={{ paddingLeft: 16, paddingRight: 10, paddingTop: 12, paddingBottom: 4 }}>
        <Text style={{ color: colors.ink, ...textStyles.headline }}>Arrange branches</Text>
        <Pressable onPress={onClose} hitSlop={9} accessibilityRole="button" accessibilityLabel="Close"
          style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
          <X size={14} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={{ color: colors.textMuted, ...textStyles.footnote, paddingHorizontal: 16, paddingBottom: 8 }}>Your branches are listed in this order. It is yours alone — it doesn't change anyone else's app.</Text>
      <ScrollView style={{ flexGrow: 0 }} bounces={false}>
        {block.subs.map((s, i) => (
          <View key={s.code} className="flex-row items-center" style={{ gap: 10, paddingHorizontal: 16, paddingVertical: 7, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
            <Text style={{ width: 20, color: colors.textMuted2, ...textStyles.footnote, fontWeight: '600' }}>{i + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, ...textStyles.headline }}>
              {s.code}
              {s.city ? <Text style={{ color: colors.textMuted, fontWeight: '500' }}>  ·  {s.flag} {s.city}</Text> : null}
            </Text>
            <Pressable disabled={i === 0} onPress={() => move(s.code, -1)} hitSlop={5} accessibilityRole="button" accessibilityLabel={`Move ${s.code} up`}
              style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: i === 0 ? 0.35 : 1 }}>
              <ChevronUp size={17} color={colors.ink} />
            </Pressable>
            <Pressable disabled={i === block.subs.length - 1} onPress={() => move(s.code, 1)} hitSlop={5} accessibilityRole="button" accessibilityLabel={`Move ${s.code} down`}
              style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: i === block.subs.length - 1 ? 0.35 : 1 }}>
              <ChevronDown size={17} color={colors.ink} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Pressable onPress={() => resetOrder(block.id)} accessibilityRole="button"
        style={{ alignSelf: 'flex-start', marginLeft: 16, marginTop: 8, marginBottom: 14, paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
        <Text style={{ color: colors.coolText, ...textStyles.subheadline, fontWeight: '600' }}>Reset to default order</Text>
      </Pressable>
    </AnchoredMenu>
  );
}

function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  const p = useChatListPalette();
  return (
    <View className="items-center px-6" style={{ paddingVertical: 64 }}>
      <View className="mb-3">{icon}</View>
      <Text style={{ color: p.text, ...textStyles.headline }}>{title}</Text>
      <Text style={{ color: p.mute, ...textStyles.subheadline, marginTop: 5, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
