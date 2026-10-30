import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, X } from 'lucide-react-native';
import { ApiError } from '../../api/client';
import {
  erpApi, type ErpChangeRequest, type ErpCreditRequest, type ErpEntryDetail, type ErpJournal, type ErpLeaveApplication, type ErpMe,
  type ErpPaymentRequestRow, type ErpPendingEntry, type ErpPendingWork,
} from '../../api/erp';
import {
  ALL_BRANCHES, STAGE_LABEL, actsHere, erpText, leaveChainSteps, leaveKindLabel, leaveTags, leaveTurnNote, mayApproveLeave, money, nextErpAction, ownerSignsPast,
  ownerApproveText, isOwnerRole, OWNER_ALL_LEVELS_REASON, awaitingApproval, branchOptions, pendingEntries, swapAwaitingPartner, swapCardLines, swapHoldNote, toEntryDetail,
  type ErpChain, type LeaveTagTone,
} from '../../logic/erpApprovals';
import {
  RECENT_DAYS, allBranchesTotal, approvalsAt, atFocus, branchCounts, chainSteps, isPaymentRequest, isStuck, lastSigner, mayReapply, outsideChainWhy, ownRequestWhy,
  paymentAfterOf, paymentDetailRows, paymentState, paymentSubject, recentSubject, REAPPLY_REASON, signPastLevels, signedWhy, tabCounts, tabTotals, waitingLabel,
} from '../../logic/erpPayables';
import { creditAccount, creditApproveAsk, creditAsked, creditBoxRows, creditButtons, creditContactLines, creditDetailsTitle, creditDoneText, creditMissing, creditOpLabel, creditPartyWord, creditState, creditSteps, isoDay } from '../../logic/erpCredit';
import { useApprovalBadgeStore } from '../../store/approvalBadgeStore';
import { useUiStore } from '../../store/uiStore';
import { colors } from '../../theme';

// ERP approvals inside the app (owner, 2026-10-07) for a person with ERP access. Every read and action goes through
// the app's backend to the ERP as this person; the ERP applies all of its rules and its refusal reason is shown as is.
//
// THREE TABS (owner, 2026-10-29: "in mobile app show Entries, CFM and Request") — the ERP's Approvals folded to five tabs
// the same day (Status · Entries · CFM · Requests · Month Close), and the app carries the three a phone works:
//   Entries   the pending vouchers and SO/PO/GP files (Check → Approve), each opened in a sheet — back in the app after
//             leaving it on 2026-10-09 — and the Below GP Line reviews, as on the ERP's Entries
//   CFM       credit requests, signed here (owner, 2026-10-13)
//   Requests  sub-tabs Payables (first) · HR · Other, as on the ERP (Receivables removed, owner 2026-10-30: "of no use")
// Month Close left the app (it was view-only here; the ERP signs it on its own screen).

type Tab = 'entries' | 'cfm' | 'requests';
const TABS: Array<{ key: Tab; label: string }> = [{ key: 'entries', label: 'Entries' }, { key: 'cfm', label: 'CFM' }, { key: 'requests', label: 'Requests' }];
type Sub = 'payables' | 'hr' | 'other';
const SUBS: Array<{ key: Sub; label: string }> = [
  { key: 'payables', label: 'Payables' }, { key: 'hr', label: 'HR' }, { key: 'other', label: 'Other' },
];
const errText = (e: unknown, fallback: string): string => (e instanceof ApiError && e.message ? e.message : fallback);
const roleRefused = (e: unknown): boolean => e instanceof ApiError && e.status === 403;
const prettyType = (t: string): string => String(t || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const day = (s?: string): string => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const when = (s?: string | null): string => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
};
const ageOf = (s?: string): string => {
  const t = s ? new Date(s).getTime() : NaN;
  if (Number.isNaN(t)) return '';
  const h = Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
  return h < 1 ? 'just now' : h < 48 ? `${h}h waiting` : `${Math.floor(h / 24)}d waiting`;
};

interface Loaded<T> { rows: T; refused?: boolean; error?: string }
interface Asking { title: string; cta: string; tone?: 'primary' | 'danger'; placeholder?: string; run: (reason: string) => Promise<unknown>; done?: string }

