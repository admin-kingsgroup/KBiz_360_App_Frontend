import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeftRight, Check, ChevronLeft } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { HrMenuButton } from '../../src/components/hr/HrMenu';
import { SheetSave } from '../../src/components/forms/SheetSave';
import { useUiStore } from '../../src/store/uiStore';
import { ApiError } from '../../src/api/client';
import {
  getSwaps, getSwapOptions, getSwapPartners, requestSwap, respondSwap, cancelSwap,
  type SwapOptions, type SwapPartner, type SwapRequest,
} from '../../src/api/hr';
import { dayLabel } from '../../src/logic/leave';
import {
  awaitsMyAnswer, canWithdrawSwap, incomingAskText, swapChoices, swapDraftError, swapHistory, swapProgressLine, swapStatus, swapWhoText, yourDaysText,
  type SaturdayChoice, type SwapTone,
} from '../../src/logic/swap';

// Swap Saturday (owner, 2026-10-12): "our employee have alternate saturday week off so i want option
// of swapping request so that employee able to swap the saturday week off with another employee".
// Two Saturdays are exchanged: you WORK one of your week-off Saturdays and take one of your working
// Saturdays OFF; your partner does the opposite. The partner accepts here first, then the FM, the
// Director and the Owner approve it on the ERP. The days change only on the final approval.

const TONE_COLOR: Record<SwapTone, string> = {
  pending: colors.orange,
  approved: colors.primary,
  rejected: colors.danger,
  cancelled: colors.coolText3,
};

type Swaps = { mine: SwapRequest[]; incoming: SwapRequest[] };
const errText = (e: unknown, fallback: string): string => (e instanceof ApiError && e.message ? e.message : fallback);
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

