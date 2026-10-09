import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ApiError } from '../../api/client';
import {
  erpApi, type ErpChangeRequest, type ErpCloseRow, type ErpCreditRequest, type ErpLeaveApplication, type ErpMe, type ErpPaymentRequestRow,
} from '../../api/erp';
import {
  ALL_BRANCHES, erpText, leaveChainSteps, leaveTurnNote, mayApproveLeaveNow, branchOptions, money,
} from '../../logic/erpApprovals';
import {
  RECENT_DAYS, atFocus, chainSteps, isHrRequest, isPaymentRequest, isStuck, lastSigner, mayReapply, outsideChainWhy, ownRequestWhy,
  paymentAfterOf, paymentDetailRows, paymentState, paymentSubject, recentSubject, REAPPLY_REASON, signPastLevels, signedWhy, waitingLabel,
} from '../../logic/erpPayables';
import { useUiStore } from '../../store/uiStore';
import { colors } from '../../theme';

// ERP approvals inside the app (owner, 2026-10-07) for a person with ERP access. The tabs follow the ERP's
// Approvals ▸ All approvals — Receivables, Payables, Requests, Credit, HR, Month Close. Entries is NOT here
// (owner, 2026-10-09: "remove entries section from app"); Receivables and Payables joined the same day,
// "with the same functionality as the ERP". Every read and action goes through the app's backend to the ERP
// as this person; the ERP applies all of its rules and its refusal reason is shown as is. Credit and
// Month Close are view-only here (the ERP signs those on their own screens).

type Tab = 'receivables' | 'payables' | 'requests' | 'credit' | 'hr' | 'close';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'receivables', label: 'Receivables' }, { key: 'payables', label: 'Payables' }, { key: 'requests', label: 'Requests' },
  { key: 'credit', label: 'Credit' }, { key: 'hr', label: 'HR' }, { key: 'close', label: 'Month Close' },
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

