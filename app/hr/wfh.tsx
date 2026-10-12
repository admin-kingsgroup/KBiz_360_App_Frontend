import { memo, useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CalendarDays, ChevronLeft, HouseWifi, Send } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { HrMenuButton } from '../../src/components/hr/HrMenu';
import { DaySheet } from '../../src/components/forms/DaySheet';
import { SheetSave } from '../../src/components/forms/SheetSave';
import { useUiStore } from '../../src/store/uiStore';
import { ApiError } from '../../src/api/client';
import { getMyWfh, applyWfh, cancelWfh, type WfhApplication } from '../../src/api/hr';
import { dayLabel, shiftDay, spanCount, MAX_BACK_DAYS, MAX_AHEAD_DAYS } from '../../src/logic/leave';
import { waitingLine, wfhDecisionLine, wfhDraftError } from '../../src/logic/wfh';

// Work from home — self-service (owner, 2026-10-12): "give option to apply for work from home so
// that on that day employee not mark as absent instead show wfh and count in present". Applying
// only FILES the ask; the FM, the Director and the Owner sign it on the ERP (Approvals ▸ HR, or the
// app's ERP approvals tab). On the final signature each working day in the span becomes a present
// day marked WFH — no check-in needed. It never draws on the leave balance.

const STATUS_COLORS: Record<string, string> = {
  pending: colors.orange,
  approved: colors.primary,
  rejected: colors.danger,
  cancelled: colors.coolText3,
};
const MAX_MARKED_SHOWN = 10;

const localToday = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