export default function SwapScreen() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [options, setOptions] = useState<SwapOptions | null>(null);
  const [swaps, setSwaps] = useState<Swaps | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New-swap draft: step 1 → step 2 → step 3.
  const [workDay, setWorkDay] = useState('');
  const [offDay, setOffDay] = useState('');
  const [partners, setPartners] = useState<SwapPartner[] | null>(null);
  const [partnersError, setPartnersError] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback((): Promise<void> => {
    // The two reads fail independently; the screen needs both, so either failing offers a retry.
    let failed = false;
    const opts = getSwapOptions().then(setOptions).catch(() => { failed = true; });
    const list = getSwaps().then((d) => setSwaps({ mine: d.mine ?? [], incoming: d.incoming ?? [] })).catch(() => { failed = true; });
    return Promise.all([opts, list]).then(() => setLoadFailed(failed));
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = useCallback((): void => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  // Step 3: who can take the other side of this pair (re-read whenever the pair changes — the pick
  // handlers clear the previous answer first, so the list shows a spinner, never a stale pair's people).
  useEffect(() => {
    if (!workDay || !offDay) return;
    let active = true;
    getSwapPartners(workDay, offDay)
      .then((r) => { if (active) setPartners(r.partners ?? []); })
      .catch((e) => { if (active) { setPartners([]); setPartnersError(errText(e, 'Couldn’t load who can swap — try again.')); } });
    return () => { active = false; };
  }, [workDay, offDay]);

  const workChoices = useMemo(() => swapChoices(options?.upcoming, 'work'), [options]);
  const offChoices = useMemo(() => swapChoices(options?.upcoming, 'off', workDay), [options, workDay]);
  const toAnswer = useMemo(() => (swaps?.incoming ?? []).filter(awaitsMyAnswer), [swaps]);
  const history = useMemo(() => swapHistory(swaps?.mine, swaps?.incoming), [swaps]);
  const partner = partners?.find((p) => p.userId === partnerId) ?? null;
  const draftError = swapDraftError({ workDay, offDay, partnerUserId: partnerId, reason });

  const clearPartner = (): void => { setPartnerId(''); setPartners(null); setPartnersError(''); };
  const pickWork = (day: string): void => {
    clearPartner();
    setWorkDay((cur) => (cur === day ? '' : day));
    if (offDay === day) setOffDay('');
  };
  const pickOff = (day: string): void => {
    clearPartner();
    setOffDay((cur) => (cur === day ? '' : day));
  };

  const resetDraft = (): void => { clearPartner(); setWorkDay(''); setOffDay(''); setReason(''); };

  const send = (): void => {
    if (draftError || sending || !partner) return;
    setSending(true);
    requestSwap({ workDay, offDay, partnerUserId: partnerId, reason: reason.trim() })
      .then(() => {
        showToast(`Swap request sent to ${firstName(partner.name)}`);
        resetDraft();
        void load();
      })
      .catch((e) => showToast(errText(e, 'Could not send the swap request')))
      .finally(() => setSending(false));
  };

  const accept = useCallback((r: SwapRequest): void => {
    Alert.alert(
      'Accept this swap?',
      `You’ll be OFF ${dayLabel(r.you.off)} and WORK ${dayLabel(r.you.work)}. It goes to the FM, the Director and the Owner next — your days change only once they approve.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => {
            setBusyId(r.id);
            respondSwap(r.id, true)
              .then(() => { showToast('Swap accepted — sent for approval'); void load(); })
              .catch((e) => showToast(errText(e, 'Could not accept')))
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  }, [load, showToast]);

  const decline = useCallback((r: SwapRequest, note: string): void => {
    setBusyId(r.id);
    respondSwap(r.id, false, note.trim() || undefined)
      .then(() => { showToast(`Swap declined — ${firstName(r.applicant.name)} will be told`); void load(); })
      .catch((e) => showToast(errText(e, 'Could not decline')))
      .finally(() => setBusyId(null));
  }, [load, showToast]);

  const withdraw = useCallback((r: SwapRequest): void => {
    const told = r.partnerStatus === 'accepted' ? ` ${firstName(r.partner.name)} accepted it and will be told.` : '';
    Alert.alert('Withdraw this swap?', `${dayLabel(r.workDay)} ⇄ ${dayLabel(r.offDay)} with ${r.partner.name}.${told}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => {
          setBusyId(r.id);
          cancelSwap(r.id)
            .then(() => { showToast('Swap withdrawn'); void load(); })
            .catch((e) => showToast(errText(e, 'Could not withdraw')))
            .finally(() => setBusyId(null));
        },
      },
    ]);
  }, [load, showToast]);

  const ready = options !== null && swaps !== null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Swap Saturday</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Trade a Saturday off with a colleague</Text>
        </View>
        <HrMenuButton current="swap" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        <View className="flex-row gap-3" style={{ padding: 14, borderRadius: 16, backgroundColor: colors.swap + '10', borderWidth: 1, borderColor: colors.swap + '30', marginBottom: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.swap + '1C', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeftRight size={18} color={colors.swap} />
          </View>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 }}>
            Work one of your Saturdays off and take one of your working Saturdays off instead. Your colleague does the opposite. They accept here first, then the FM, the Director and the Owner approve.
          </Text>
        </View>

        {!ready ? (
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
            {/* Requests for you — a colleague asked; you answer before anyone approves. */}
            {toAnswer.length ? (
              <>
                <SectionTitle text={`REQUESTS FOR YOU (${toAnswer.length})`} />
                <View style={{ gap: 8, marginBottom: 16 }}>
                  {toAnswer.map((r) => <IncomingCard key={r.id} r={r} busy={busyId === r.id} onAccept={accept} onDecline={decline} />)}
                </View>
              </>
            ) : null}

            {/* New swap */}
            <SectionTitle text="NEW SWAP" />
            {!options.canSwap ? (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 16 }}>
                <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>
                  {options.why || 'Saturday swaps are for staff on alternate Saturdays off. Ask HR if your week off should allow one.'}
                </Text>
              </View>
            ) : (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 16 }}>
                <StepLabel n={1} text="Saturday you’ll work" hint="one of your Saturdays off" />
                <DayChips choices={workChoices} picked={workDay} onPick={pickWork} empty="No Saturdays off for you in the next 12 weeks." />

                {workDay ? (
                  <>
                    <StepLabel n={2} text="Saturday you’ll take off" hint="one of your working Saturdays" />
                    <DayChips choices={offChoices} picked={offDay} onPick={pickOff} empty="No working Saturdays for you in the next 12 weeks." />
                  </>
                ) : null}

                {workDay && offDay ? (
                  <>
                    <StepLabel n={3} text="Swap with" hint="free on the first, working on the second" />
                    {partners === null ? (
                      <ActivityIndicator color={colors.primary} style={{ paddingVertical: 10 }} />
                    ) : partnersError ? (
                      <Text style={{ color: colors.danger, fontSize: 12.5, paddingVertical: 6 }}>{partnersError}</Text>
                    ) : partners.length === 0 ? (
                      <Text style={{ color: colors.coolText, fontSize: 12.5, paddingVertical: 6 }}>No one can swap these two Saturdays. Try another pair.</Text>
                    ) : (
                      <View style={{ gap: 6 }}>
                        {partners.map((p) => <PartnerRow key={p.userId} p={p} on={p.userId === partnerId} onPress={() => setPartnerId((cur) => (cur === p.userId ? '' : p.userId))} />)}
                      </View>
                    )}
                  </>
                ) : null}

                {partner ? (
                  <>
                    <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18, marginTop: 12 }}>
                      You work <Text style={{ fontWeight: '700' }}>{dayLabel(workDay)}</Text> and take <Text style={{ fontWeight: '700' }}>{dayLabel(offDay)}</Text> off. {firstName(partner.name)} does the opposite.
                    </Text>
                    <TextInput
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Reason — goes to your colleague and the approvers"
                      placeholderTextColor={colors.coolText3}
                      multiline
                      maxLength={500}
                      style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top', marginTop: 10, marginBottom: 10 }}
                    />
                    {draftError && reason ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{draftError}</Text> : null}
                    <SheetSave label={sending ? 'Sending…' : `Send to ${firstName(partner.name)}`} disabled={!!draftError || sending} onPress={send} />
                    <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                      {firstName(partner.name)} accepts in the app first, then the FM, the Director and the Owner approve.
                    </Text>
                  </>
                ) : null}
              </View>
            )}

            {/* My swaps — asked by me, and the ones I've already answered. */}
            <SectionTitle text="MY SWAPS" />
            <View style={{ gap: 8 }}>
              {history.length === 0 ? (
                <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No swaps yet.</Text>
              ) : history.map((r) => <SwapCard key={r.id} r={r} busy={busyId === r.id} onWithdraw={withdraw} />)}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ text }: { text: string }) {
  return <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>{text}</Text>;
}

