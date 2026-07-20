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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* White header bar (matches the Chats screen chrome) */}
      <View className="flex-row items-center justify-between px-4" style={{ backgroundColor: colors.card, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Reminders</Text>
        <Pressable onPress={() => router.push('/reminder/archive')} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}>
          <Archive size={19} color={colors.ink} />
        </Pressable>
      </View>

      {/* Filter chips — grey, green when active (Home chips language) */}
      <View className="flex-row gap-2 px-4" style={{ paddingVertical: 10 }}>
        {FILTERS.map((label, i) => {
          const on = i === f;
          const showBadge = label === 'Review' && reviewCount > 0;
          return (
            <Pressable key={label} onPress={() => setF(i)} className="flex-row items-center gap-1.5"
              style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
              <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{label}</Text>
              {showBadge ? <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 999, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '700' }}>{reviewCount}</Text></View> : null}
            </Pressable>
          );
        })}
      </View>

      {loading && !data ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 96 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          {groups.map((sec) => (
            <View key={sec.key}>
              <View className="flex-row items-center gap-2 px-5 pt-3 pb-1.5">
                <Avatar initials={sec.initials || ''} color={sec.avColor || colors.ink} size={24} />
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{sec.name}</Text>
                {sec.sub ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.coolMuted }}>
                    <Text style={{ color: colors.coolText, fontSize: 10.5, fontWeight: '700' }}>{sec.sub}</Text>
                  </View>
                ) : null}
                <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {sec.items.length}</Text>
              </View>
              <View className="px-4" style={{ gap: 8 }}>
                {(sec.items as ReminderRecord[]).map((r) => (
                  <ReminderCard key={r.id} r={r} biz={null} meId={meId} onComplete={onComplete} onApprove={onApprove} onReassign={onReassign} />
                ))}
              </View>
            </View>
          ))}

          {visible.length === 0 ? (
            <View className="items-center px-8" style={{ paddingVertical: 64 }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={42} color={colors.primary} />
              </View>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16 }}>No reminders in this filter</Text>
              {f === 2 ? <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center' }}>Items appear here when assignees complete what you set</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Green FAB (WhatsApp-style) */}
      <Pressable onPress={() => router.push('/reminder/new')} style={{ position: 'absolute', right: 16, bottom: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: colors.primaryDark, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </Pressable>

      {/* Reassign picker — choose a new assignee; resets the reminder to pending for them. */}
      <Modal visible={!!reassignFor} transparent animationType="slide" onRequestClose={() => setReassignFor(null)}>
        <Pressable onPress={() => setReassignFor(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: Math.max(28, insets.bottom + 16), maxHeight: '72%' }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
            <View className="flex-row items-center justify-between px-5 pb-3">
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Reassign to…</Text>
                {reassignFor ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 13, marginTop: 2 }}>{reassignFor.text}</Text> : null}
              </View>
              <Pressable onPress={() => setReassignFor(null)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={17} color={colors.coolText} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {people.filter((u) => u.id !== reassignFor?.forId).map((u) => (
                <Pressable key={u.id} onPress={() => void doReassign(u.id)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center" style={{ gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 }}>
                  <Avatar initials={initialsOf(u.name)} color={colorFor(u.id)} size={42} />
                  <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{u.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
