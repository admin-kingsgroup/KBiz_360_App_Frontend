import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, MoreVertical, FileText } from 'lucide-react-native';
import { colors, shadow } from '../../src/theme';
import { channelById, groupById, groupForChannel, type PulseChannel } from '../../src/data/pulse';
import { businesses } from '../../src/data/businesses';
import { reminderPeople } from '../../src/data/reminders';
import { usePulseStore } from '../../src/store/pulseStore';
import { useAccessStore } from '../../src/store/accessStore';
import { makeAccessFilters } from '../../src/logic/accessFilters';
import { useUiStore } from '../../src/store/uiStore';
import { apiFetch } from '../../src/api/client';
import { mediaUrl } from '../../src/api/media';
import { dateStamp } from '../../src/utils/time';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';

// Alert detail — port of source PulseChannelScreen. Opening the channel marks ALL its events read
// (Home's unread badge clears, like a chat thread); the events that were unread on entry keep their
// "new" highlight for this visit so the user can still see what just arrived.
export default function AlertDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rid = id ?? '';
  const access = useAccessStore((s) => s.access());
  const { bizOK, alertOK } = makeAccessFilters(access);

  // The route id is either a module GROUP ('grp_hr' — what the Home cards link to), or a real
  // backend channel id: 'tk_att_bom' from a push deep link (→ its group, that branch preselected),
  // or 'user_alerts'/'announcements', which belong to no group.
  const group = groupById(rid) ?? groupForChannel(rid);
  // A group renders through the same header/banner as a channel, so present it as one.
  const channel: PulseChannel | undefined = group
    ? { id: group.id, bizId: 'tk', module: group.module, name: group.name, icon: group.icon, color: group.color, tint: group.tint, description: group.description, members: [] }
    : channelById(rid);
  // The branches of this group the viewer may actually see. Grants stay per branch, so grouping
  // never widens access — a BOM-only user's Attendance group is the BOM channel alone.
  const memberChannels: PulseChannel[] = group
    ? group.channels.filter((ch) => bizOK(ch.bizId) && alertOK(ch.branch ?? null, ch.module))
    : (channel ? [channel] : []);

  const [branchPick, setBranchPick] = useState<string>(group && rid !== group.id ? rid : 'all');
  // Fall back to 'all' if the picked channel isn't visible (e.g. a deep link to a revoked grant).
  const picked = memberChannels.some((c) => c.id === branchPick) ? branchPick : 'all';
  const shownIds = (picked === 'all' ? memberChannels : memberChannels.filter((c) => c.id === picked)).map((c) => c.id);

  const events = usePulseStore((s) => s.events).filter((e) => shownIds.includes(e.channelId)).sort((a, b) => b.time - a.time);
  const allEvents = usePulseStore((s) => s.events);
  const markEventRead = usePulseStore((s) => s.markEventRead);
  const markChannelRead = usePulseStore((s) => s.markChannelRead);
  // Reading a group marks every branch it currently shows — one call per real backend channel.
  const markShownRead = (): void => shownIds.forEach(markChannelRead);
  const showToast = useUiStore((s) => s.showToast);
  // Pull the latest feed every time this screen is shown (a deep link / cold start can land here
  // before the store has today's events; a newly sent announcement shows without going back).
  useRefreshOnFocus(() => { void usePulseStore.getState().refresh(); });

  // Mark read once the channel's events are actually loaded (a deep link can land here before the
  // first /api/alerts fetch resolves); later events arriving mid-visit stay unread until tapped.
  const newOnEntry = useRef<Set<string>>(new Set());
  const markedOnEntry = useRef(false);
  useEffect(() => {
    if (markedOnEntry.current || !channel || events.length === 0) return;
    markedOnEntry.current = true;
    const unread = events.filter((e) => !e.read);
    if (unread.length === 0) return;
    newOnEntry.current = new Set(unread.map((e) => e.id));
    markShownRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, events]);
  const isNew = (e: { id: string; read: boolean }): boolean => !e.read || newOnEntry.current.has(e.id);

  // Open the attachment in an in-app browser sheet. The auth-gated endpoint returns a
  // short-lived signed URL (server checks channel visibility); events from older backends
  // fall back to their stored URL. HEAD preflight keeps the failure toast truthful.
  const openAttachment = async (e: { id: string; read: boolean; attachment?: { url: string } }): Promise<void> => {
    if (!e.attachment) return;
    if (!e.read) markEventRead(e.id);
    try {
      const resolved = await apiFetch<{ url: string }>(`/api/alerts/attachment/${e.id}`).catch(() => null);
      const url = mediaUrl(resolved?.url || e.attachment.url);
      const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (!head?.ok) { showToast('Could not open PDF'); return; }
      await WebBrowser.openBrowserAsync(url);
    } catch {
      showToast('Could not open PDF');
    }
  };

  if (!channel) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
        <Header title="Alert" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><Text style={{ color: colors.coolText }}>Channel not found</Text></View>
      </SafeAreaView>
    );
  }

  const biz = channel.bizId ? businesses.find((b) => b.id === channel.bizId) : null;
  // "· BOM branch" for a single channel or a one-branch group; "· 2 branches" once chips appear.
  const branchSubtitle = memberChannels.length > 1
    ? ` · ${memberChannels.length} branches`
    : (memberChannels[0]?.branch ? ` · ${memberChannels[0].branch} branch` : '');
  const memberObjs = channel.members.map((mid) => reminderPeople.find((p) => p.id === mid) || { id: mid, name: mid, initials: mid.slice(0, 2).toUpperCase(), color: colors.coolText3 });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <Header title={channel.name} subtitle={channel.members.length ? `${biz?.name || 'System'} · ${channel.members.length} member${channel.members.length === 1 ? '' : 's'}` : `${biz?.name || 'System'}${branchSubtitle}`}
        onBack={() => router.back()} right={<Pressable onPress={() => { markShownRead(); showToast('Marked all read'); }} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><MoreVertical size={20} color={colors.ink} /></Pressable>} />

      {/* Branch chips — this is what replaces one card per branch on Home. Only shown when the
          viewer is granted more than one branch of the module. */}
      {memberChannels.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}
          contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }}>
          {([{ id: 'all', label: 'All' }, ...memberChannels.map((c) => ({ id: c.id, label: c.branch || c.name }))]).map((chip) => {
            const on = picked === chip.id;
            const n = allEvents.filter((e) => (chip.id === 'all' ? memberChannels.some((c) => c.id === e.channelId) : e.channelId === chip.id) && !e.read).length;
            return (
              // Selected = solid `primary` + white, the same pill treatment as every other
              // selected chip/tab in the app. (The channel colour is too light behind white text,
              // and a translucent-white count badge on it was barely legible.)
              <Pressable key={chip.id} onPress={() => setBranchPick(chip.id)}
                // Fixed height + centering (NOT paddingVertical) — inside a horizontal ScrollView
                // the cross-axis stretch squashes padding-sized pills and clips the label.
                style={{ height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider }}>
                <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{chip.label}</Text>
                {n > 0 ? (
                  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: on ? '#fff' : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: on ? colors.primary : '#fff', fontSize: 10.5, fontWeight: '800' }}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Channel banner */}
        <View style={{ margin: 14, padding: 16, borderRadius: 16, backgroundColor: channel.color + '18' }}>
          <View className="flex-row items-center gap-3">
            <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: channel.color + '30', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>{channel.icon}</Text></View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.4 }}>{channel.name}</Text>
              <Text style={{ color: colors.ink, opacity: 0.7, fontSize: 12, marginTop: 2 }}>{channel.description}</Text>
            </View>
          </View>
          {memberObjs.length > 0 ? <View className="flex-row items-center gap-1.5 mt-3" style={{ flexWrap: 'wrap' }}>
            <Text style={{ color: channel.color, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>VISIBLE TO</Text>
            {memberObjs.slice(0, 6).map((m) => (
              <View key={m.id} className="flex-row items-center gap-1" style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.7)' }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: m.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800' }}>{m.initials.charAt(0)}</Text></View>
                <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '600' }}>{m.name.split(' ')[0]}</Text>
              </View>
            ))}
          </View> : null}
        </View>

        <Text style={{ color: colors.coolText3, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3, paddingHorizontal: 16, paddingBottom: 8 }}>{events.length} {events.length === 1 ? 'EVENT' : 'EVENTS'}</Text>

        {events.length === 0 ? (
          <View className="items-center px-6" style={{ paddingVertical: 48 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🛌</Text>
            <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '700' }}>No events yet</Text>
          </View>
        ) : (
        <View style={{ paddingHorizontal: 14, gap: 10 }}>
        {events.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => { if (!e.read) markEventRead(e.id); }}
            // Each alert is its own bordered card (same card language as Home) so consecutive
            // events are clearly separated; "new" events keep the tinted bg + colored left bar.
            style={[{
              paddingHorizontal: 14, paddingVertical: 12,
              borderRadius: 14, borderWidth: 1.5, overflow: 'hidden',
              borderColor: isNew(e) ? channel.color + '66' : colors.coolDivider,
              backgroundColor: isNew(e) ? colors.primarySoft : colors.card,
            }, shadow]}
          >
            {isNew(e) ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: channel.color }} /> : null}
            <View className="flex-row items-baseline justify-between gap-2">
              <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11, fontWeight: '600', flex: 1 }}>{e.source}</Text>
              <Text style={{ color: colors.coolText3, fontSize: 11, fontWeight: '600' }}>{dateStamp(e.time)}</Text>
            </View>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{e.title}</Text>
            {e.body ? <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 2 }}>{e.body}</Text> : null}
            {e.context ? <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.coolMuted }}><Text style={{ color: colors.coolText, fontSize: 10.5, fontWeight: '600' }}>{e.context}</Text></View> : null}
            {e.attachment ? (
              <Pressable
                onPress={() => { void openAttachment(e); }}
                className="flex-row items-center gap-1.5"
                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.primary }}
              >
                <FileText size={13} color="#fff" />
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 11.5, fontWeight: '700', maxWidth: 220 }}>{e.attachment.name}</Text>
              </Pressable>
            ) : null}
            {e.actions && e.actions.length > 0 ? (
              <View className="flex-row gap-1.5 mt-2" style={{ flexWrap: 'wrap' }}>
                {e.actions.map((a, i) => (
                  <Pressable key={i} onPress={() => { markEventRead(e.id); showToast(a.label); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: a.primary ? colors.primary : colors.coolMuted }}>
                    <Text style={{ color: a.primary ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '700' }}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Pressable>
        ))}
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
      <Pressable onPress={onBack} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
      <View className="flex-1"><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{subtitle}</Text> : null}</View>
      {right}
    </View>
  );
}