export function ErpApprovalsView({ me, chain }: { me: ErpMe; chain: ErpChain }) {
  const showToast = useUiStore((s) => s.showToast);
  const options = useMemo(() => branchOptions(me), [me]);
  const [branch, setBranch] = useState<string>(options[0] ?? ALL_BRANCHES);
  const [tab, setTab] = useState<Tab>('entries');
  const [sub, setSub] = useState<Sub>('payables');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pw, setPw] = useState<Loaded<ErpPendingWork | null>>({ rows: null });
  const [crs, setCrs] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [approvedPay, setApprovedPay] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [recentPay, setRecentPay] = useState<Loaded<ErpPaymentRequestRow[]>>({ rows: [] });
  const [leave, setLeave] = useState<Loaded<ErpLeaveApplication[]>>({ rows: [] });
  const [credit, setCredit] = useState<Loaded<ErpCreditRequest[]>>({ rows: [] });
  const [open, setOpen] = useState<ErpPendingEntry | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const scoped = branch === ALL_BRANCHES ? undefined : branch;
  const load = useCallback(async () => {
    const settle = async <T,>(p: Promise<T>, empty: T, set: (v: Loaded<T>) => void) => {
      try { set({ rows: await p }); } catch (e) { set({ rows: empty, refused: roleRefused(e), error: roleRefused(e) ? undefined : errText(e, 'Could not load') }); }
    };
    await Promise.all([
      // Entries: the Pending Work feed — every branch the person sees, in one read; split here per branch chip.
      settle(erpApi.pendingWork(), null, setPw),
      settle(erpApi.changeRequests(), [], setCrs),
      // Payables, as on the ERP: the payment requests signed off but not applied, and those approved this week.
      settle(erpApi.changeRequests('approved', 'payment_request'), [], setApprovedPay),
      // A server without this read yet (the app backend's ERP route list is older — 404) simply shows no list.
      settle(erpApi.recentlyApprovedPayments(scoped ?? ALL_BRANCHES, RECENT_DAYS).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return [] as ErpPaymentRequestRow[];
        throw e;
      }), [], setRecentPay),
      // HR and Credit are read for every branch and split here, so each branch chip can show its count.
      settle(erpApi.leaveApplications(), [], setLeave),
      settle(erpApi.creditRequests(), [], setCredit),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [scoped]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // The ERP's split: Below GP reviews sit in Entries; Other leaves out HR's types and payment requests.
  // Only the entries waiting for Approve (owner, 2026-10-29) — Check is done on the laptop.
  const allEntries = useMemo(() => awaitingApproval(pendingEntries(pw.rows)), [pw.rows]);
  const lists = useMemo(() => ({ crs: crs.rows, leave: leave.rows, credit: credit.rows, entries: allEntries }), [crs.rows, leave.rows, credit.rows, allEntries]);
  const here = useMemo(() => approvalsAt(lists, branch), [lists, branch]);
  const { entries, margin, payables, requests, hrRequests, leave: leaveRows, credit: creditRows } = here;
  const stuckPay = useMemo(() => atFocus(approvedPay.rows.filter((r) => isPaymentRequest(r) && isStuck(r)), branch), [approvedPay.rows, branch]);
  const screen = tabCounts(here);
  const totals = tabTotals(screen);
  const counts: Record<Tab, number> = { entries: totals.entries, cfm: totals.cfm, requests: totals.requests };
  const subCounts: Record<Sub, number | null> = { payables: screen.payables, hr: screen.hr, other: screen.requests };
  // Each branch chip carries the sum of the badges that branch would show.
  const chipCounts = useMemo(() => branchCounts(lists, options), [lists, options]);
  // The Approvals tab badge carries the all-branches total (plus App requests) — pushed after each load,
  // but not from a list that failed to load (a refused one is a real 0).
  const listFailed = !!(pw.error || crs.error || leave.error || credit.error);
  useEffect(() => {
    if (!loading && !listFailed) useApprovalBadgeStore.getState().setErp(allBranchesTotal(lists));
  }, [lists, loading, listFailed]);

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(key);
    try { await run(); showToast(done); await load(); }
    catch (e) { showToast(errText(e, 'The ERP did not accept that')); }
    finally { setBusy(null); }
  };

  /* A payment request is signed like the ERP signs it: in turn, with a confirm; past a level that has not
     signed, only with a reason (CRED-GATE-03). It is a central act — no acting branch, as the ERP sends none. */
  const actOnPayment = (cr: ErpChangeRequest, action: 'approve' | 'reject' | 'send_back') => {
    if (action === 'approve') {
      const past = signPastLevels(cr, me.role);
      // The Owner approves for every level at once — no reason to type (owner, 2026-10-12).
      if (past.length && isOwnerRole(me.role)) {
        const c = ownerApproveText(past, 'payment request');
        Alert.alert(c.title, c.body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(cr._id, () => erpApi.actChangeRequest(cr._id, 'approve', OWNER_ALL_LEVELS_REASON, ''), 'Payment request approved at every level') }]);
        return;
      }
      if (past.length) {
        setAsking({
          title: `${past.join(' and ')} ${past.length > 1 ? 'have' : 'has'} not signed`,
          placeholder: `Why are you signing past ${past.length > 1 ? 'them' : 'it'}? (e.g. not available)`,
          cta: 'Approve', tone: 'primary', done: 'Payment request approved',
          run: (reason) => erpApi.actChangeRequest(cr._id, 'approve', reason, ''),
        });
        return;
      }
      Alert.alert('Approve this payment request?', paymentSubject(paymentAfterOf(cr), cr.bookCurrency) || 'Payment request', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void act(cr._id, () => erpApi.actChangeRequest(cr._id, 'approve', '', ''), 'Payment request approved') },
      ]);
      return;
    }
    setAsking(action === 'reject'
      ? { title: 'Reject payment request', placeholder: 'Reason for rejection', cta: 'Reject', run: (reason) => erpApi.actChangeRequest(cr._id, 'reject', reason, '') }
      : { title: 'Send back', placeholder: 'What should the maker correct?', cta: 'Send back', run: (reason) => erpApi.actChangeRequest(cr._id, 'send_back', reason, '') });
  };
  /* A request on the Requests / HR tabs. The Owner signing past the levels that have not signed confirms once and the
     app gives the ERP its reason (owner, 2026-10-12); everyone else approves in their own turn, as before. */
  const approveRequest = (r: ErpChangeRequest, confirm: boolean) => {
    const past = isOwnerRole(me.role) ? signPastLevels(r, me.role) : [];
    if (past.length) {
      const c = ownerApproveText(past, 'request');
      Alert.alert(c.title, c.body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', OWNER_ALL_LEVELS_REASON, r.branch), 'Request approved at every level') }]);
      return;
    }
    if (!confirm) { void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Request approved'); return; }
    Alert.alert('Approve this request?', prettyType(r.type), [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Request approved') }]);
  };
  const rerun = (cr: ErpChangeRequest) => Alert.alert('Re-run this change?', 'It was approved already — this applies it, and decides nothing.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Re-run', onPress: () => void act(cr._id, () => erpApi.retryChangeRequest(cr._id), 'Applied') },
  ]);
  const closeStuck = (cr: ErpChangeRequest) => setAsking({
    title: 'Close without applying', placeholder: 'Why? (e.g. duplicate, already paid)', cta: 'Close', done: 'Closed — nothing was changed',
    run: (reason) => erpApi.closeChangeRequest(cr._id, reason),
  });

  /* A credit request is signed as the ERP's Approvals ▸ Credit signs it (Books creditRequestsPanel): the ERP says per row
     whose turn it is; Send back / Reject always ask why; Approve asks what creditApproveAsk says. A central act — no
     acting branch, as for Payables. */
  const actOnCredit = (c: ErpCreditRequest, action: 'approve' | 'reject' | 'send_back') => {
    const name = erpText(c.name) || 'this request';
    if (action !== 'approve') {
      setAsking(action === 'reject'
        ? { title: `Reject “${name}”`, placeholder: `Why is “${name}” rejected?`, cta: 'Reject', done: `${name} rejected`, run: (reason) => erpApi.actChangeRequest(c.id, 'reject', reason, '') }
        : { title: 'Send back', placeholder: `What should the maker correct on “${name}”?`, cta: 'Send back', done: `${name} sent back`, run: (reason) => erpApi.actChangeRequest(c.id, 'send_back', reason, '') });
      return;
    }
    const ask = creditApproveAsk(c);
    const done = creditDoneText(c);
    if (ask.kind === 'reason') {
      setAsking({ title: ask.title, placeholder: ask.placeholder, cta: 'Approve', tone: 'primary', done, run: (reason) => erpApi.actChangeRequest(c.id, 'approve', reason, '') });
      return;
    }
    // The Owner's sign-past carries the app's reason, so the ERP records where it was signed.
    const reason = ask.ownerPast ? OWNER_ALL_LEVELS_REASON : '';
    Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(c.id, () => erpApi.actChangeRequest(c.id, 'approve', reason, ''), done) }]);
  };
  const rerunCredit = (c: ErpCreditRequest) => Alert.alert(`Re-run “${erpText(c.name)}”?`, 'It is approved already — this makes the change, it decides nothing.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Re-run', onPress: () => void act(c.id, () => erpApi.retryChangeRequest(c.id), `${erpText(c.name) || 'Credit request'} applied`) },
  ]);
  const closeCredit = (c: ErpCreditRequest) => setAsking({
    title: `Close “${erpText(c.name)}” without applying`, placeholder: 'Why? (e.g. already created)', cta: 'Close', done: `${erpText(c.name) || 'Credit request'} closed — nothing was changed`,
    run: (reason) => erpApi.closeChangeRequest(c.id, reason),
  });

  const refusedNote = (what: string) => <Text style={st.empty}>{what} are not open to your ERP role.</Text>;
  const errorNote = (msg?: string) => (msg ? <Pressable onPress={() => void load()} style={st.error}><Text style={{ color: colors.danger, fontSize: 12.5 }}>{msg} — tap to retry</Text></Pressable> : null);

  /* A Below GP Line review (owner, 2026-10-29 — a pill of the ERP's Entries): the booking is already posted, so each level
     CONFIRMS or SENDS BACK to the Branch Manager — never rejects. Signed through the ordinary change-request act. */
  const confirmMargin = (r: ErpChangeRequest) => {
    const subject = typeof r.payload?.summary === 'string' ? r.payload.summary : prettyType(r.type);
    Alert.alert('Confirm this booking below the GP line?', subject, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Confirmed') },
    ]);
  };
  const sendBackMargin = (r: ErpChangeRequest) => setAsking({
    title: 'Send back to the Branch Manager', placeholder: 'What should the BM explain or correct?', cta: 'Send back', done: 'Sent back to the BM',
    run: (reason) => erpApi.actChangeRequest(r._id, 'send_back', reason, r.branch),
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Branch focus — the ERP's branch selector, each chip with what waits there. ALL only for an all-branch login. */}
      {options.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.barRow} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}>
          {options.map((b) => {
            const on = b === branch;
            const label = b === ALL_BRANCHES ? 'All branches' : b;
            const n = loading ? null : chipCounts[b] ?? 0;
            return (
              <Pressable key={b} onPress={() => setBranch(b)} style={[st.chip, on && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={n == null ? label : `${label}, ${n} waiting`}>
                <Text style={[st.chipText, on && st.chipTextOn]}>{label}</Text>
                {n != null ? (
                  <View style={[st.chipCount, n > 0 && st.chipCountBusy, on && st.chipCountOn]}>
                    <Text style={[st.chipCountText, n > 0 && st.chipCountTextBusy, on && st.chipCountTextOn]}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* The tabs, each with its pending count — as on the ERP. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[st.barRow, { borderBottomWidth: 1, borderBottomColor: colors.coolDivider }]} contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          const n = counts[t.key];
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.tab, on && st.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[st.tabText, on && st.tabTextOn]}>{t.label}</Text>
              {n != null ? <View style={[st.count, on && st.countOn]}><Text style={[st.countText, on && st.countTextOn]}>{n}</Text></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Requests' sub-tabs, Payables first (owner, 2026-10-29) — as on the ERP. */}
      {tab === 'requests' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.barRow} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, gap: 6 }}>
          {SUBS.map((s) => {
            const on = s.key === sub;
            const n = loading ? null : subCounts[s.key];
            return (
              <Pressable key={s.key} onPress={() => setSub(s.key)} style={[st.chip, on && st.subOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}
                accessibilityLabel={n == null ? s.label : `${s.label}, ${n} waiting`}>
                <Text style={[st.chipText, on && st.subTextOn]}>{s.label}</Text>
                {n != null ? (
                  <View style={[st.chipCount, n > 0 && st.chipCountBusy]}>
                    <Text style={[st.chipCountText, n > 0 && st.chipCountTextBusy]}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
      >
        {loading ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View> : null}

        {!loading && tab === 'entries' ? (
          <>
            <View style={st.strip}>
              <Text style={st.stripTitle}>WAITING FOR APPROVAL · {branch === ALL_BRANCHES ? 'All branches' : branch}</Text>
              <Text style={st.stripLine}>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} to approve — Check is done in the ERP</Text>
            </View>
            {pw.refused ? refusedNote('Entries') : errorNote(pw.error)}
            {entries.length === 0 && !pw.refused && !pw.error ? <Text style={st.empty}>No entry is waiting for approval here.</Text> : null}
            {entries.map((e) => {
              const mine = actsHere(e, me);
              return (
                <Pressable key={e.id} onPress={() => setOpen(e)} style={st.row} accessibilityRole="button" accessibilityLabel={`Open ${e.ref || e.type}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowRef} numberOfLines={1}>{e.ref || e.type}</Text>
                    <Text style={st.rowTitle} numberOfLines={1}>{erpText(e.title)}</Text>
                    <Text style={st.rowSub} numberOfLines={1}>{[erpText(e.sub), e.branch, e.days ? `${e.days}d waiting` : ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {e.amount != null ? <Text style={st.amount}>{money(e.amount, e.currency)}</Text> : null}
                    {mine
                      ? <View style={st.stage}><Text style={st.stageText}>{STAGE_LABEL[e.stage] || 'Approve'}</Text></View>
                      : <Text style={st.withText}>⏳ With {e.actionBranch}</Text>}
                  </View>
                  <ChevronRight size={16} color={colors.coolText3} />
                </Pressable>
              );
            })}

            {/* BELOW GP LINE — the minimum-GP reviews of posted bookings, as on the ERP's Entries (owner, 2026-10-29). */}
            {margin.length || crs.error ? <Text style={st.section}>BELOW GP LINE ({margin.length})</Text> : null}
            {margin.length ? <Text style={st.note}>Already in the books, reviewed after: the BM gives the reason, then FM → Director → Owner confirm. Not accepted → send it back to the BM.</Text> : null}
            {errorNote(crs.error)}
            {margin.map((r) => <MarginCard key={r._id} r={r} busy={busy === r._id} anyBusy={!!busy} onConfirm={() => confirmMargin(r)} onSendBack={() => sendBackMargin(r)} />)}
          </>
        ) : null}

        {!loading && tab === 'requests' && sub === 'payables' ? (
          <>
            <Text style={st.note}>Supplier payment requests raised from the Financial Planning Dashboard. Each card shows who signs and whose turn it is; the supplier is paid only after the last signature.</Text>
            {crs.refused ? refusedNote('Payables') : errorNote(crs.error)}
            {payables.length === 0 && !crs.refused && !crs.error ? <Text style={st.empty}>No payment request is waiting.</Text> : null}
            {payables.map((cr) => <PaymentCard key={cr._id} cr={cr} me={me} busy={busy === cr._id} anyBusy={!!busy} onAct={(a) => actOnPayment(cr, a)} />)}

            {/* Signed off, but the payment request did not go through — nothing has been altered yet. */}
            {errorNote(approvedPay.error)}
            {stuckPay.length ? (
              <View style={[st.card, st.warnCard]}>
                <Text style={[st.rowRef, { color: colors.orange }]}>Approved but not applied ({stuckPay.length})</Text>
                <Text style={[st.rowSub, { lineHeight: 17 }]}>These were signed off, but the change itself did not go through — nothing has been altered yet. Re-running applies the change that was already approved; it decides nothing. When it can never apply, close it — that records that nothing changed.</Text>
                {!mayReapply(me.role) ? <Text style={[st.rowSub, { fontWeight: '700' }]}>{REAPPLY_REASON}</Text> : null}
                {stuckPay.map((cr) => (
                  <View key={cr._id} style={st.stuckRow}>
                    <Text style={st.rowTitle}>{cr.branch || 'group-wide'} · {paymentSubject(paymentAfterOf(cr), cr.bookCurrency) || 'Payment request'}</Text>
                    <Text style={[st.rowSub, { color: colors.danger }]}>{erpText(cr.applyError) ? `Did not apply: ${erpText(cr.applyError)}` : 'Reason not recorded — Re-run once to see it.'}</Text>
                    {mayReapply(me.role) ? (
                      <View style={st.actions}>
                        <ActionButton label="Close" tone="plain" disabled={!!busy} onPress={() => closeStuck(cr)} />
                        <ActionButton label="Re-run" busy={busy === cr._id} disabled={!!busy} onPress={() => rerun(cr)} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {/* Where an approved payment request went — it leaves the list above on its last signature. */}
            {recentPay.error ? <Text style={[st.note, { color: colors.danger }]}>Could not load the recently approved payment requests — {recentPay.error}.</Text> : null}
            {recentPay.rows.length ? (
              <>
                <Text style={st.section}>APPROVED IN THE LAST {RECENT_DAYS} DAYS ({recentPay.rows.length})</Text>
                {recentPay.rows.map((r) => {
                  const s = paymentState(r);
                  const tone = s.tone === 'success' ? colors.primary : s.tone === 'info' ? colors.coolText : colors.orange;
                  const signer = lastSigner(r);
                  return (
                    <View key={r.id} style={st.card}>
                      <Text style={st.rowTitle}><Text style={{ fontWeight: '800' }}>{r.branch}</Text> · {recentSubject(r)}</Text>
                      <Text style={st.rowSub}>raised by {erpText(r.maker?.name) || erpText(r.maker?.userId) || '—'} · approved {when(r.appliedAt)}{signer ? ` by ${signer}` : ''}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                        <View style={[st.badge, { backgroundColor: tone + '22' }]}><Text style={[st.badgeText, { color: tone }]}>{s.word}</Text></View>
                        {r.payment?.vno ? <Text style={[st.rowSub, { marginTop: 0, fontWeight: '700', color: colors.ink }]}>{r.payment.vno}</Text> : null}
                        {s.note ? <Text style={[st.rowSub, { marginTop: 0 }]}>{s.note}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </>
            ) : null}
          </>
        ) : null}

        {!loading && tab === 'requests' && sub === 'other' ? (
          <>
            {crs.refused ? refusedNote('Requests') : errorNote(crs.error)}
            {requests.length === 0 && !crs.refused && !crs.error ? <Text style={st.empty}>No requests are waiting.</Text> : null}
            {requests.map((r) => <RequestRow key={r._id} r={r} busy={busy === r._id} onAct={(action) => {
              if (action === 'approve') {
                approveRequest(r, true);
              } else {
                setAsking({ title: action === 'reject' ? 'Reject request' : 'Send back', cta: action === 'reject' ? 'Reject' : 'Send back', run: (reason) => erpApi.actChangeRequest(r._id, action, reason, r.branch) });
              }
            }} />)}
          </>
        ) : null}

        {!loading && tab === 'requests' && sub === 'hr' ? (
          <>
            {leave.refused ? refusedNote('HR approvals') : errorNote(leave.error)}
            {leaveRows.length === 0 && hrRequests.length === 0 && !leave.refused && !leave.error ? <Text style={st.empty}>No leave or HR requests are waiting.</Text> : null}
            {leaveRows.map((a) => {
              const kind = leaveKindLabel(a.kind);
              // A Saturday swap waits on its partner's Accept in the app before any level signs it
              // (owner, 2026-10-12): Approve shows disabled, with the ERP's reason.
              const swapHold = swapAwaitingPartner(a);
              const swapLines = a.kind === 'swap' ? swapCardLines(a, day) : null;
              // One level at a time (owner, 2026-10-08): Approve only on the viewer's own turn — except the Owner,
              // who may approve at once, signing past the FM / Director who have not (owner, 2026-10-12).
              const myTurn = mayApproveLeave(a.turn, me.role) && !swapHold;
              const ownerPast = ownerSignsPast(a.turn?.past, me.role);
              const steps = leaveChainSteps(a.chain, a.approvals);
              const note = swapHoldNote(a) || leaveTurnNote(a.turn);
              return (
                <View key={a.id} style={st.card}>
                  <View style={st.cardHead}>
                    <Text style={[st.rowRef, { flexShrink: 1 }]}>{erpText(a.name)}{a.branch ? ` · ${erpText(a.branch)}` : ''}</Text>
                    <View style={st.tags}>
                      {leaveTags(a).map((t) => (
                        <View key={t.tone} style={[st.tag, { backgroundColor: TAG_TONE[t.tone].bg, borderColor: TAG_TONE[t.tone].edge }]}>
                          <Text style={[st.tagText, { color: TAG_TONE[t.tone].fg }]}>{t.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {swapLines ? (
                    <>
                      <Text style={st.rowTitle}>{kind} · two Saturdays</Text>
                      <Text style={[st.rowSub, { color: colors.ink }]}>{swapLines.days}</Text>
                      <Text style={[st.rowSub, { color: a.swap?.partner?.status === 'accepted' ? colors.primary : colors.orange, fontWeight: '700' }]}>{swapLines.partner}</Text>
                    </>
                  ) : (
                    <Text style={st.rowTitle}>{kind} · {day(a.from)}{a.to && a.to !== a.from ? ` – ${day(a.to)}` : ''}{a.days ? ` · ${a.days} day${a.days === 1 ? '' : 's'}` : ''}</Text>
                  )}
                  {a.kind === 'time' && (a.checkIn || a.checkOut) ? <Text style={st.rowSub}>In {a.checkIn || '—'} · Out {a.checkOut || '—'}</Text> : null}
                  {erpText(a.reason) ? <Text style={st.rowSub}>“{erpText(a.reason)}”</Text> : null}
                  {steps.length ? <ChainLine steps={steps} /> : null}
                  {erpText(a.waitingOn) ? <Text style={[st.rowSub, { color: colors.danger, fontWeight: '700' }]}>Waiting on {erpText(a.waitingOn)}</Text> : null}
                  {note ? <Text style={[st.rowSub, { color: colors.orange }]}>{note}</Text> : null}
                  <View style={st.actions}>
                    {a.canReject !== false ? <ActionButton label="Reject" tone="danger" disabled={!!busy} onPress={() => setAsking({ title: `Reject ${a.kind === 'swap' ? 'Saturday swap' : kind.toLowerCase()}`, cta: 'Reject', run: (n) => erpApi.decideLeave(a.id, 'reject', n) })} /> : null}
                    {myTurn ? <ActionButton label="Approve" disabled={!!busy} busy={busy === a.id} onPress={() => {
                      if (!ownerPast.length) { void act(a.id, () => erpApi.decideLeave(a.id, 'approve', ''), `${kind} approved`); return; }
                      const c = ownerApproveText(ownerPast, a.kind === 'swap' ? 'Saturday swap' : kind.toLowerCase());
                      Alert.alert(c.title, c.body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(a.id, () => erpApi.decideLeave(a.id, 'approve', OWNER_ALL_LEVELS_REASON), `${kind} approved at every level`) }]);
                    }} /> : null}
                    {swapHold ? <ActionButton label="Approve" disabled onPress={() => undefined} /> : null}
                  </View>
                </View>
              );
            })}
            {hrRequests.map((r) => <RequestRow key={r._id} r={r} busy={busy === r._id} onAct={(action) => {
              if (action === 'approve') approveRequest(r, false);
              else setAsking({ title: action === 'reject' ? 'Reject request' : 'Send back', cta: action === 'reject' ? 'Reject' : 'Send back', run: (reason) => erpApi.actChangeRequest(r._id, action, reason, r.branch) });
            }} />)}
          </>
        ) : null}

        {!loading && tab === 'cfm' ? (
          <>
            <Text style={st.note}>FM reviews → Director confirms → Owner approves — a senior may sign past a level that is not available; nothing reaches the books before the Owner.</Text>
            {credit.refused ? refusedNote('Credit requests') : errorNote(credit.error)}
            {creditRows.length === 0 && !credit.refused && !credit.error ? <Text style={st.empty}>No credit requests are waiting.</Text> : null}
            {creditRows.map((c) => <CreditCard key={c.id} c={c} busy={busy === c.id} anyBusy={!!busy} onAct={(a) => actOnCredit(c, a)} onRerun={() => rerunCredit(c)} onClose={() => closeCredit(c)} />)}
          </>
        ) : null}
      </ScrollView>

      {open ? <EntrySheet entry={open} me={me} chain={chain} onClose={() => setOpen(null)} onDone={() => { setOpen(null); void load(); }} /> : null}
      {asking ? <ReasonSheet title={asking.title} cta={asking.cta} tone={asking.tone} placeholder={asking.placeholder} onClose={() => setAsking(null)} onSubmit={async (reason) => {
        const job = asking;
        setAsking(null);
        await act(job.title, () => job.run(reason), job.done || `${job.cta} — done`);
      }} /> : null}
    </View>
  );
}

// The chain as ticks — "Review (FM) ✓ → Confirm (Director) → Approve (Owner)".
function ChainLine({ steps }: { steps: Array<{ label: string; done: boolean }> }) {
  return (
    <Text style={[st.rowSub, { marginTop: 6 }]}>
      {steps.map((s, i) => (
        <Text key={s.label}>
          {i ? <Text style={{ color: colors.coolText3 }}>{'  →  '}</Text> : null}
          <Text style={{ color: s.done ? colors.primary : colors.coolText, fontWeight: s.done ? '800' : '600' }}>{s.label}{s.done ? ' ✓' : ''}</Text>
        </Text>
      ))}
    </Text>
  );
}

/* One pending payment request, as the ERP's Payables row shows it: who is paid, how much, when, each bill,
   who raised it, the chain, whom it waits on — and only the buttons the ERP would accept from this person,
   with the reason the others are off. */
function PaymentCard({ cr, me, busy, anyBusy, onAct }: { cr: ErpChangeRequest; me: ErpMe; busy: boolean; anyBusy: boolean; onAct: (a: 'approve' | 'reject' | 'send_back') => void }) {
  const a = paymentAfterOf(cr);
  const subject = paymentSubject(a, cr.bookCurrency);
  const rows = paymentDetailRows(a, cr.bookCurrency).filter((r) => r.to || r.from);
  const steps = chainSteps(cr);
  const waiting = waitingLabel(cr);
  const outside = outsideChainWhy(cr, me);
  const approveWhy = outside || ownRequestWhy(cr, me) || signedWhy(cr, me);
  const declineWhy = outside || signedWhy(cr, me, 'decline');
  const why = approveWhy || declineWhy;
  return (
    <View style={st.card}>
      <Text style={st.rowRef}>Payment request{cr.branch ? ` · ${cr.branch}` : ''}</Text>
      {subject ? <Text style={st.rowTitle}>{subject}</Text> : null}
      {rows.length ? (
        <View style={{ marginTop: 6, gap: 2 }}>
          {rows.map((r, i) => (
            <Text key={`${r.label}-${i}`} style={[st.rowSub, { marginTop: 0 }]}>
              <Text>{r.label}: </Text>
              {r.from ? <Text style={{ color: colors.coolText3 }}>{r.from}  →  </Text> : null}
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{r.to}</Text>
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={[st.rowSub, { marginTop: 6 }]}>Raised by {erpText(cr.maker?.name) || erpText(cr.maker?.userId) || '—'}{cr.createdAt ? ` · ${ageOf(cr.createdAt)}` : ''}</Text>
      {steps.length ? <ChainLine steps={steps} /> : null}
      {waiting ? <Text style={[st.rowSub, { color: colors.danger, fontWeight: '700' }]}>Waiting on {waiting}</Text> : null}
      {why ? <Text style={[st.rowSub, { color: colors.orange }]}>{why}</Text> : null}
      {!declineWhy || !approveWhy ? (
        <View style={st.actions}>
          {!declineWhy ? <ActionButton label="Send back" tone="plain" disabled={anyBusy} onPress={() => onAct('send_back')} /> : null}
          {!declineWhy ? <ActionButton label="Reject" tone="danger" disabled={anyBusy} onPress={() => onAct('reject')} /> : null}
          {!approveWhy ? <ActionButton label="Approve" busy={busy} disabled={anyBusy} onPress={() => onAct('approve')} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/* One credit request, as the ERP's Approvals ▸ Credit row shows it: the party, what is asked against what stands, who
   raised it, the three steps — and the buttons the ERP would accept from this person, with its reason when Approve is off.
   An approved one whose change did not go through offers Re-run / Close to the Owner / Super Admin (the ERP's canRetry). */
function CreditCard({ c, busy, anyBusy, onAct, onRerun, onClose }: { c: ErpCreditRequest; busy: boolean; anyBusy: boolean; onAct: (a: 'approve' | 'reject' | 'send_back') => void; onRerun: () => void; onClose: () => void }) {
  // The party's details show OPEN (owner, 2026-10-27: "without knowing the client details how will the owner approve") — a tap hides them.
  const [open, setOpen] = useState(true);
  const contacts = creditContactLines(c);
  const account = creditAccount(c);
  const missing = creditMissing(c);
  const word = creditPartyWord(c);
  const remarks = erpText(c.remarks);
  const toneColor = (t: string) => (t === 'danger' ? colors.dangerText : t === 'good' ? colors.primary : t === 'strong' ? colors.ink : colors.coolText);
  const asked = creditAsked(c);
  const steps = creditSteps(c);
  const state = creditState(c);
  const b = creditButtons(c);
  const maker = typeof c.maker === 'string' ? c.maker : erpText(c.maker?.name) || erpText(c.maker?.userId);
  const fields = creditBoxRows(c);
  // The details box, when it shows, holds the client — the lines above it would say the same twice (owner, 2026-10-30).
  const boxShown = open && fields.length > 0;
  const dial = (phone: string) => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
  return (
    <View style={st.card}>
      <View style={st.cardHead}>
        <Text style={[st.rowRef, { flexShrink: 1 }]}>{erpText(c.name) || erpText(c.counterparty) || 'Credit line'}{c.branch ? ` · ${erpText(c.branch)}` : ''}</Text>
        <View style={st.tags}>
          <View style={[st.tag, { backgroundColor: colors.coolMuted, borderColor: colors.coolDivider }]}><Text style={[st.tagText, { color: colors.coolText }]}>{erpText(c.kind) || creditOpLabel(c)}</Text></View>
          {c.source === 'crm' ? <View style={[st.tag, { backgroundColor: '#EAF1FF', borderColor: '#C9DAFB' }]}><Text style={[st.tagText, { color: '#2457C5' }]}>From CRM</Text></View> : null}
        </View>
      </View>
      <Text style={st.rowTitle}>
        <Text>{creditOpLabel(c)}{c.counterparty && c.counterparty !== c.name ? ` · ${erpText(c.counterparty)}` : ''} · </Text>
        {asked.from ? <Text style={{ color: colors.coolText3 }}>{asked.from}  →  </Text> : null}
        <Text style={{ fontWeight: '700' }}>{asked.to}</Text>
      </Text>
      {asked.warn ? <Text style={[st.rowSub, { color: colors.orange }]}>{asked.warn}</Text> : null}
      {/* Who to call (ERP 2026-10-27): the Reference and the party, each phone a tap to dial; a blank one said in orange.
          Only while the details box is hidden — when it shows, these are in it (owner, 2026-10-30). */}
      {!boxShown && contacts.map((l) => (
        <Text key={l.label} style={st.rowSub}>
          {l.label}{'  '}
          {l.value ? <Text style={{ color: colors.ink, fontWeight: '600' }}>{l.value}</Text> : null}
          {l.value && (l.phone || l.warn) ? ' · ' : null}
          {l.phone ? <Text onPress={() => dial(l.phone)} style={{ color: colors.primary, fontWeight: '700' }}>{l.phone}</Text> : null}
          {l.warn ? <Text style={{ color: colors.orange, fontWeight: '600' }}>{l.warn}</Text> : null}
        </Text>
      ))}
      {account.length ? (
        <Text style={st.rowSub}>
          Account{'  '}
          {account.map((a, i) => (
            <Text key={a.text}>
              {i ? ' · ' : ''}
              <Text style={{ color: toneColor(a.tone), fontWeight: a.tone === 'plain' ? '400' : '700' }}>{a.text}</Text>
            </Text>
          ))}
        </Text>
      ) : null}
      {missing ? <Text style={[st.rowSub, { color: colors.orange, fontWeight: '700' }]}>{missing}</Text> : null}
      {remarks ? (
        <Text style={st.rowSub}>
          Remarks{'  '}<Text style={{ color: colors.ink }}>{remarks}</Text>
          {erpText(c.remarksBy) ? <Text style={{ color: colors.coolText3 }}>{`  — ${erpText(c.remarksBy)}${c.remarksAt ? `, ${isoDay(String(c.remarksAt).slice(0, 10))}` : ''}`}</Text> : null}
        </Text>
      ) : null}
      <Text style={st.rowSub}>
        by {maker || '—'}{c.source === 'crm' ? ' (salesperson, CRM)' : ''}{c.createdAt ? ` · ${ageOf(c.createdAt)}` : ''}
        {fields.length ? <Text onPress={() => setOpen(!open)} style={{ color: colors.orange, fontWeight: '700' }}>{`  ·  ${open ? `Hide ${word ? `${word.toLowerCase()} ` : ''}details` : word ? `${word} details` : 'Details'}`}</Text> : null}
      </Text>
      {boxShown ? (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: colors.coolMuted, gap: 3 }}>
          <Text style={[st.rowSub, { marginTop: 0, fontWeight: '800', color: colors.coolText }]}>{creditDetailsTitle(c)}</Text>
          {fields.map((f) => (
            <Text key={f.key} style={[st.rowSub, { marginTop: 0 }]}>
              {f.label}: {f.value ? <Text style={{ color: colors.ink, fontWeight: '600' }}>{f.value}</Text> : null}
              {f.value && f.phone ? ' · ' : null}
              {f.phone ? <Text onPress={() => dial(f.phone)} style={{ color: colors.primary, fontWeight: '700' }}>{f.phone}</Text> : null}
            </Text>
          ))}
        </View>
      ) : null}
      {steps.length ? (
        <Text style={[st.rowSub, { marginTop: 6 }]}>
          {steps.map((s, i) => (
            <Text key={s.label}>
              {i ? <Text style={{ color: colors.coolText3 }}>{'  →  '}</Text> : null}
              <Text style={{ color: s.done ? colors.primary : s.now ? colors.orange : colors.coolText, fontWeight: s.done || s.now ? '800' : '600' }}>
                {s.label}{s.done ? ' ✓' : ''}{s.skipped ? ' — skipped' : ''}
              </Text>
            </Text>
          ))}
        </Text>
      ) : null}
      {state === 'applying' ? <Text style={[st.rowSub, { color: colors.primary, fontWeight: '700' }]}>Approved — being applied</Text> : null}
      {state === 'failed' || state === 'stuck' ? (
        <>
          <Text style={[st.rowSub, { color: colors.orange, fontWeight: '700' }]}>Approved — the change did not go through{state === 'stuck' ? ' yet' : ''}</Text>
          {erpText(c.applyError) ? <Text style={[st.rowSub, { color: colors.danger }]}>Why: {erpText(c.applyError)}</Text> : null}
        </>
      ) : null}
      {b.why ? <Text style={[st.rowSub, { color: colors.coolText }]}>{b.why}</Text> : null}
      {state === 'stuck' && c.canRetry ? (
        <View style={st.actions}>
          <ActionButton label="Close" tone="plain" disabled={anyBusy} onPress={onClose} />
          <ActionButton label="Re-run" busy={busy} disabled={anyBusy} onPress={onRerun} />
        </View>
      ) : null}
      {state === 'stuck' && !c.canRetry ? <Text style={st.rowSub}>Only the Owner / Super Admin can re-run or close an approved change.</Text> : null}
      {b.approve || b.decline ? (
        <View style={[st.actions, { flexWrap: 'wrap' }]}>
          {b.decline ? <ActionButton label="Send back" tone="plain" disabled={anyBusy} onPress={() => onAct('send_back')} /> : null}
          {b.decline ? <ActionButton label="Reject" tone="danger" disabled={anyBusy} onPress={() => onAct('reject')} /> : null}
          {b.approve ? <ActionButton label={b.label} busy={busy} disabled={anyBusy} onPress={() => onAct('approve')} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function RequestRow({ r, busy, onAct }: { r: ErpChangeRequest; busy: boolean; onAct: (a: 'approve' | 'reject' | 'send_back') => void }) {
  const signed = (r.approvals ?? []).filter((a) => !a.skipped).map((a) => a.role);
  const next = (r.chain ?? []).find((c) => !signed.includes(c.role));
  const summary = typeof r.payload?.summary === 'string' ? r.payload.summary : typeof r.payload?.reason === 'string' ? r.payload.reason : '';
  return (
    <View style={st.card}>
      <Text style={st.rowRef}>{prettyType(r.type)}{r.branch ? ` · ${r.branch}` : ''}</Text>
      {erpText(r.maker?.name) ? <Text style={st.rowTitle}>Raised by {erpText(r.maker?.name)}{r.maker?.role ? ` (${erpText(r.maker.role)})` : ''}</Text> : null}
      {summary ? <Text style={st.rowSub}>{summary}</Text> : null}
      {(r.chain ?? []).length ? <Text style={st.rowSub}>{(r.chain ?? []).map((c) => `${c.label || c.role}${signed.includes(c.role) ? ' ✓' : ''}`).join(' → ')}</Text> : null}
      {next ? <Text style={st.rowSub}>Waiting on {erpText(next.label) || erpText(next.role)}</Text> : null}
      <View style={st.actions}>
        <ActionButton label="Send back" tone="plain" disabled={busy} onPress={() => onAct('send_back')} />
        <ActionButton label="Reject" tone="danger" disabled={busy} onPress={() => onAct('reject')} />
        <ActionButton label="Approve" busy={busy} disabled={busy} onPress={() => onAct('approve')} />
      </View>
    </View>
  );
}

function ActionButton({ label, onPress, disabled, busy, tone = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; tone?: 'primary' | 'danger' | 'plain' }) {
  const bg = tone === 'primary' ? colors.primary : colors.card;
  const fg = tone === 'primary' ? '#fff' : tone === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={{ height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: bg, borderWidth: tone === 'primary' ? 0 : 1, borderColor: tone === 'danger' ? colors.danger : colors.coolDivider, alignItems: 'center', justifyContent: 'center', opacity: disabled && !busy ? 0.45 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );
}

// A reason is required for every refusal — and for signing past a level that has not signed — as on the ERP.
function ReasonSheet({ title, cta, tone = 'danger', placeholder = 'Reason (required)', onClose, onSubmit }: { title: string; cta: string; tone?: 'primary' | 'danger'; placeholder?: string; onClose: () => void; onSubmit: (reason: string) => void | Promise<void> }) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{title}</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder={placeholder} placeholderTextColor={colors.coolText3} multiline autoFocus
            style={{ marginTop: 12, minHeight: 80, borderRadius: 10, backgroundColor: colors.coolMuted, padding: 12, color: colors.ink, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <ActionButton label="Cancel" tone="plain" onPress={onClose} />
            <ActionButton label={cta} tone={tone} disabled={!reason.trim()} onPress={() => void onSubmit(reason.trim())} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// HR card tags: green Paid leave, blue Time correction, orange Leave cancellation, grey Half day,
// cyan Work from home (the WFH hue of the attendance screens), purple Saturday swap.
const TAG_TONE: Record<LeaveTagTone, { bg: string; fg: string; edge: string }> = {
  paid: { bg: colors.primarySoft, fg: colors.primary, edge: '#BFE3DA' },
  time: { bg: '#EAF1FF', fg: '#2457C5', edge: '#C9DAFB' },
  cancel: { bg: '#FDF1DE', fg: '#9A5B0B', edge: '#F2D5A6' },
  half: { bg: colors.coolMuted, fg: colors.coolText, edge: '#E2E5EA' },
  wfh: { bg: '#E3F4F8', fg: colors.wfh, edge: '#B9DFE9' },
  swap: { bg: '#F1EBFD', fg: colors.swap, edge: '#DCCDF8' },
};

/* One pending entry opened (owner, 2026-10-29 — Entries is back in the app): the voucher or SO/PO/GP file, its journal,
   who has stamped it, and the ONE step the viewer may give it now — the ERP's own rule (nextErpAction mirrors Books
   core/approvalChain.jsx nextActionFor). Reject asks why. The ERP decides; its refusal is shown here, in the sheet. */
function EntrySheet({ entry, me, chain, onClose, onDone }: { entry: ErpPendingEntry; me: ErpMe; chain: ErpChain; onClose: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const [detail, setDetail] = useState<ErpEntryDetail | null>(null);
  const [journal, setJournal] = useState<ErpJournal | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  // The ERP's refusal ("Awaiting Check", "Ledger not in BOM's chart"…) is shown IN the sheet: the app's toast host sits
  // under an open Modal, so a toast here would never be seen.
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([erpApi.entry(entry.kind, entry.id), erpApi.journal(entry.kind, entry.id).catch(() => null)])
      .then(([raw, j]) => { if (!alive) return; setDetail(toEntryDetail(entry.kind, raw)); setJournal(j); })
      .catch((e) => { if (alive) setError(errText(e, 'Could not open this entry')); });
    return () => { alive = false; };
  }, [entry.kind, entry.id]);

  const mine = actsHere(entry, me);
  const action = detail ? nextErpAction(detail, me, chain) : null;
  const fxBlocked = !!detail?.approvalNeedsFx && action?.action === 'approve';
  const actingBranch = entry.actionBranch || entry.branch;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setActionError('');
    try { await fn(); showToast(done); onDone(); }
    catch (e) { setActionError(errText(e, 'The ERP did not accept that')); setBusy(false); }
  };
  const doAction = () => {
    if (!action) return;
    if (action.action === 'approve') {
      Alert.alert('Approve & post?', 'This posts the entry to the books.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve & Post', onPress: () => void run(() => erpApi.approve(entry.kind, entry.id, actingBranch), 'Approved and posted') },
      ]);
    } else {
      void run(() => erpApi.review(entry.kind, entry.id, action.action, actingBranch), `${action.label} — done`);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: Math.max(20, insets.bottom + 12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{detail?.number || entry.ref}</Text>
              <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>{[detail?.type || entry.type, entry.branch, day(detail?.date)].filter(Boolean).join(' · ')}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            {error ? <Text style={{ color: colors.danger, padding: 12 }}>{error}</Text> : null}
            {!detail && !error ? <ActivityIndicator style={{ padding: 24 }} color={colors.primary} /> : null}
            {detail ? (
              <>
                <View style={[st.card, { marginHorizontal: 0 }]}>
                  <Text style={st.rowTitle}>{erpText(detail.party) || erpText(entry.title)}</Text>
                  {entry.amount != null ? <Text style={[st.amount, { marginTop: 4 }]}>{money(entry.amount, entry.currency)}</Text> : null}
                  {detail.narration ? <Text style={[st.rowSub, { marginTop: 6 }]}>{erpText(detail.narration)}</Text> : null}
                  <Text style={[st.rowSub, { marginTop: 8 }]}>Entered by {erpText(detail.submittedBy) || '—'}</Text>
                  <Text style={st.rowSub}>Checked: {detail.checkedBy ? `${erpText(detail.checkedBy)}${detail.checkedAt ? ` · ${day(detail.checkedAt)}` : ''}` : 'not yet'}</Text>
                  {detail.verifiedBy ? <Text style={st.rowSub}>Verified: {erpText(detail.verifiedBy)}{detail.verifiedAt ? ` · ${day(detail.verifiedAt)}` : ''}</Text> : null}
                </View>
                {journal && journal.postings?.length ? (
                  <View style={[st.card, { marginHorizontal: 0 }]}>
                    <Text style={[st.rowRef, { marginBottom: 6 }]}>Journal</Text>
                    {journal.postings.map((p, i) => (
                      <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: colors.coolDivider }}>
                        <Text style={{ flex: 1, color: colors.ink, fontSize: 12.5 }} numberOfLines={2}>{erpText(p.ledger)}</Text>
                        <Text style={{ width: 90, textAlign: 'right', color: colors.ink, fontSize: 12.5 }}>{p.debit ? money(p.debit, entry.currency) : ''}</Text>
                        <Text style={{ width: 90, textAlign: 'right', color: colors.ink, fontSize: 12.5 }}>{p.credit ? money(p.credit, entry.currency) : ''}</Text>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.coolDivider }}>
                      <Text style={{ flex: 1, color: colors.coolText, fontSize: 12, fontWeight: '700' }}>Total{journal.balanced === false ? ' · not balanced' : ''}</Text>
                      <Text style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.ink }}>{money(journal.totalDebit, entry.currency)}</Text>
                      <Text style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.ink }}>{money(journal.totalCredit, entry.currency)}</Text>
                    </View>
                  </View>
                ) : null}
                {!mine ? <Text style={[st.note, { marginHorizontal: 0 }]}>⏳ Its next step is given in {actingBranch}, outside your branch access.</Text> : null}
                {mine && me.viewOnly ? <Text style={[st.note, { marginHorizontal: 0 }]}>Your ERP login is view-only.</Text> : null}
                {mine && action && !action.allowed ? <Text style={[st.note, { marginHorizontal: 0 }]}>{action.hint}</Text> : null}
                {mine && fxBlocked ? <Text style={[st.note, { marginHorizontal: 0 }]}>Approving this needs an exchange rate — approve it in the ERP.</Text> : null}
                {actionError ? <View style={[st.error, { marginHorizontal: 0 }]}><Text style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>{actionError}</Text></View> : null}
              </>
            ) : null}
          </ScrollView>
          {detail && mine && !me.viewOnly ? (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8 }}>
              <View style={{ flex: 1 }}><ActionButton label="Reject" tone="danger" disabled={busy} onPress={() => setRejecting(true)} /></View>
              {action ? <View style={{ flex: 2 }}><ActionButton label={action.label} busy={busy} disabled={busy || !action.allowed || fxBlocked} onPress={doAction} /></View> : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
      {rejecting ? <ReasonSheet title={`Reject ${detail?.number || entry.ref}`} cta="Reject" onClose={() => setRejecting(false)} onSubmit={(reason) => { setRejecting(false); void run(() => erpApi.reject(entry.kind, entry.id, reason, actingBranch), 'Rejected'); }} /> : null}
    </Modal>
  );
}

/* One Below GP Line review, as the ERP lists it: the booking, its GP against the floor, why it was flagged, the chain and
   whom it waits on. Confirm or Send back — the booking is already posted, so it is never rejected. */
function MarginCard({ r, busy, anyBusy, onConfirm, onSendBack }: { r: ErpChangeRequest; busy: boolean; anyBusy: boolean; onConfirm: () => void; onSendBack: () => void }) {
  const a = ((r.payload as { after?: Record<string, unknown> } | undefined)?.after ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const gp = num(a.gpPct);
  const floor = num(a.floor);
  const discount = num(a.discount);
  const reasons = Array.isArray(a.reasons) ? (a.reasons as unknown[]).map(erpText).filter(Boolean) : [];
  const steps = chainSteps(r);
  const waiting = waitingLabel(r);
  return (
    <View style={st.card}>
      <Text style={st.rowRef}>{erpText(a.bookingNo) || 'Booking'}{r.branch ? ` · ${r.branch}` : ''}</Text>
      {erpText(a.client) ? <Text style={st.rowTitle}>{erpText(a.client)}</Text> : null}
      <Text style={[st.rowSub, { color: colors.ink, fontWeight: '700' }]}>
        {erpText(a.productLabel) || 'GP'}{gp != null ? ` ${gp}%` : ''}{floor != null ? ` · minimum ${floor}%` : ''}{discount ? ` · discount ${discount}` : ''}
      </Text>
      {reasons.map((x) => <Text key={x} style={st.rowSub}>• {x}</Text>)}
      {erpText(a.consultant) ? <Text style={st.rowSub}>Consultant {erpText(a.consultant)}{r.createdAt ? ` · ${ageOf(r.createdAt)}` : ''}</Text> : null}
      {steps.length ? <ChainLine steps={steps} /> : null}
      {waiting ? <Text style={[st.rowSub, { color: colors.danger, fontWeight: '700' }]}>Waiting on {waiting}</Text> : null}
      <View style={st.actions}>
        <ActionButton label="Send back" tone="plain" disabled={anyBusy} onPress={onSendBack} />
        <ActionButton label="Confirm" busy={busy} disabled={anyBusy} onPress={onConfirm} />
      </View>
    </View>
  );
}

const st = {
  // A horizontal row above the list: ScrollView shrinks by default (flexShrink 1), and a long list below squeezed these rows on
  // Android, cutting the tabs' and chips' bottoms off (owner, 2026-10-30) — same fix as Email's filter row.
  barRow: { flexGrow: 0, flexShrink: 0 },
  chip: { minHeight: 32, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.card, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12.5, fontWeight: '600' as const },
  chipTextOn: { color: '#fff', fontWeight: '700' as const },
  // A branch with work waiting reads green; an empty one stays grey.
  chipCount: { minWidth: 20, minHeight: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.coolMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipCountBusy: { backgroundColor: colors.primarySoft },
  chipCountOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { color: colors.coolText3, fontSize: 11, fontWeight: '700' as const },
  chipCountTextBusy: { color: colors.primary },
  chipCountTextOn: { color: '#fff' },
  tab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.orange },
  tabText: { color: colors.coolText, fontSize: 14, fontWeight: '600' as const },
  tabTextOn: { color: colors.ink, fontWeight: '800' as const },
  count: { minWidth: 22, minHeight: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.coolMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  countOn: { backgroundColor: colors.orange + '33' },
  countText: { color: colors.coolText, fontSize: 11, fontWeight: '700' as const },
  countTextOn: { color: colors.ink },
  rowRef: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
  cardHead: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 10 },
  tags: { flexDirection: 'row' as const, gap: 4, flexShrink: 0 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  tagText: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.2 },
  rowTitle: { color: colors.ink, fontSize: 13.5, marginTop: 2 },
  rowSub: { color: colors.coolText, fontSize: 12, marginTop: 2 },
  card: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider },
  warnCard: { borderColor: colors.orange + '66', backgroundColor: colors.orange + '12' },
  stuckRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.orange + '44' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' as const },
  section: { color: colors.coolText, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4, marginHorizontal: 16, marginTop: 18 },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8, marginTop: 12 },
  empty: { color: colors.coolText, textAlign: 'center' as const, padding: 28, fontSize: 13 },
  emptyBox: { marginHorizontal: 16, marginTop: 16, padding: 20, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: colors.coolDivider, alignItems: 'center' as const, gap: 6 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' as const, textAlign: 'center' as const },
  emptyHint: { color: colors.coolText, fontSize: 12.5, textAlign: 'center' as const, lineHeight: 18 },
  note: { color: colors.coolText, fontSize: 12.5, marginHorizontal: 16, marginTop: 12, lineHeight: 18 },
  error: { marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2' },
  // Entries (back 2026-10-29) and the Requests sub-tabs.
  subOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  subTextOn: { color: '#fff', fontWeight: '700' as const },
  strip: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 12, backgroundColor: colors.coolMuted },
  stripTitle: { color: colors.coolText, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4 },
  stripLine: { color: colors.ink, fontSize: 13.5, fontWeight: '700' as const, marginTop: 4 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.coolDivider, backgroundColor: colors.card },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
  stage: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.orange + '22' },
  stageText: { color: colors.orange, fontSize: 11, fontWeight: '800' as const },
  withText: { color: colors.coolText, fontSize: 11.5, fontWeight: '600' as const },
};