function StepLabel({ n, text, hint }: { n: number; text: string; hint: string }) {
  return (
    <View className="flex-row items-center gap-2" style={{ marginTop: n === 1 ? 0 : 14, marginBottom: 8 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{n}</Text>
      </View>
      <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{text}</Text>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.coolText, fontSize: 11.5 }}>· {hint}</Text>
    </View>
  );
}

// Saturdays as chips; one already spoken for stays visible, greyed, with the reason under it.
const DayChips = memo(function DayChips({ choices, picked, onPick, empty }: { choices: SaturdayChoice[]; picked: string; onPick: (day: string) => void; empty: string }) {
  if (!choices.length) return <Text style={{ color: colors.coolText, fontSize: 12.5, paddingVertical: 4 }}>{empty}</Text>;
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {choices.map((c) => {
        const on = c.day === picked;
        return (
          <Pressable key={c.day} onPress={() => c.enabled && onPick(c.day)} disabled={!c.enabled}
            accessibilityRole="button" accessibilityState={{ selected: on, disabled: !c.enabled }}
            accessibilityLabel={`${dayLabel(c.day)}${c.note ? `, ${c.note}` : ''}`}
            style={{ minWidth: 96, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primarySoft : c.enabled ? colors.card : colors.coolMuted, opacity: c.enabled ? 1 : 0.7 }}>
            <Text style={{ color: on ? colors.primary : c.enabled ? colors.ink : colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>{dayLabel(c.day)}</Text>
            {c.note ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 10.5, marginTop: 1 }}>{c.note}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
});

function PartnerRow({ p, on, onPress }: { p: SwapPartner; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} className="flex-row items-center gap-3"
      style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primarySoft : colors.card }}>
      <View className="flex-1">
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
        {p.position ? <Text style={{ color: colors.coolText, fontSize: 12 }}>{p.position}</Text> : null}
      </View>
      {on ? <Check size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

const IncomingCard = memo(function IncomingCard({ r, busy, onAccept, onDecline }: { r: SwapRequest; busy: boolean; onAccept: (r: SwapRequest) => void; onDecline: (r: SwapRequest, note: string) => void }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  return (
    <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.swap + '55' }}>
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600', lineHeight: 20 }}>{incomingAskText(r)}</Text>
      {r.reason ? <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 4 }}>“{r.reason}”</Text> : null}
      <Text style={{ color: colors.coolText, fontSize: 11.5, marginTop: 4 }}>If you accept, it goes to the FM, the Director and the Owner. Nothing changes until they approve.</Text>
      {declining ? (
        <>
          <TextInput value={note} onChangeText={setNote} placeholder={`Note to ${firstName(r.applicant.name)} (optional)`} placeholderTextColor={colors.coolText3}
            multiline maxLength={300} autoFocus
            style={{ minHeight: 56, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 8, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top' }} />
          <View className="flex-row justify-end gap-2" style={{ marginTop: 10 }}>
            <PillButton label="Back" tone="plain" disabled={busy} onPress={() => { setDeclining(false); setNote(''); }} />
            <PillButton label="Decline swap" tone="danger" busy={busy} disabled={busy} onPress={() => onDecline(r, note)} />
          </View>
        </>
      ) : (
        <View className="flex-row justify-end gap-2" style={{ marginTop: 12 }}>
          <PillButton label="Decline" tone="danger" disabled={busy} onPress={() => setDeclining(true)} />
          <PillButton label="Accept" tone="primary" busy={busy} disabled={busy} onPress={() => onAccept(r)} />
        </View>
      )}
    </View>
  );
});

const SwapCard = memo(function SwapCard({ r, busy, onWithdraw }: { r: SwapRequest; busy: boolean; onWithdraw: (r: SwapRequest) => void }) {
  const s = swapStatus(r);
  const c = TONE_COLOR[s.tone];
  const progress = swapProgressLine(r);
  return (
    <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
      <View className="flex-row items-center justify-between gap-2">
        <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 14, fontWeight: '700' }}>{swapWhoText(r)}</Text>
        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: c + '18' }}>
          <Text style={{ color: c, fontSize: 10, fontWeight: '700' }}>{s.label.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={{ color: colors.ink, fontSize: 12.5, marginTop: 3 }}>{yourDaysText(r)}</Text>
      {r.reason ? <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>“{r.reason}”</Text> : null}
      {progress ? <Text style={{ color: s.tone === 'pending' ? colors.orange : c, fontSize: 12, fontWeight: '600', marginTop: 3 }}>{progress}</Text> : null}
      {canWithdrawSwap(r) ? (
        <Pressable onPress={() => onWithdraw(r)} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.danger + '12', opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>WITHDRAW</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

function PillButton({ label, onPress, tone, disabled, busy }: { label: string; onPress: () => void; tone: 'primary' | 'danger' | 'plain'; disabled?: boolean; busy?: boolean }) {
  const bg = tone === 'primary' ? colors.primary : colors.card;
  const fg = tone === 'primary' ? '#fff' : tone === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      className="flex-row items-center gap-1.5"
      style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: bg, borderWidth: tone === 'primary' ? 0 : 1, borderColor: tone === 'danger' ? colors.danger : colors.coolDivider, justifyContent: 'center', opacity: disabled && !busy ? 0.5 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : (
        <>
          {tone === 'primary' ? <Check size={14} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
