import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown, ChevronRight, Clock, Lock, MessageCircle } from 'lucide-react-native';
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
  activeBizId, access, onOpen,
  businesses = mockBusinesses, branches = mockBranches, serverFiltered = false, groupConversations = [],
}: {
  activeBizId: string; access: AccessControl | null; onOpen: (g: GroupOpen) => void;
  businesses?: Business[]; branches?: Branch[]; serverFiltered?: boolean; groupConversations?: GroupConv[];
}) {
  const f = makeAccessFilters(access);
  const isSuper = f.isSuper;
  const yes = () => true; // permissive filter when the server already scoped the rows
  const bizOK: typeof f.bizOK = serverFiltered ? yes : f.bizOK;
  const brOK: typeof f.brOK = serverFiltered ? yes : f.brOK;
  const branchesForBiz = (bizId: string): Branch[] => branches.filter((br) => (br.companyId ?? 'tk') === bizId);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (k: string, d: boolean) => (k in open ? open[k] : d);
  const toggle = (k: string, d: boolean) => setOpen((o) => ({ ...o, [k]: !(k in o ? o[k] : d) }));

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
  const unreadCount = allItems.filter((g) => (g.unread || 0) > 0).length;

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<MessageCircle size={36} color={colors.coolText3} />} title="No groups yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={34} color={colors.coolText3} />} title="No groups in your access" sub="Ask your admin to grant the groups you need." />;
  }

  const manyBiz = blocks.length > 1;
  const bizDefaultOpen = !manyBiz;

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
      {unreadCount > 0 ? (
        <View style={{ gap: 6 }}>
          <Header dot={colors.primary} title="Unread" count={unreadCount} />
          {blocks.map((bl) => bl.subs.map((s) => {
            const u = s.items.filter((g) => (g.unread || 0) > 0);
            if (u.length === 0) return null;
            return (
              <View key={`u-${bl.id}-${s.code}`} style={{ gap: 6 }}>
                <SubLabel color={s.color} text={`${manyBiz ? bl.label + ' · ' : ''}${s.code} · ${u.length}`} />
                {u.map(GroupCard)}
              </View>
            );
          }))}
        </View>
      ) : null}

      {blocks.map((bl) => {
        const subsR = bl.subs.map((s) => ({ ...s, items: s.items.filter((g) => !g.unread) })).filter((s) => s.items.length > 0);
        if (subsR.length === 0) return null;
        const total = subsR.reduce((n, s) => n + s.items.length, 0);
        const bizKey = `b:${bl.id}`;
        const bizOpen = isOpen(bizKey, bizDefaultOpen);
        return (
          <View key={bl.id} style={{ gap: 6 }}>
            <Pressable onPress={() => toggle(bizKey, bizDefaultOpen)} className="flex-row items-center gap-1.5 px-1 mt-1" style={{ paddingVertical: 4 }}>
              {bizOpen ? <ChevronDown size={17} color={colors.ink} /> : <ChevronRight size={17} color={colors.ink} />}
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: bl.color }} />
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{bl.label}</Text>
              <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {total} groups</Text>
            </Pressable>
            {bizOpen && subsR.map((s) => {
              const brKey = `${bl.id}:${s.code}`;
              const brOpen = isOpen(brKey, true);
              return (
                <View key={brKey} style={{ gap: 6 }}>
                  <Pressable onPress={() => toggle(brKey, true)} className="flex-row items-center gap-1.5 px-1 pl-3 mt-1" style={{ paddingVertical: 4 }}>
                    {brOpen ? <ChevronDown size={15} color={colors.coolText} /> : <ChevronRight size={15} color={colors.coolText} />}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                    <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{s.code} · {s.city}</Text>
                    <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {s.items.length}</Text>
                    {s.time ? (
                      <View className="flex-row items-center gap-1 ml-auto" style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.primarySoft }}>
                        <Clock size={11} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{s.flag} {s.time}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {brOpen && s.items.map(GroupCard)}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function Header({ dot, title, count }: { dot: string; title: string; count: number }) {
  return (
    <View className="flex-row items-center gap-1.5 px-1">
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {count}</Text>
    </View>
  );
}
function SubLabel({ color, text }: { color: string; text: string }) {
  return (
    <View className="flex-row items-center gap-1.5 px-1 pl-3">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>{text}</Text>
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
