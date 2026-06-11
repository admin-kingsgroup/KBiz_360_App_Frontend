import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown, ChevronRight, Clock, Lock, MessageCircle } from 'lucide-react-native';
import { colors, shadow } from '../../theme';
import { businesses, branches } from '../../data/businesses';
import { makeAccessFilters } from '../../logic/accessFilters';
import { tzTime } from '../../utils/time';
import type { AccessControl } from '../../types';

interface GItem { id: string; name: string; icon: string; color: string; preview?: string; unread?: number; openName: string; }
interface Sub { code: string; city: string; color: string; time: string; flag: string; items: GItem[]; }
interface Block { id: string; label: string; color: string; subs: Sub[]; }

// Groups segment — faithful port of source GroupsList: access-filtered (biz/branch/group),
// business→branch→group nesting, Unread pinned on top, collapsible. View-As-aware via `access`.
export function GroupsList({ activeBizId, access, onOpen }: { activeBizId: string; access: AccessControl | null; onOpen: (openName: string) => void }) {
  const { isSuper, bizOK, brOK, grpOK } = makeAccessFilters(access);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (k: string, d: boolean) => (k in open ? open[k] : d);
  const toggle = (k: string, d: boolean) => setOpen((o) => ({ ...o, [k]: !(k in o ? o[k] : d) }));

  const bizBase = (activeBizId === 'all' ? businesses : businesses.filter((b) => b.id === activeBizId)).filter((b) => bizOK(b.id));
  const blocks: Block[] = bizBase.map((b) => {
    if (b.id === 'tk') {
      const subs = branches.filter((br) => brOK(br.code)).map((br) => ({
        code: br.code, city: br.city, color: br.color, time: tzTime(br.tz), flag: br.flag,
        items: br.groups.filter((g) => grpOK(br.code, g.name)).map((g) => ({ id: g.id, name: g.name, icon: g.icon, color: g.color, preview: g.preview, unread: g.unread, openName: `TK ${br.code} ${g.name}` })),
      })).filter((s) => s.items.length > 0);
      return { id: b.id, label: b.name, color: b.color, subs };
    }
    return { id: b.id, label: b.name, color: b.color, subs: [] };
  });
  const allItems = blocks.flatMap((bl) => bl.subs.flatMap((s) => s.items));
  const unreadCount = allItems.filter((g) => (g.unread || 0) > 0).length;

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<MessageCircle size={32} color={colors.textMuted2} />} title="No groups yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={30} color={colors.textMuted2} />} title="No groups in your access" sub="Ask your admin to grant the groups you need." />;
  }

  const manyBiz = blocks.length > 1;
  const bizDefaultOpen = !manyBiz;

  const GroupCard = (g: GItem) => (
    <Pressable key={g.openName} onPress={() => onOpen(g.openName)} className="flex-row items-center gap-2.5 p-2.5"
      style={[{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16 }, shadow]}>
      <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: g.color, opacity: g.preview ? 1 : 0.55, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{g.icon}</Text>
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{g.name}</Text>
        <View className="flex-row justify-between items-center gap-2 mt-0.5">
          <Text numberOfLines={1} style={{ flex: 1, color: g.preview ? colors.warmMute : '#bdb3a0', fontSize: 11, fontStyle: g.preview ? 'normal' : 'italic' }}>{g.preview || 'No recent messages · tap to start'}</Text>
          {g.unread ? <Unread n={g.unread} /> : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View className="px-4 pt-3 pb-6" style={{ gap: 8 }}>
      {unreadCount > 0 ? (
        <View style={{ gap: 6 }}>
          <Header dot={colors.coral} title="Unread" count={unreadCount} />
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
            <Pressable onPress={() => toggle(bizKey, bizDefaultOpen)} className="flex-row items-center gap-1.5 px-1 mt-1">
              {bizOpen ? <ChevronDown size={15} color={colors.ink} /> : <ChevronRight size={15} color={colors.ink} />}
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: bl.color }} />
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{bl.label}</Text>
              <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {total} groups</Text>
            </Pressable>
            {bizOpen && subsR.map((s) => {
              const brKey = `${bl.id}:${s.code}`;
              const brOpen = isOpen(brKey, true);
              return (
                <View key={brKey} style={{ gap: 6 }}>
                  <Pressable onPress={() => toggle(brKey, true)} className="flex-row items-center gap-1.5 px-1 pl-3 mt-1">
                    {brOpen ? <ChevronDown size={13} color={colors.warmMute} /> : <ChevronRight size={13} color={colors.warmMute} />}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                    <Text style={{ color: colors.ink, fontSize: 11.5, fontWeight: '800' }}>{s.code} · {s.city}</Text>
                    <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {s.items.length}</Text>
                    {s.time ? (
                      <View className="flex-row items-center gap-1 ml-auto" style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.teal + '14' }}>
                        <Clock size={9} color={colors.teal} /><Text style={{ color: colors.teal, fontSize: 9.5, fontWeight: '700' }}>{s.flag} {s.time}</Text>
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
      <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {count}</Text>
    </View>
  );
}
function SubLabel({ color, text }: { color: string; text: string }) {
  return (
    <View className="flex-row items-center gap-1.5 px-1 pl-3">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: colors.warmMute, fontSize: 11, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
function Unread({ n }: { n: number }) {
  return <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{n}</Text></View>;
}
function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <View className="items-center px-6" style={{ paddingVertical: 64 }}>
      <View className="mb-3">{icon}</View>
      <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
