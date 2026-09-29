import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpDown, ChevronDown, ChevronUp, Lock, MessageCircle, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { ChatListItem } from '../chat';
import { businesses as mockBusinesses, branches as mockBranches } from '../../data/businesses';
import { makeAccessFilters } from '../../logic/accessFilters';
import { applyBranchOrder, moveCode } from '../../logic/branchOrder';
import { OTHER_CHIP, splitUnfiledGroups } from '../../logic/groupFiling';
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
}
export interface GroupOpen { id: string; name: string; bizId: string; branchId: string; branchCode?: string; convId?: string }
interface GItem extends GroupConv { bizId: string; branchId: string; branchCode?: string; convId?: string }
interface Sub { code: string; city: string; color: string; time: string; flag: string; items: GItem[]; }
interface Block { id: string; label: string; color: string; subs: Sub[]; }

// Groups segment. Data via props (real CRM directory) with a mock fallback. business→branch→group
// nesting, Unread pinned on top, collapsible. `serverFiltered` skips client access filters (the
// backend already scoped the rows). View-As-aware otherwise.
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
  // Selected branch chip per business (defaults to the first branch that has groups).
  const [selBranch, setSelBranch] = useState<Record<string, string>>({});
  // Personal chip arrangement (device-local, per business) + the business whose arrange sheet is open.
  const chipOrder = useBranchOrderStore((s) => s.order);
  const [arrangeFor, setArrangeFor] = useState<string | null>(null);

  // The Groups list shows the real group chats the user belongs to, grouped by branch — opened
  // directly by conversation id. New groups are created via the "+" New group action.
  const toItem = (c: GroupConv): GItem => ({ ...c, convId: c.id, bizId: '', branchId: c.branchId ?? '', branchCode: undefined });
  // Pinned groups float to the top of their chip (stable sort keeps the rest in recency order).
  const pinnedFirst = (items: GItem[]): GItem[] => items.sort((a, z) => Number(!!z.pinned) - Number(!!a.pinned));
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
      const items = pinnedFirst((myConvsByBranch.get(br.id) ?? []).map((m) => ({ ...m, bizId: b.id, branchCode: br.code })));
      return { code: br.code, city: br.city, color: br.color, time: tzTime(br.tz), flag: br.flag, items };
    }).filter((s) => s.items.length > 0);
    // The user's own chip arrangement (long-press a chip, or the ⇅ button, to change it).
    const ordered = applyBranchOrder(subs, chipOrder[b.id]);
    // Unfiled groups go to their own business; one with no business at all goes to the first shown.
    const orphans = unfiled.filter((c) => (c.companyId ?? bizBase[0].id) === b.id);
    if (orphans.length) {
      const items = pinnedFirst(orphans.map((c) => ({ ...toItem(c), bizId: b.id })));
      ordered.push({ code: OTHER_CHIP, city: 'Branch not in directory', color: colors.coolText3, time: '', flag: '', items });
    }
    return { id: b.id, label: b.name, color: b.color, subs: ordered };
  });
  const allItems = blocks.flatMap((bl) => bl.subs.flatMap((s) => s.items));

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<MessageCircle size={36} color={colors.coolText3} />} title="No groups yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={34} color={colors.coolText3} />} title="No groups in your access" sub="Ask your admin to grant the groups you need." />;
  }

  // A group IS a chat, so it renders as the chat row — the very same component the All and Unread
  // lists use, not a card that only looks like one. The tile then carries the group's real BRANCH
  // code (chatTile resolves it from branchCode) and a tint for what the room is for, instead of
  // initials on a colour hashed off the conversation id.
  // The member count has no slot in that row; it lives on the group's own info screen, which is
  // where someone actually goes to ask it.
  const GroupRow = (g: GItem, i: number) => (
    <ChatListItem
      key={g.id}
      topDivider={i > 0}
      chat={{
        id: g.id,
        name: g.name,
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
      {blocks.map((bl) => {
        const subs = bl.subs; // every branch that has groups (read + unread)
        if (subs.length === 0) return null;
        // Which branch chip is picked — default to the first branch with groups.
        const sel = selBranch[bl.id] ?? subs[0].code;
        const active = subs.find((s) => s.code === sel) ?? subs[0];
        return (
          <View key={bl.id}>
            {/* Branch chips — the badge is the number of the branch's GROUPS with unread (chats,
                not messages — same unit as the segment tab and bottom-bar badges). Rendered only
                when there is more than one branch: a single chip filters nothing, and its code is
                already on the section header below and in the group names themselves.
                Outlined-vs-filled, matching the All/Unread/Groups chips directly above them. */}
            {subs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
              {subs.map((s) => {
                const on = s.code === active.code;
                const unread = s.items.reduce((n, g) => n + ((g.unread || 0) > 0 ? 1 : 0), 0);
                return (
                  <Pressable key={s.code} onPress={() => setSelBranch((m) => ({ ...m, [bl.id]: s.code }))} onLongPress={() => setArrangeFor(bl.id)} className="flex-row items-center"
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, gap: 6, borderWidth: 1, backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.borderStrong }}>
                    <Text style={{ color: on ? '#fff' : colors.textBody, fontSize: 13, fontWeight: on ? '700' : '600' }}>{s.code}</Text>
                    {unread > 0 ? (
                      <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : colors.primary }}>
                        <Text style={{ color: on ? colors.primary : '#fff', fontSize: 11, fontWeight: '700' }}>{unread}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
              {/* Arrange — reorder the chips to taste (long-pressing any chip opens the same sheet). */}
              <Pressable onPress={() => setArrangeFor(bl.id)} accessibilityRole="button" accessibilityLabel="Arrange branches"
                style={{ height: 34, width: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <ArrowUpDown size={15} color={colors.textBody} />
              </Pressable>
            </ScrollView>
            ) : null}

            {/* One band where there used to be two: which branch is being shown, how many groups are
                in it, and its local time. Same shape as the Approvals queue's requester header. */}
            <View className="flex-row items-center" style={{ gap: 8, paddingHorizontal: 20, paddingVertical: 9, backgroundColor: colors.surfaceSubtle, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.coolDivider }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>
                {bl.label}
                {active.code ? <Text style={{ fontWeight: '500', color: colors.coolText }}> · {active.code}</Text> : null}
              </Text>
              <View className="flex-1" />
              <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>
                {active.items.length} group{active.items.length === 1 ? '' : 's'}
                {active.time ? ` · ${active.flag} ${active.time}` : ''}
              </Text>
            </View>

            {/* Groups of the selected branch — the chat row, full-bleed, exactly as All/Unread. */}
            {active.items.map(GroupRow)}
          </View>
        );
      })}

      <ArrangeBranchesSheet
        block={blocks.find((bl) => bl.id === arrangeFor) ?? null}
        onClose={() => setArrangeFor(null)}
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
          <Text style={{ color: colors.textMuted, fontSize: 12.5, paddingHorizontal: 20, paddingBottom: 10 }}>The first branch opens by default. This order is yours alone — it doesn't change anyone else's app.</Text>
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

function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <View className="items-center px-6" style={{ paddingVertical: 64 }}>
      <View className="mb-3">{icon}</View>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