export function ErpApprovalsView({ me }: { me: ErpMe }) {
  const showToast = useUiStore((s) => s.showToast);
  const options = useMemo(() => branchOptions(me), [me]);
  const [branch, setBranch] = useState<string>(options[0] ?? ALL_BRANCHES);
  const [tab, setTab] = useState<Tab>('receivables');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [crs, setCrs] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [approvedPay, setApprovedPay] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [recentPay, setRecentPay] = useState<Loaded<ErpPaymentRequestRow[]>>({ rows: [] });
  const [leave, setLeave] = useState<Loaded<ErpLeaveApplication[]>>({ rows: [] });
  const [credit, setCredit] = useState<Loaded<ErpCreditRequest[]>>({ rows: [] });
  const [close, setClose] = useState<Loaded<ErpCloseRow[]>>({ rows: [] });
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const scoped = branch === ALL_BRANCHES ? undefined : branch;
  const load = useCallback(async () => {
    const settle = async <T,>(p: Promise<T>, empty: T, set: (v: Loaded<T>) => void) => {
      try { set({ rows: await p }); } catch (e) { set({ rows: empty, refused: roleRefused(e), error: roleRefused(e) ? undefined : errText(e, 'Could not load') }); }
    };
    await Promise.all([
      settle(erpApi.changeRequests(), [], setCrs),
      // Payables, as on the ERP: the payment requests signed off but not applied, and those approved this week.
      settle(erpApi.changeRequests('approved', 'payment_request'), [], setApprovedPay),
      // A server without this read yet (the app backend's ERP route list is older — 404) simply shows no list.
      settle(erpApi.recentlyApprovedPayments(scoped ?? ALL_BRANCHES, RECENT_DAYS).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return [] as ErpPaymentRequestRow[];
        throw e;
      }), [], setRecentPay),
      settle(erpApi.leaveApplications(scoped), [], setLeave),
      settle(erpApi.creditRequests(scoped), [], setCredit),
      settle(erpApi.closeBoard(), [], setClose),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [scoped]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const atBranch = useCallback((b?: string) => branch === ALL_BRANCHES || String(b || '').toUpperCase() === branch, [branch]);
  // Requests leaves out HR's types (the HR tab) and payment requests (the Payables tab) — the ERP's split.
  const requests = useMemo(() => crs.rows.filter((r) => !isHrRequest(r) && !isPaymentRequest(r) && atBranch(r.branch)), [crs.rows, atBranch]);
  const hrRequests = useMemo(() => crs.rows.filter((r) => isHrRequest(r) && atBranch(r.branch)), [crs.rows, atBranch]);
  const payables = useMemo(() => atFocus(crs.rows.filter(isPaymentRequest), branch), [crs.rows, branch]);
  const stuckPay = useMemo(() => atFocus(approvedPay.rows.filter((r) => isPaymentRequest(r) && isStuck(r)), branch), [approvedPay.rows, branch]);
  const closeRows = useMemo(() => close.rows.filter((r) => (r.status === 'held' || r.status === 'checking') && atBranch(r.branch)), [close.rows, atBranch]);
  // Receivables reads nothing, so it carries no badge (as on the ERP).
  const counts: Record<Tab, number | null> = { receivables: null, payables: payables.length, requests: requests.length, credit: credit.rows.length, hr: leave.rows.length + hrRequests.length, close: closeRows.length };

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
  const rerun = (cr: ErpChangeRequest) => Alert.alert('Re-run this change?', 'It was approved already — this applies it, and decides nothing.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Re-run', onPress: () => void act(cr._id, () => erpApi.retryChangeRequest(cr._id), 'Applied') },
  ]);
  const closeStuck = (cr: ErpChangeRequest) => setAsking({
    title: 'Close without applying', placeholder: 'Why? (e.g. duplicate, already paid)', cta: 'Close', done: 'Closed — nothing was changed',
    run: (reason) => erpApi.closeChangeRequest(cr._id, reason),
  });

  const refusedNote = (what: string) => <Text style={st.empty}>{what} are not open to your ERP role.</Text>;
  const errorNote = (msg?: string) => (msg ? <Pressable onPress={() => void load()} style={st.error}><Text style={{ color: colors.danger, fontSize: 12.5 }}>{msg} — tap to retry</Text></Pressable> : null);

  return (
    <View style={{ flex: 1 }}>
      {/* Branch focus — the ERP's branch selector. ALL only for an all-branch login. */}
      {options.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}>
          {options.map((b) => {
            const on = b === branch;
            return (
              <Pressable key={b} onPress={() => setBranch(b)} style={[st.chip, on && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[st.chipText, on && st.chipTextOn]}>{b === ALL_BRANCHES ? 'All branches' : b}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* The tabs, each with its pending count — as on the ERP. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }} contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}>
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
      >
        {loading ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View> : null}

        {!loading && tab === 'receivables' ? (
          crs.refused ? (
            <View style={st.emptyBox}>
              <Text style={st.emptyTitle}>Receivables — not open to you</Text>
              <Text style={st.emptyHint}>Worked at TK Group by AE / FM / Director / Owner — your role does not open it.</Text>
            </View>
          ) : (
            <>
              <Text style={st.note}>The receivable side of Financial Planning — beside Payables.</Text>
              <View style={st.emptyBox}>
                <Text style={st.emptyTitle}>Nothing is raised for approval on the receivable side yet.</Text>
                <Text style={st.emptyHint}>Supplier payment requests raised from the Financial Planning Dashboard wait on Payables.</Text>
              </View>
            </>
          )
        ) : null}

        {!loading && tab === 'payables' ? (
          <>
            <Text style={st.note}>Supplier payment requests raised from the Financial Planning Dashboard — signed FM → Director → Owner; the supplier is paid only after the Owner signs.</Text>
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

        {!loading && tab === 'requests' ? (
          <>
            {crs.refused ? refusedNote('Requests') : errorNote(crs.error)}
            {requests.length === 0 && !crs.refused && !crs.error ? <Text style={st.empty}>No requests are waiting.</Text> : null}
            {requests.map((r) => <RequestRow key={r._id} r={r} busy={busy === r._id} onAct={(action) => {
              if (action === 'approve') {
                Alert.alert('Approve this request?', prettyType(r.type), [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Request approved') }]);
              } else {
                setAsking({ title: action === 'reject' ? 'Reject request' : 'Send back', cta: action === 'reject' ? 'Reject' : 'Send back', run: (reason) => erpApi.actChangeRequest(r._id, action, reason, r.branch) });
              }
            }} />)}
          </>
        ) : null}

        {!loading && tab === 'hr' ? (
          <>
            {leave.refused ? refusedNote('HR approvals') : errorNote(leave.error)}
            {leave.rows.length === 0 && hrRequests.length === 0 && !leave.refused && !leave.error ? <Text style={st.empty}>No leave or HR requests are waiting.</Text> : null}
            {leave.rows.map((a) => {
              const kind = a.kind === 'time' ? 'Time correction' : a.kind === 'cancel' ? 'Leave cancellation' : 'Leave';
              // One level at a time (owner, 2026-10-08): Approve only on the viewer's own turn.
              const myTurn = mayApproveLeaveNow(a.turn);
              const steps = leaveChainSteps(a.chain, a.approvals);
              const note = leaveTurnNote(a.turn);
              return (
                <View key={a.id} style={st.card}>
                  <Text style={st.rowRef}>{erpText(a.name)}{a.branch ? ` · ${erpText(a.branch)}` : ''}</Text>
                  <Text style={st.rowTitle}>{kind} · {day(a.from)}{a.to && a.to !== a.from ? ` – ${day(a.to)}` : ''}{a.days ? ` · ${a.days} day${a.days === 1 ? '' : 's'}` : ''}</Text>
                  {a.kind === 'time' && (a.checkIn || a.checkOut) ? <Text style={st.rowSub}>In {a.checkIn || '—'} · Out {a.checkOut || '—'}</Text> : null}
                  {erpText(a.reason) ? <Text style={st.rowSub}>“{erpText(a.reason)}”</Text> : null}
                  {steps.length ? <ChainLine steps={steps} /> : null}
                  {erpText(a.waitingOn) ? <Text style={[st.rowSub, { color: colors.danger, fontWeight: '700' }]}>Waiting on {erpText(a.waitingOn)}</Text> : null}
                  {note ? <Text style={[st.rowSub, { color: colors.orange }]}>{note}</Text> : null}
                  <View style={st.actions}>
                    {a.canReject !== false ? <ActionButton label="Reject" tone="danger" disabled={!!busy} onPress={() => setAsking({ title: `Reject ${kind.toLowerCase()}`, cta: 'Reject', run: (n) => erpApi.decideLeave(a.id, 'reject', n) })} /> : null}
                    {myTurn ? <ActionButton label="Approve" disabled={!!busy} busy={busy === a.id} onPress={() => void act(a.id, () => erpApi.decideLeave(a.id, 'approve', ''), `${kind} approved`)} /> : null}
                  </View>
                </View>
              );
            })}
            {hrRequests.map((r) => <RequestRow key={r._id} r={r} busy={busy === r._id} onAct={(action) => {
              if (action === 'approve') void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Request approved');
              else setAsking({ title: action === 'reject' ? 'Reject request' : 'Send back', cta: action === 'reject' ? 'Reject' : 'Send back', run: (reason) => erpApi.actChangeRequest(r._id, action, reason, r.branch) });
            }} />)}
          </>
        ) : null}

        {!loading && tab === 'credit' ? (
          <>
            <Text style={st.note}>Credit requests are signed in the ERP’s Credit Facility Management. They are listed here so you can see what waits on you.</Text>
            {credit.refused ? refusedNote('Credit requests') : errorNote(credit.error)}
            {credit.rows.length === 0 && !credit.refused && !credit.error ? <Text style={st.empty}>No credit requests are waiting.</Text> : null}
            {credit.rows.map((c) => (
              <View key={c.id} style={st.card}>
                <Text style={st.rowRef}>{erpText(c.name) || erpText(c.counterparty) || 'Credit line'}{c.branch ? ` · ${erpText(c.branch)}` : ''}</Text>
                <Text style={st.rowTitle}>{prettyType(c.op || c.kind || 'Request')}{c.limit != null ? ` · ${money(c.limit, c.currency)}` : ''}{c.creditDays ? ` · ${c.creditDays} days` : ''}</Text>
                {erpText(c.waitingFor) ? <Text style={st.rowSub}>Waiting for {erpText(c.waitingFor)}</Text> : null}
                {c.yourTurn ? <Text style={[st.rowSub, { color: colors.primary, fontWeight: '700' }]}>Your turn to sign</Text> : null}
              </View>
            ))}
          </>
        ) : null}

        {!loading && tab === 'close' ? (
          <>
            <Text style={st.note}>Month Close is signed and locked in the ERP. Branches whose close is being checked or is on hold are listed here.</Text>
            {close.refused ? refusedNote('Month Close') : errorNote(close.error)}
            {closeRows.length === 0 && !close.refused && !close.error ? <Text style={st.empty}>No month close is waiting.</Text> : null}
            {closeRows.map((r) => (
              <View key={`${r.branch}-${r.upTo}`} style={st.card}>
                <Text style={st.rowRef}>{erpText(r.branch)}</Text>
                <Text style={st.rowTitle}>{erpText(r.label) || [day(r.from), day(r.upTo)].filter(Boolean).join(' – ')}</Text>
                <Text style={[st.rowSub, { color: r.status === 'held' ? colors.orange : colors.coolText }]}>{r.status === 'held' ? 'On hold — signed by the FM, waiting for the Owner to lock' : 'Being checked'}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

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

const st = {
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.card, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12.5, fontWeight: '600' as const },
  chipTextOn: { color: '#fff', fontWeight: '700' as const },
  tab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.orange },
  tabText: { color: colors.coolText, fontSize: 14, fontWeight: '600' as const },
  tabTextOn: { color: colors.ink, fontWeight: '800' as const },
  count: { minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.coolMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  countOn: { backgroundColor: colors.orange + '33' },
  countText: { color: colors.coolText, fontSize: 11, fontWeight: '700' as const },
  countTextOn: { color: colors.ink },
  rowRef: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
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
};
