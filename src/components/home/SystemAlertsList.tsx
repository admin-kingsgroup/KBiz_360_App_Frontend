import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Bell, Paperclip, Plus } from 'lucide-react-native';
import { colors, shadow } from '../../theme';
import { businesses, branches } from '../../data/businesses';
import { announcementsChannel, pulseChannels, moduleRank, branchOf, type PulseChannel, type PulseEvent } from '../../data/pulse';
import { usePulseStore } from '../../store/pulseStore';
import { makeAccessFilters } from '../../logic/accessFilters';
import { timeAgo } from '../../utils/time';
import type { AccessControl } from '../../types';

interface CardData { key: string; ch: PulseChannel; last: PulseEvent | null; unread: number; ctx: string; secId: string; }

// System Alerts segment. Super-admins see every registered channel (attendance + finance + crm
// + announcements) and can compose new announcements; everyone else sees announcements addressed
// to them PLUS the channels a super-admin granted them from Team & Users (the API is the real
// gate — it only ever sends events for granted channels). View-As-aware.
export function SystemAlertsList({ activeBizId, access, onOpenChannel, onCreate }: { activeBizId: string; access: AccessControl | null; onOpenChannel: (ch: PulseChannel) => void; onCreate?: () => void }) {
  const { isSuper, bizOK, alertOK, alertBrOK } = makeAccessFilters(access);
  const pulseEvents = usePulseStore((s) => s.events);

  const stats: Record<string, { unread: number; last: PulseEvent | null }> = {};
  pulseEvents.forEach((e) => {
    if (!stats[e.channelId]) stats[e.channelId] = { unread: 0, last: null };
    if (!e.read) stats[e.channelId].unread += 1;
    if (!stats[e.channelId].last || e.time > (stats[e.channelId].last as PulseEvent).time) stats[e.channelId].last = e;
  });

  // Branch-scoped channels (e.g. BOM Attendance) match against their branch grant ("BOM-hr");
  // business-wide channels still need a module-wide grant.
  let visible = pulseChannels.filter((ch) => bizOK(ch.bizId) && alertOK(ch.branch ?? null, ch.module));
  if (activeBizId !== 'all') visible = visible.filter((ch) => ch.bizId === activeBizId);
  const bizList = (activeBizId === 'all' ? businesses : businesses.filter((b) => b.id === activeBizId)).filter((b) => bizOK(b.id));
  const branchMode = activeBizId === 'tk';

  const cards: CardData[] = [];
  if (!isSuper) {
    // Announcements addressed to this user, then their granted channels (alertOK already
    // filtered `visible` down to grants — a user with no grants sees announcements only).
    const ann = stats[announcementsChannel.id];
    if (ann) cards.push({ key: announcementsChannel.id, ch: announcementsChannel, last: ann.last, unread: ann.unread, ctx: 'TK', secId: 'ann' });
    visible
      .filter((ch) => ch.branch) // branch-scoped channels only; announcements handled above
      .sort((a, b) => (a.branch || '').localeCompare(b.branch || '') || moduleRank(a.module) - moduleRank(b.module))
      .forEach((ch) => {
        const st = stats[ch.id];
        cards.push({ key: ch.id, ch, last: st?.last || null, unread: st?.unread || 0, ctx: ch.branch || 'TK', secId: 'granted' });
      });
    if (cards.length === 0) return null;
  } else if (branchMode) {
    const tkChans = pulseChannels.filter((c) => c.bizId === 'tk').sort((a, b) => moduleRank(a.module) - moduleRank(b.module));
    const secs = [
      ...branches.filter((br) => alertBrOK(br.code)).map((br) => ({ id: br.id, short: br.code, color: br.color })),
      ...(isSuper ? [{ id: 'co', short: 'TK', color: colors.purple }] : []),
    ];
    secs.forEach((sec) => {
      tkChans.forEach((ch) => {
        if (ch.branch && ch.branch !== sec.short) return; // branch-scoped channel → only its own section
        if (!(sec.id === 'co' ? isSuper : alertOK(sec.short, ch.module))) return;
        const evs = pulseEvents.filter((e) => e.channelId === ch.id && (sec.id === 'co' ? branchOf(e) === null : branchOf(e) === sec.id));
        if (evs.length === 0 && !ch.branch) return; // branch-scoped channels stay visible while empty
        const last = evs.length ? evs.reduce((a, b) => (b.time > a.time ? b : a)) : null;
        cards.push({ key: `${sec.id}-${ch.id}`, ch, last, unread: evs.filter((e) => !e.read).length, ctx: sec.short, secId: sec.id });
      });
    });
  } else {
    bizList.forEach((b) => {
      visible.filter((ch) => ch.bizId === b.id).sort((x, y) => moduleRank(x.module) - moduleRank(y.module)).forEach((ch) => {
        const st = stats[ch.id];
        if (!ch.branch && !st?.last) return; // company-wide channels (announcements) hide while empty — same rule as branch mode
        cards.push({ key: `${b.id}-${ch.id}`, ch, last: st?.last || null, unread: st?.unread || 0, ctx: b.code, secId: b.id });
      });
    });
  }
  const unreadCards = cards.filter((c) => c.unread > 0);

  // Super-admins: compose an announcement and pick who sees it.
  const createBtn = isSuper && onCreate ? (
    <Pressable onPress={onCreate} className="flex-row items-center justify-center gap-1.5"
      style={{ borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.cardEdge, paddingVertical: 11, backgroundColor: '#fff' }}>
      <Plus size={15} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '800' }}>New alert</Text>
    </Pressable>
  ) : null;

  if (cards.length === 0) {
    return (
      <View className="px-4 pt-3 pb-6" style={{ gap: 8 }}>
        {createBtn}
        <Empty icon={<Bell size={32} color={colors.textMuted2} />} title="No system alerts yet" sub="Alert channels appear as modules go live." />
      </View>
    );
  }

  const AlertCard = (c: CardData, showCtx: boolean) => (
    <Pressable key={c.key} onPress={() => onOpenChannel(c.ch)} className="flex-row items-center gap-2.5 p-2.5"
      style={[{ backgroundColor: c.ch.tint, borderColor: c.ch.color + '40', borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, shadow]}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: c.ch.color }} />
      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: c.ch.color + '26', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 17 }}>{c.ch.icon}</Text></View>
      <View className="flex-1">
        <View className="flex-row justify-between items-baseline gap-2">
          <Text numberOfLines={1} style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13.5, fontWeight: '600', flex: 1 }}>{showCtx ? `${c.ctx} · ${c.ch.name}` : c.ch.name}</Text>
          {c.last ? <Text style={{ color: '#bdb3a0', fontSize: 10, fontWeight: '600' }}>{timeAgo(c.last.time)}</Text> : null}
        </View>
        {c.last ? (
          <View className="flex-row justify-between items-center gap-2 mt-0.5">
            {c.last.attachment ? <Paperclip size={11} color={colors.warmMute} /> : null}
            <Text numberOfLines={1} style={{ flex: 1, color: colors.warmMute, fontSize: 11 }}>{c.last.title}</Text>
            {c.unread > 0 ? <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{c.unread}</Text></View> : null}
          </View>
        ) : (
          <Text numberOfLines={1} style={{ color: c.ch.color, fontSize: 10, marginTop: 2 }}>{c.ch.description}</Text>
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
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral }} />
            <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13, fontWeight: '600' }}>Unread</Text>
            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {unreadCards.length}</Text>
          </View>
          {unreadCards.map((c) => AlertCard(c, !c.ch.branch))}
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        {cards.filter((c) => c.unread === 0).map((c) => AlertCard(c, !c.ch.branch))}
      </View>
    </View>
  );
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
