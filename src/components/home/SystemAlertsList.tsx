import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Bell, Paperclip, Plus } from 'lucide-react-native';
import { colors } from '../../theme';
import { announcementsChannel, userAlertsChannel, pulseGroups, type PulseEvent } from '../../data/pulse';
import { usePulseStore } from '../../store/pulseStore';
import { makeAccessFilters } from '../../logic/accessFilters';
import { dateStamp } from '../../utils/time';
import type { AccessControl } from '../../types';

// One card, whether it stands for a single channel (My Alerts, Announcements) or a whole module
// group (Attendance = BOM + AMD). `openId` is what the card routes to: a channel id or a group id.
interface CardData { key: string; openId: string; name: string; icon: string; color: string; description: string; last: PulseEvent | null; unread: number; }

// System Alerts segment. One card PER MODULE — "Attendance", not "BOM Attendance" + "AMD
// Attendance" — so branches don't multiply the list; the branch split lives on chips inside the
// detail screen. Super-admins see every module and can compose announcements; everyone else sees
// announcements addressed to them PLUS the modules a super-admin granted them from Team & Users,
// narrowed to their granted branches (the API is the real gate — it only ever sends granted
// events). View-As-aware.
export function SystemAlertsList({ activeBizId, access, onOpen, onCreate }: { activeBizId: string; access: AccessControl | null; onOpen: (id: string) => void; onCreate?: () => void }) {
  const { isSuper, bizOK, alertOK } = makeAccessFilters(access);
  const pulseEvents = usePulseStore((s) => s.events);

  const stats: Record<string, { unread: number; last: PulseEvent | null }> = {};
  pulseEvents.forEach((e) => {
    if (!stats[e.channelId]) stats[e.channelId] = { unread: 0, last: null };
    if (!e.read) stats[e.channelId].unread += 1;
    if (!stats[e.channelId].last || e.time > (stats[e.channelId].last as PulseEvent).time) stats[e.channelId].last = e;
  });

  const cards: CardData[] = [];
  // Personal "User Alerts" — every user has one (their own check-ins/outs etc.). Always shown first.
  const ua = stats[userAlertsChannel.id];
  cards.push({ key: userAlertsChannel.id, openId: userAlertsChannel.id, name: userAlertsChannel.name, icon: userAlertsChannel.icon, color: userAlertsChannel.color, description: userAlertsChannel.description, last: ua?.last ?? null, unread: ua?.unread ?? 0 });

  // Announcements — company-wide, so it stays hidden until it actually has something (same rule
  // as before; branch-scoped modules stay visible while empty).
  const ann = stats[announcementsChannel.id];
  if (ann?.last) cards.push({ key: announcementsChannel.id, openId: announcementsChannel.id, name: announcementsChannel.name, icon: announcementsChannel.icon, color: announcementsChannel.color, description: announcementsChannel.description, last: ann.last, unread: ann.unread });

  // One card per module the user can see any branch of. Branch-scoped channels match their branch
  // grant ("BOM-hr"); a user granted only BOM gets a card that means BOM alone.
  pulseGroups.forEach((g) => {
    const mine = g.channels.filter((ch) => bizOK(ch.bizId) && (activeBizId === 'all' || ch.bizId === activeBizId) && alertOK(ch.branch ?? null, ch.module));
    if (mine.length === 0) return;
    const evs = pulseEvents.filter((e) => mine.some((ch) => ch.id === e.channelId));
    // Single granted branch → name it on the card ("BOM · Attendance"); several → chips inside.
    const name = mine.length === 1 && mine[0].branch ? `${mine[0].branch} · ${g.name}` : g.name;
    cards.push({
      key: g.id, openId: g.id, name, icon: g.icon, color: g.color, description: g.description,
      last: evs.length ? evs.reduce((a, b) => (b.time > a.time ? b : a)) : null,
      unread: evs.filter((e) => !e.read).length,
    });
  });
  const unreadCards = cards.filter((c) => c.unread > 0);

  // Super-admins: compose an announcement and pick who sees it.
  const createBtn = isSuper && onCreate ? (
    <Pressable onPress={onCreate} className="flex-row items-center justify-center gap-1.5"
      style={{ borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, paddingVertical: 12, backgroundColor: colors.card }}>
      <Plus size={17} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>New alert</Text>
    </Pressable>
  ) : null;

  if (cards.length === 0) {
    return (
      <View className="px-4 pt-3 pb-6" style={{ gap: 8 }}>
        {createBtn}
        <Empty icon={<Bell size={36} color={colors.coolText3} />} title="No system alerts yet" sub="Alert channels appear as modules go live." />
      </View>
    );
  }

  const AlertCard = (c: CardData) => (
    <Pressable key={c.key} onPress={() => onOpen(c.openId)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3"
      style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: c.color }} />
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.color + '26', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>{c.icon}</Text></View>
      <View className="flex-1">
        <View className="flex-row justify-between items-baseline gap-2">
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600', flex: 1 }}>{c.name}</Text>
          {c.last ? <Text style={{ color: c.unread > 0 ? colors.primary : colors.coolText3, fontSize: 12, fontWeight: c.unread > 0 ? '700' : '500' }}>{dateStamp(c.last.time)}</Text> : null}
        </View>
        {c.last ? (
          <View className="flex-row justify-between items-center gap-2" style={{ marginTop: 2 }}>
            {c.last.attachment ? <Paperclip size={13} color={colors.coolText} /> : null}
            <Text numberOfLines={1} style={{ flex: 1, color: c.unread > 0 ? colors.ink : colors.coolText, fontSize: 13, fontWeight: c.unread > 0 ? '500' : '400' }}>{c.last.title}</Text>
            {c.unread > 0 ? <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{c.unread}</Text></View> : null}
          </View>
        ) : (
          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>{c.description}</Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View className="px-4 pt-3 pb-6" style={{ gap: 8 }}>
      {createBtn}
      {unreadCards.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View className="flex-row items-center gap-1.5 px-1">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Unread</Text>
            <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {unreadCards.length}</Text>
          </View>
          {unreadCards.map((c) => AlertCard(c))}
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        {cards.filter((c) => c.unread === 0).map((c) => AlertCard(c))}
      </View>
    </View>
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