export default function WfhScreen() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [apps, setApps] = useState<WfhApplication[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [noRecord, setNoRecord] = useState(false); // the server said NO_HR_RECORD on a send
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback((): Promise<void> =>
    getMyWfh()
      .then((d) => { setApps(d.applications ?? []); setLoadFailed(false); })
      .catch(() => setLoadFailed(true)), []);
  // Refetch on focus: a decision made on the ERP shows up when the person comes back.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = useCallback((): void => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const today = localToday();
  const error = wfhDraftError({ from, to, reason }, today);
  const days = spanCount(from, to);

  const submit = (): void => {
    if (error || sending) return;
    setSending(true);
    applyWfh({ from, to, reason: reason.trim() })
      .then(() => {
        showToast('Work-from-home request sent for approval');
        setFrom(''); setTo(''); setReason('');
        void load();
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'NO_HR_RECORD') setNoRecord(true);
        showToast(e instanceof ApiError ? e.message : 'Could not send the request');
      })
      .finally(() => setSending(false));
  };

  const withdraw = useCallback((app: WfhApplication): void => {
    Alert.alert('Withdraw this request?', `Work from home · ${dayLabel(app.from)}${app.to !== app.from ? ` → ${dayLabel(app.to)}` : ''}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => {
          cancelWfh(app.id)
            .then(() => { showToast('Request withdrawn'); void load(); })
            .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not withdraw'));
        },
      },
    ]);
  }, [load, showToast]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Work from home</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Apply · your requests</Text>
        </View>
        <HrMenuButton current="wfh" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* What WFH means — said once, plainly. */}
        <View className="flex-row gap-3" style={{ padding: 14, borderRadius: 16, backgroundColor: colors.wfh + '12', borderWidth: 1, borderColor: colors.wfh + '33', marginBottom: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.wfh + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <HouseWifi size={18} color={colors.wfh} />
          </View>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 }}>
            An approved work-from-home day counts as present — no check-in needed. Approved by the FM, the Director and the Owner.
          </Text>
        </View>

        {apps === null ? (
          <View className="items-center" style={{ paddingVertical: 56 }}>
            {loadFailed
              ? <>
                  <Text style={{ color: colors.coolText, fontSize: 13, marginBottom: 12 }}>Couldn’t reach the server.</Text>
                  <Pressable onPress={() => void load()} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary }}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text></Pressable>
                </>
              : <ActivityIndicator color={colors.primary} />}
          </View>
        ) : (
          <>
            {/* Apply form */}
            {noRecord ? (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.orange + '12', borderWidth: 1, borderColor: colors.orange + '40', marginBottom: 16 }}>
                <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>
                  No HR record is linked to your login yet — ask HR to add you on the Employee Master. You can’t apply until then.
                </Text>
              </View>
            ) : (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 16 }}>
                <View className="flex-row items-center gap-1.5" style={{ marginBottom: 10 }}>
                  <Send size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>APPLY FOR WORK FROM HOME</Text>
                </View>
                <View className="flex-row gap-2" style={{ marginBottom: 10 }}>
                  <DayField label="First day" value={from} onPress={() => setPicking('from')} />
                  <DayField label="Last day" value={to} onPress={() => setPicking('to')} />
                </View>
                {days > 0 ? (
                  <Text style={{ color: colors.coolText, fontSize: 12, marginBottom: 8 }}>
                    {days} day{days === 1 ? '' : 's'}{days > 1 ? ' · week offs and holidays in the span are skipped' : ''}
                  </Text>
                ) : null}
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Reason — goes to the approvers"
                  placeholderTextColor={colors.coolText3}
                  multiline
                  maxLength={500}
                  style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top', marginBottom: 10 }}
                />
                {error && (from || to || reason) ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{error}</Text> : null}
                <SheetSave label={sending ? 'Sending…' : 'Send for approval'} disabled={!!error || sending} onPress={submit} />
                <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center', marginTop: 8 }}>Not drawn from your leave balance. The decision shows below.</Text>
              </View>
            )}

            {/* Trail */}
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>MY REQUESTS</Text>
            <View style={{ gap: 8 }}>
              {apps.length === 0 ? (
                <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No work-from-home requests yet.</Text>
              ) : apps.map((a) => <WfhRow key={a.id} app={a} onWithdraw={withdraw} />)}
            </View>
          </>
        )}
      </ScrollView>

      <DaySheet
        visible={picking !== null}
        title={picking === 'to' ? 'Last day working from home' : 'First day working from home'}
        initial={picking === 'to' ? (to || from || null) : (from || null)}
        minDay={shiftDay(today, -MAX_BACK_DAYS)}
        maxDay={shiftDay(today, MAX_AHEAD_DAYS)}
        onClose={() => setPicking(null)}
        onConfirm={(day) => {
          if (picking === 'from') { setFrom(day); if (!to || to < day) setTo(day); }
          else if (picking === 'to') { setTo(day); if (!from || from > day) setFrom(day); }
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}

const DayField = memo(function DayField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? dayLabel(value) : 'not picked'}`}
      style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: value ? colors.primary : colors.coolDivider, backgroundColor: value ? colors.primarySoft : colors.coolBg }}>
      <View className="flex-row items-center gap-1">
        <CalendarDays size={13} color={value ? colors.primary : colors.coolText} />
        <Text style={{ color: value ? colors.primary : colors.coolText, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      </View>
      <Text style={{ color: value ? colors.ink : colors.coolText3, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{value ? dayLabel(value) : 'Pick a day'}</Text>
    </Pressable>
  );
});

const WfhRow = memo(function WfhRow({ app, onWithdraw }: { app: WfhApplication; onWithdraw: (a: WfhApplication) => void }) {
  const c = STATUS_COLORS[app.status] ?? colors.coolText;
  const waiting = waitingLine(app);
  const decision = wfhDecisionLine(app);
  const marked = app.status === 'approved' && app.markedDays?.length && app.markedDays.length <= MAX_MARKED_SHOWN
    ? `WFH on ${app.markedDays.map(dayLabel).join(' · ')}`
    : '';
  return (
    <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
      <View className="flex-row items-center justify-between gap-2">
        <Text style={{ flexShrink: 1, color: colors.ink, fontSize: 14, fontWeight: '700' }}>{dayLabel(app.from)}{app.to !== app.from ? ` → ${dayLabel(app.to)}` : ''} · {app.days}d</Text>
        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: c + '18' }}>
          <Text style={{ color: c, fontSize: 10, fontWeight: '700' }}>{app.status === 'cancelled' ? 'WITHDRAWN' : app.status.toUpperCase()}</Text>
        </View>
      </View>
      {app.reason ? <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 3 }}>{app.reason}</Text> : null}
      {waiting ? <Text style={{ color: colors.orange, fontSize: 12, fontWeight: '700', marginTop: 3 }}>{waiting}</Text> : null}
      {decision && app.status !== 'cancelled' ? <Text style={{ color: c, fontSize: 12, fontWeight: '600', marginTop: 3 }}>{decision}</Text> : null}
      {marked ? <Text style={{ color: colors.coolText, fontSize: 11.5, marginTop: 2 }}>{marked}</Text> : null}
      {app.status === 'pending' ? (
        <Pressable onPress={() => onWithdraw(app)} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.danger + '12' }}>
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>WITHDRAW</Text>
        </Pressable>
      ) : null}
    </View>
  );
});
