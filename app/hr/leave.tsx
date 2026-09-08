import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, Palmtree, Send } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { DaySheet } from '../../src/components/forms/DaySheet';
import { SheetSave } from '../../src/components/forms/SheetSave';
import { useUiStore } from '../../src/store/uiStore';
import { ApiError } from '../../src/api/client';
import { getMyLeave, applyLeave, cancelLeaveApplication, type MyLeave, type LeaveApplication } from '../../src/api/hr';
import { dayLabel, leaveDraftError, shiftDay, spanCount, MAX_BACK_DAYS, MAX_AHEAD_DAYS } from '../../src/logic/leave';

// Paid leave — self-service: the balance (the ERP's own rule, served by the backend), an apply
// form, and the application trail. Applying only FILES the ask — HR approves or rejects it on the
// ERP (Leave Applications), and the decision shows up here on the next load.

const STATUS_COLORS: Record<string, string> = {
  pending: colors.orange,
  approved: colors.primary,
  rejected: colors.danger,
  cancelled: colors.coolText3,
};

export default function LeaveScreen() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [data, setData] = useState<MyLeave | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [half, setHalf] = useState(false); // half-day — one day, the other half worked
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback((): void => {
    getMyLeave()
      .then((d) => { setData(d); setLoadFailed(false); })
      .catch(() => setLoadFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const error = leaveDraftError({ from, to, reason }, today);
  const days = spanCount(from, to);

  const halfAllowed = !!data?.features?.halfDay && from !== '' && from === to;
  const askHalf = half && halfAllowed; // the toggle only counts while the ask is a single day

  const submit = (): void => {
    if (error || sending) return;
    setSending(true);
    applyLeave({ from, to, reason: reason.trim(), ...(askHalf ? { dayType: 'half' as const } : {}) })
      .then(() => {
        showToast('Leave application sent to HR');
        setFrom(''); setTo(''); setHalf(false); setReason('');
        load();
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not send the application'))
      .finally(() => setSending(false));
  };

  const withdraw = useCallback((app: LeaveApplication): void => {
    Alert.alert('Withdraw application?', `${dayLabel(app.from)} → ${dayLabel(app.to)} · ${app.days}d`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => {
          cancelLeaveApplication(app.id)
            .then(() => { showToast('Application withdrawn'); load(); })
            .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not withdraw'));
        },
      },
    ]);
  }, [load, showToast]);

  const balance = data?.balance ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Paid leave</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Balance · apply · your applications</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {data === null ? (
          <View className="items-center" style={{ paddingVertical: 56 }}>
            {loadFailed
              ? <>
                  <Text style={{ color: colors.coolText, fontSize: 13, marginBottom: 12 }}>Couldn’t reach the server.</Text>
                  <Pressable onPress={load} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary }}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text></Pressable>
                </>
              : <ActivityIndicator color={colors.primary} />}
          </View>
        ) : (
          <>
            {/* Balance card */}
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.primary, marginBottom: 12 }}>
              <View className="flex-row items-center gap-1.5" style={{ marginBottom: 6 }}>
                <Palmtree size={14} color="rgba(255,255,255,0.9)" />
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>AVAILABLE PAID LEAVE</Text>
              </View>
              {balance ? (
                <>
                  <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>{balance.balance} <Text style={{ fontSize: 18, fontWeight: '700' }}>days</Text></Text>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 4 }}>
                    Opening {balance.openingBalance}d{balance.openingAsOf ? ` (as at ${balance.openingAsOf})` : ''} · +{balance.accrued}d credited · −{balance.taken}d taken
                  </Text>
                  {balance.nextCreditOn ? (
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2 }}>+{balance.monthlyAccrual}d credits on {dayLabel(balance.nextCreditOn)}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13.5, lineHeight: 19 }}>
                  No HR record is linked to your login yet — ask HR to add you on the Employee Master. You can’t apply for leave until then.
                </Text>
              )}
            </View>

            {/* Apply form */}
            {data.hasRecord ? (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 16 }}>
                <View className="flex-row items-center gap-1.5" style={{ marginBottom: 10 }}>
                  <Send size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>APPLY FOR LEAVE</Text>
                </View>
                <View className="flex-row gap-2" style={{ marginBottom: 10 }}>
                  <DayField label="First day" value={from} onPress={() => setPicking('from')} />
                  <DayField label="Last day" value={to} onPress={() => setPicking('to')} />
                </View>
                {/* Half-day (server-gated): one day of which the other half is worked — draws ½. */}
                {halfAllowed ? (
                  <Pressable onPress={() => setHalf((h) => !h)} accessibilityRole="checkbox" accessibilityState={{ checked: half }} className="flex-row items-center gap-2" style={{ marginBottom: 8 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: half ? colors.primary : colors.coolDivider, backgroundColor: half ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {half ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text> : null}
                    </View>
                    <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>Half-day — I’ll work the other half <Text style={{ color: colors.coolText, fontWeight: '400' }}>(draws ½ day)</Text></Text>
                  </Pressable>
                ) : null}
                {days > 0 ? <Text style={{ color: colors.coolText, fontSize: 12, marginBottom: 8 }}>{askHalf ? 'Half a day' : `${days} day${days === 1 ? '' : 's'}`} of leave{balance ? ` · balance after approval ≈ ${Math.round((balance.balance - (askHalf ? 0.5 : days)) * 10) / 10}d` : ''}</Text> : null}
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Reason — goes to HR with the application"
                  placeholderTextColor={colors.coolText3}
                  multiline
                  maxLength={500}
                  style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top', marginBottom: 10 }}
                />
                {error && (from || to || reason) ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{error}</Text> : null}
                <SheetSave label={sending ? 'Sending…' : 'Send to HR'} disabled={!!error || sending} onPress={submit} />
                <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center', marginTop: 8 }}>HR approves leave on the ERP — the decision shows below.</Text>
              </View>
            ) : null}

            {/* Trail */}
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>MY APPLICATIONS</Text>
            <View style={{ gap: 8 }}>
              {data.applications.length === 0 ? (
                <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No leave applications yet.</Text>
              ) : data.applications.map((a) => <ApplicationRow key={a.id} app={a} onWithdraw={withdraw} />)}
            </View>
          </>
        )}
      </ScrollView>

      <DaySheet
        visible={picking !== null}
        title={picking === 'to' ? 'Last day of leave' : 'First day of leave'}
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
    <Pressable onPress={onPress} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: value ? colors.primary : colors.coolDivider, backgroundColor: value ? colors.primarySoft : colors.coolBg }}>
      <View className="flex-row items-center gap-1">
        <CalendarDays size={13} color={value ? colors.primary : colors.coolText} />
        <Text style={{ color: value ? colors.primary : colors.coolText, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      </View>
      <Text style={{ color: value ? colors.ink : colors.coolText3, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{value ? dayLabel(value) : 'Pick a day'}</Text>
    </Pressable>
  );
});

const ApplicationRow = memo(function ApplicationRow({ app, onWithdraw }: { app: LeaveApplication; onWithdraw: (a: LeaveApplication) => void }) {
  const c = STATUS_COLORS[app.status] ?? colors.coolText;
  // The decision line: rejection note, or the approval's marked/skipped account.
  const decision = app.status === 'rejected' && app.decisionNote
    ? `Rejected — ${app.decisionNote}`
    : app.status === 'approved'
      ? `Approved · ${app.markedDays.length} day${app.markedDays.length === 1 ? '' : 's'} marked${app.skippedDays.length ? ` · ${app.skippedDays.length} skipped (${app.skippedDays.map((s) => s.reason).join(', ')})` : ''}`
      : null;
  return (
    <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{dayLabel(app.from)}{app.to !== app.from ? ` → ${dayLabel(app.to)}` : ''} · {app.dayType === 'half' ? '½' : app.days}d</Text>
        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: c + '18' }}>
          <Text style={{ color: c, fontSize: 10, fontWeight: '700' }}>{app.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 3 }}>{app.reason}</Text>
      {decision ? <Text style={{ color: c, fontSize: 12, fontWeight: '600', marginTop: 3 }}>{decision}</Text> : null}
      {app.status === 'pending' ? (
        <Pressable onPress={() => onWithdraw(app)} style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.danger + '12' }}>
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>WITHDRAW</Text>
        </Pressable>
      ) : null}
    </View>
  );
});
