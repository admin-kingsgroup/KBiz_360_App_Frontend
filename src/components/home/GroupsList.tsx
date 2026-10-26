import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpDown, ChevronDown, ChevronUp, Lock, MessageCircle, X } from 'lucide-react-native';
import { colors, useChatListPalette, type ChatListPalette } from '../../theme';
import { ChatListItem } from '../chat';
import { BrandMark } from '../ui/BrandMark';
import { businesses as mockBusinesses, branches as mockBranches } from '../../data/businesses';
import { makeAccessFilters } from '../../logic/accessFilters';
import { applyBranchOrder, moveCode } from '../../logic/branchOrder';
import { OTHER_CHIP, splitUnfiledGroups } from '../../logic/groupFiling';
import { mergeBranchChips } from '../../logic/branchChips';
import { branchLogoFor, foldKey, isSectionOpen, orderGroups, setAllSections, stripBranchPrefix } from '../../logic/groupsStrip';
import { tintForCode } from '../../logic/chatTile';
import { useBranchOrderStore } from '../../store/branchOrderStore';
import { useGroupFoldStore } from '../../store/groupFoldStore';
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

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// Groups segment. Data via props (real CRM directory) with a mock fallback. The picked company's
// groups under one section per branch, each folding open and shut (owner, 2026-10-10); sections start
// folded so a company reads as its list of branches, each with its unread count. `serverFiltered`
// skips client access filters (the backend already scoped the rows). View-As-aware otherwise. The
// company is picked one level up, in GroupsPane's logo tiles.
export function GroupsList({
  activeBizId, title = null, access, onOpen, onLongPressGroup,
  businesses = mockBusinesses, branches = mockBranches, serverFiltered = false, groupConversations = [],
}: {
  activeBizId: string;
  /** The picked company's name over the sections; null when there is no company to name. */
  title?: string | null;
  access: AccessControl | null; onOpen: (g: GroupOpen) => void;
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
  const p = useChatListPalette(); // painted with the Chats tab's theme, like the rows below
  // Personal section arrangement (device-local, per company tile — 'all' has its own) + whether the
  // arrange sheet is open, and which sections this person has opened (device-local too).
  const chipOrder = useBranchOrderStore((s) => s.order);
  const [arranging, setArranging] = useState(false);
  const folds = useGroupFoldStore((s) => s.open);
  const setFold = useGroupFoldStore((s) => s.setOpen);
  const replaceFolds = useGroupFoldStore((s) => s.replace);

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
  // The sections: every branch that has groups, across every company on screen, in the user's own
  // arrangement (long-press a section, or the ⇅ button, to change it). With one company picked this
  // is just that company's branches; under All it spans them all, one section per branch code.
  const chips = applyBranchOrder(mergeBranchChips(blocks), chipOrder[activeBizId]);
  const isOpen = (code: string): boolean => isSectionOpen(folds, activeBizId, code, chips.length);
  const allOpen = chips.length > 0 && chips.every((s) => isOpen(s.code));
  const toggle = (code: string): void => setFold(foldKey(activeBizId, code), !isOpen(code));
  const toggleAll = (): void => replaceFolds(setAllSections(folds, activeBizId, chips.map((s) => s.code), !allOpen));
  const unreadOf = (items: GItem[]): number => items.filter((g) => (g.unread || 0) > 0).length;
  const arrangeBlock: Block = { id: activeBizId, label: title ?? (bizBase[0]?.name ?? ''), color: colors.ink, subs: chips };

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<MessageCircle size={36} color={p.mute} />} title={title && activeBizId !== 'all' ? `No groups in ${title} yet` : 'No groups yet'} sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={34} color={p.mute} />} title="No groups in your access" sub="Ask your admin to grant the groups you need." />;
  }

  // A group IS a chat, so it renders as the chat row — the very same component the All and Unread
  // lists use, not a card that only looks like one. The tile then carries the group's real BRANCH
  // code (chatTile resolves it from branchCode) and a tint for what the room is for, instead of
  // initials on a colour hashed off the conversation id.
  // The member count has no slot in that row; it lives on the group's own info screen, which is
  // where someone actually goes to ask it.
  // Under a branch section the name drops the code its header (and the row's own tile) already shows.
  const GroupRow = (code: string) => (g: GItem) => (
    <ChatListItem
      key={g.id}
      chat={{
        id: g.id,
        name: stripBranchPrefix(g.name, code),
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
      {/* The picked company and its size, with fold-everything and arrange on the right. */}
      <View className="flex-row items-center" style={{ gap: 8, paddingLeft: 20, paddingRight: 12, paddingTop: 12, paddingBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {title ? <Text numberOfLines={1} style={{ color: p.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 }}>{title}</Text> : null}
          <Text numberOfLines={1} style={{ color: p.mute, fontSize: 12.5, marginTop: title ? 1 : 0 }}>
            {plural(chips.length, 'branch', 'branches')} · {plural(allItems.length, 'group', 'groups')}
          </Text>
        </View>
        {chips.length > 1 ? (
          <>
            <Pressable onPress={toggleAll} accessibilityRole="button" hitSlop={6}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.bar, justifyContent: 'center' }}>
              <Text style={{ color: p.text, fontSize: 12.5, fontWeight: '700' }}>{allOpen ? 'Collapse all' : 'Expand all'}</Text>
            </Pressable>
            {/* Arrange — reorder the sections to taste (long-pressing any section opens the same sheet). */}
            <Pressable onPress={() => setArranging(true)} accessibilityRole="button" accessibilityLabel="Arrange branches" hitSlop={6}
              style={{ height: 32, width: 32, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.bar, alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpDown size={15} color={p.text} />
            </Pressable>
          </>
        ) : null}
      </View>

      {/* One section per branch: a header with the branch's tile, city, local time, group count and
          how many of its groups have unread — tap it to open or fold its groups. Open, the groups are
          the chat row, full-bleed, exactly as All/Unread, pinned first and newest after. */}
      {chips.map((s) => {
        const open = isOpen(s.code);
        return (
          <View key={s.code}>
            <BranchHeader p={p} code={s.code} city={s.city} time={s.time} count={s.items.length} unread={unreadOf(s.items)}
              open={open} onPress={() => toggle(s.code)} onLongPress={() => setArranging(true)} />
            {open ? orderGroups(s.items).map(GroupRow(s.code)) : null}
          </View>
        );
      })}

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

// A branch section's header: the code on its code-keyed tint (the same tint the rows' tiles use, so a
// BOM header and the BOM rooms under it read as one family) — KGD wears the KBiz logo — then the code,
// city, local time and group count, the unread badge, and the fold chevron.
function BranchHeader({ p, code, city, time, count, unread, open, onPress, onLongPress }: {
  p: ChatListPalette; code: string; city: string; time: string; count: number; unread: number; open: boolean;
  onPress: () => void; onLongPress: () => void;
}) {
  const other = code === OTHER_CHIP;
  const logo = branchLogoFor(code);
  const tint = tintForCode(code);
  const label = other ? 'Other' : code;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} android_ripple={{ color: p.line }}
      accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}${city ? `, ${city}` : ''}, ${plural(count, 'group', 'groups')}${unread ? `, ${unread} with new messages` : ''}`}
      className="flex-row items-center" style={{ gap: 12, minHeight: 62, paddingLeft: 16, paddingRight: 14, paddingVertical: 8, backgroundColor: p.bar, borderTopWidth: 1, borderTopColor: p.line }}>
      {logo ? <BrandMark logo={logo} size={42} radius={13} border={p.line} /> : (
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ color: tint.fg, fontSize: other ? 10.5 : 11.5, fontWeight: '800', letterSpacing: 0.2 }}>{other ? 'OTHER' : code}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: p.text, fontSize: 15, fontWeight: '800' }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: p.mute, fontSize: 12.5, marginTop: 1 }}>
          {[city, time, plural(count, 'group', 'groups')].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {unread > 0 ? (
        <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: p.onAccent, fontSize: 11, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
      {open ? <ChevronUp size={20} color={p.mute} /> : <ChevronDown size={20} color={p.mute} />}
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
