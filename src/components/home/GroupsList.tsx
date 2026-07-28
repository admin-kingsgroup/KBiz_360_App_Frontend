import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Clock, Lock, MessageCircle } from 'lucide-react-native';
import { colors } from '../../theme';
import { businesses as mockBusinesses, branches as mockBranches } from '../../data/businesses';
import { makeAccessFilters } from '../../logic/accessFilters';
import { colorForId } from '../../logic/directory';
import { tzTime } from '../../utils/time';
import type { AccessControl, Business, Branch } from '../../types';

// A real group conversation the user belongs to (manual "New group" groups are filed under a branch).
export interface GroupConv { id: string; name: string; branchId?: string | null; deptKey?: string | null; unread?: number; preview?: string }
export interface GroupOpen { id: string; name: string; bizId: string; branchId: string; branchCode?: string; convId?: string }
interface GItem { id: string; name: string; icon: string; color: string; preview?: string; unread?: number; bizId: string; branchId: string; branchCode?: string; convId?: string; }

const initialsOf = (name: string): string => ((name.match(/\b\w/g) ?? []).slice(0, 2).join('') || name.slice(0, 2)).toUpperCase();
interface Sub { code: string; city: string; color: string; time: string; flag: string; items: GItem[]; }
interface Block { id: string; label: string; color: string; subs: Sub[]; }

// Groups segment. Data via props (real CRM directory) with a mock fallback. business→branch→group
// nesting, Unread pinned on top, collapsible. `serverFiltered` skips client access filters (the
// backend already scoped the rows). View-As-aware otherwise.
export function GroupsList({
  activeBizId, access, onOpen, onChipRowTouch,
  businesses = mockBusinesses, branches = mockBranches, serverFiltered = false, groupConversations = [],
}: {
  activeBizId: string; access: AccessControl | null; onOpen: (g: GroupOpen) => void;
  // Fires true while a finger is on the branch-chip row, false on release. The Home pager uses it
  // to pause its own horizontal paging so the nested chip row can actually scroll (Android: the
  // outer horizontal ScrollView otherwise intercepts the drag).
  onChipRowTouch?: (touching: boolean) => void;
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

  // The Groups tab lists the real group chats the user belongs to (created under a branch's
  // department), grouped by branch — opened directly by conversation id. Browsing/creating groups by
  // department lives in the Departments tab; new groups are created via the "+" New group action.
  const myConvsByBranch = new Map<string, GItem[]>();
  groupConversations.filter((c) => c.branchId).forEach((c) => {
    const arr = myConvsByBranch.get(c.branchId as string) ?? [];
    arr.push({ id: c.id, convId: c.id, name: c.name, icon: initialsOf(c.name), color: colorForId(c.id), preview: c.preview, unread: c.unread, bizId: '', branchId: c.branchId as string, branchCode: undefined });
    myConvsByBranch.set(c.branchId as string, arr);
  });

  const bizBase = (activeBizId === 'all' ? businesses : businesses.filter((b) => b.id === activeBizId)).filter((b) => bizOK(b.id));
  const blocks: Block[] = bizBase.map((b) => {
    const subs = branchesForBiz(b.id).filter((br) => brOK(br.code)).map((br) => {
      const items = (myConvsByBranch.get(br.id) ?? []).map((m) => ({ ...m, bizId: b.id, branchCode: br.code }));
      return { code: br.code, city: br.city, color: br.color, time: tzTime(br.tz), flag: br.flag, items };
    }).filter((s) => s.items.length > 0);
    return { id: b.id, label: b.name, color: b.color, subs };
  });
  const allItems = blocks.flatMap((bl) => bl.subs.flatMap((s) => s.items));

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<MessageCircle size={36} color={colors.coolText3} />} title="No groups yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={34} color={colors.coolText3} />} title="No groups in your access" sub="Ask your admin to grant the groups you need." />;
  }

  const GroupCard = (g: GItem) => (
    <Pressable key={g.id} onPress={() => onOpen({ id: g.id, name: g.name, bizId: g.bizId, branchId: g.branchId, branchCode: g.branchCode, convId: g.convId })} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3"
      style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: g.color, opacity: g.preview ? 1 : 0.55, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{g.icon}</Text>
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{g.name}</Text>
        <View className="flex-row justify-between items-center gap-2" style={{ marginTop: 2 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: g.preview ? colors.coolText : colors.coolText3, fontSize: 13, fontStyle: g.preview ? 'normal' : 'italic' }}>{g.preview || 'No recent messages · tap to start'}</Text>
          {g.unread ? <Unread n={g.unread} /> : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View className="px-4 pt-3 pb-6" style={{ gap: 8 }}>
      {blocks.map((bl) => {
        const subs = bl.subs; // every branch that has groups (read + unread)
        if (subs.length === 0) return null;
        const total = subs.reduce((n, s) => n + s.items.length, 0);
        // Which branch chip is picked — default to the first branch with groups.
        const sel = selBranch[bl.id] ?? subs[0].code;
        const active = subs.find((s) => s.code === sel) ?? subs[0];
        return (
          <View key={bl.id} style={{ gap: 8 }}>
            {/* Business header */}
            <View className="flex-row items-center gap-1.5 px-1 mt-1">
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: bl.color }} />
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{bl.label}</Text>
              <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {total} groups</Text>
            </View>

            {/* Branch chips — the badge is the branch's UNREAD count (hidden when there are none). */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingVertical: 2 }}
              onTouchStart={() => onChipRowTouch?.(true)}
              onTouchEnd={() => onChipRowTouch?.(false)}
              onTouchCancel={() => onChipRowTouch?.(false)}>
              {subs.map((s) => {
                const on = s.code === active.code;
                const unread = s.items.reduce((n, g) => n + (g.unread || 0), 0);
                return (
                  <Pressable key={s.code} onPress={() => setSelBranch((m) => ({ ...m, [bl.id]: s.code }))} className="flex-row items-center"
                    style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, gap: 7, backgroundColor: on ? colors.primary : colors.coolMuted }}>
                    <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13, fontWeight: '600' }}>{s.code}</Text>
                    {unread > 0 ? (
                      <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : colors.primary }}>
                        <Text style={{ color: on ? colors.primary : '#fff', fontSize: 10.5, fontWeight: '700' }}>{unread}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Selected branch's local time */}
            {active.time ? (
              <View className="flex-row items-center gap-1.5 px-1">
                <Clock size={12} color={colors.primary} />
                <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>{active.flag} {active.time} · {active.city}</Text>
              </View>
            ) : null}

            {/* Groups of the selected branch (unread ones keep their own per-card badge) */}
            <View style={{ gap: 8 }}>
              {active.items.map(GroupCard)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Unread({ n }: { n: number }) {
  return <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{n}</Text></View>;
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
