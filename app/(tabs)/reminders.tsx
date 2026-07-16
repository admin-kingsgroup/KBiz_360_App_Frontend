import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Bell, Archive, X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { ReminderCard } from '../../src/components/reminders';
import { colors } from '../../src/theme';
import { FILTERS } from '../../src/constants/filters';
import { useUiStore } from '../../src/store/uiStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useReminderBadgeStore } from '../../src/store/reminderBadgeStore';
import { listReminders, completeReminder, approveReminder, reassignReminder, type ReminderTab, type ReminderListResponse } from '../../src/api/reminders';
import { listUsers, type DirectoryUser } from '../../src/api/directory';
import type { ReminderRecord } from '../../src/data/reminders';

// Reminders — backed by the Mongo reminders API. Tabs map to server tabs; the server does tab
// filtering, chain-of-command visibility (All), and grouping. Operates on real CRM user ids.
const TABS: ReminderTab[] = ['forme', 'iset', 'review', 'all'];
const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (id: string): string => PALETTE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export default function Reminders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';

  const [f, setF] = useState(0);
  const [data, setData] = useState<ReminderListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reassignFor, setReassignFor] = useState<ReminderRecord | null>(null);
  const [people, setPeople] = useState<DirectoryUser[]>([]);

  // Directory for the reassign picker.
  useEffect(() => { listUsers().then(setPeople).catch(() => undefined); }, []);

  // Offline snapshot: show the last-known list for the tab instantly on a cold/offline start,
  // then let the network fetch replace it (and refresh the cache) when it succeeds.
  const cacheKey = (tab: ReminderTab): string => `kb360_reminders_${tab}`;
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const AS = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AS.getItem(cacheKey(TABS[f]));
        if (alive && raw) setData((cur) => cur ?? (JSON.parse(raw) as ReminderListResponse));
      } catch { /* no snapshot */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const load = useCallback(async (tab: ReminderTab) => {
    try {
      const fresh = await listReminders(tab);
      setData(fresh);
      void (async () => {
        try {
          const AS = (await import('@react-native-async-storage/async-storage')).default;
          await AS.setItem(cacheKey(tab), JSON.stringify(fresh));
        } catch { /* cache write is best-effort */ }
      })();
    } catch { /* offline / not signed in — keep the snapshot */ } finally { setLoading(false); }
    void useReminderBadgeStore.getState().refresh(); // keep the tab badge in sync
  }, []);

  // Refetch on focus or tab change (e.g. after creating a reminder in the modal).
  useFocusEffect(useCallback(() => { void load(TABS[f]); }, [f, load]));
  const onRefresh = useCallback(() => { setRefreshing(true); void load(TABS[f]).finally(() => setRefreshing(false)); }, [f, load]);

  const onComplete = async (id: string) => {
    try { const res = await completeReminder(id); showToast(res.result === 'archived' ? 'Done · archived' : 'Complete · sent for review'); }
    catch { showToast('Could not update reminder'); }
    void load(TABS[f]);
  };
  const onApprove = async (id: string) => {
    try { await approveReminder(id); showToast('Approved · moved to archive'); } catch { showToast('Could not approve'); }
    void load(TABS[f]);
  };
  const onReassign = (r: ReminderRecord) => setReassignFor(r);
  const doReassign = async (forId: string) => {
    const r = reassignFor;
    setReassignFor(null);
    if (!r) return;
    try { await reassignReminder(r.id, forId); showToast('Reminder reassigned'); } catch { showToast('Could not reassign'); }
    void load(TABS[f]);
  };

  const groups = data?.groups ?? [];
  const visible = data?.visible ?? [];
  const reviewCount = data?.reviewCount ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 16, fontWeight: '600', letterSpacing: -0.5 }}>Reminders</Text>
        <Pressable onPress={() => router.push('/reminder/archive')} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
          <Archive size={15} color={colors.ink} />
        </Pressable>
      </View>

      {/* Filter tabs */}
      <View className="flex-row gap-1.5 px-4 pb-2">
        {FILTERS.map((label, i) => {
          const on = i === f;
          const showBadge = label === 'Review' && reviewCount > 0;
          return (
            <Pressable key={label} onPress={() => setF(i)} className="flex-row items-center gap-1"
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: on ? colors.ink : colors.paper, borderColor: on ? colors.ink : colors.cardEdge }}>
              <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12, fontWeight: '700' }}>{label}</Text>
              {showBadge ? <View style={{ minWidth: 15, height: 15, paddingHorizontal: 4, borderRadius: 999, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800' }}>{reviewCount}</Text></View> : null}
            </Pressable>
          );
        })}
      </View>

      {loading && !data ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 96 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}>
          {groups.map((sec) => (
            <View key={sec.key}>
              <View className="flex-row items-center gap-2 px-5 pt-3 pb-1.5">
                <Avatar initials={sec.initials || ''} color={sec.avColor || colors.ink} size={20} />
                <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13, fontWeight: '600' }}>{sec.name}</Text>
                {sec.sub ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.cardEdge }}>
                    <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '800' }}>{sec.sub}</Text>
                  </View>
                ) : null}
                <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {sec.items.length}</Text>
              </View>
              <View className="px-4" style={{ gap: 6 }}>
                {(sec.items as ReminderRecord[]).map((r) => (
                  <ReminderCard key={r.id} r={r} biz={null} meId={meId} onComplete={onComplete} onApprove={onApprove} onReassign={onReassign} />
                ))}
              </View>
            </View>
          ))}

          {visible.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 64 }}>
              <Bell size={32} color={colors.textMuted2} />
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 12 }}>No reminders in this filter</Text>
              {f === 2 ? <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4 }}>Items appear here when assignees complete what you set</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Pressable onPress={() => router.push('/reminder/new')} style={{ position: 'absolute', right: 16, bottom: 16, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={22} color="#fff" strokeWidth={2.5} />
      </Pressable>

      {/* Reassign picker — choose a new assignee; resets the reminder to pending for them. */}
      <Modal visible={!!reassignFor} transparent animationType="slide" onRequestClose={() => setReassignFor(null)}>
        <Pressable onPress={() => setReassignFor(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16), maxHeight: '72%' }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
            <View className="flex-row items-center justify-between px-5 pb-2">
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Reassign to…</Text>
                {reassignFor ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 1 }}>{reassignFor.text}</Text> : null}
              </View>
              <Pressable onPress={() => setReassignFor(null)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {people.filter((u) => u.id !== reassignFor?.forId).map((u) => (
                <Pressable key={u.id} onPress={() => void doReassign(u.id)} className="flex-row items-center" style={{ gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 }}>
                  <Avatar initials={initialsOf(u.name)} color={colorFor(u.id)} size={36} />
                  <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{u.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
