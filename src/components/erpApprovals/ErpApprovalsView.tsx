import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, X } from 'lucide-react-native';
import { ApiError } from '../../api/client';
import {
  erpApi, type ErpChangeRequest, type ErpCloseRow, type ErpCreditRequest, type ErpEntryDetail, type ErpJournal,
  type ErpLeaveApplication, type ErpMe, type ErpPendingEntry, type ErpPendingWork,
} from '../../api/erp';
import {
  ALL_BRANCHES, STAGE_LABEL, actsHere, branchOptions, money, nextErpAction, pendingEntries, stageCounts, toEntryDetail, type ErpChain,
} from '../../logic/erpApprovals';
import { useUiStore } from '../../store/uiStore';
import { colors } from '../../theme';

// ERP approvals inside the app (owner, 2026-10-07): the same five tabs as the ERP's Approvals ▸
// All approvals — Entries, Requests, Credit, HR, Month Close — for a person with ERP access. Every
// read and action goes through the app's backend to the ERP as this person; the ERP applies all of
// its rules and its refusal reason is shown as is. Credit and Month Close are view-only here (the
// ERP signs those on their own screens).

type Tab = 'entries' | 'requests' | 'credit' | 'hr' | 'close';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'entries', label: 'Entries' }, { key: 'requests', label: 'Requests' }, { key: 'credit', label: 'Credit' },
  { key: 'hr', label: 'HR' }, { key: 'close', label: 'Month Close' },
];
const isHrRequest = (r: ErpChangeRequest): boolean => /^hr_/i.test(r.type || '');
const errText = (e: unknown, fallback: string): string => (e instanceof ApiError && e.message ? e.message : fallback);
const roleRefused = (e: unknown): boolean => e instanceof ApiError && e.status === 403;
const prettyType = (t: string): string => String(t || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const day = (s?: string): string => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

interface Loaded<T> { rows: T; refused?: boolean; error?: string }

export function ErpApprovalsView({ me, chain }: { me: ErpMe; chain: ErpChain }) {
  const showToast = useUiStore((s) => s.showToast);
  const options = useMemo(() => branchOptions(me), [me]);
  const [branch, setBranch] = useState<string>(options[0] ?? ALL_BRANCHES);
  const [tab, setTab] = useState<Tab>('entries');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pw, setPw] = useState<Loaded<ErpPendingWork | null>>({ rows: null });
  const [crs, setCrs] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [leave, setLeave] = useState<Loaded<ErpLeaveApplication[]>>({ rows: [] });
  const [credit, setCredit] = useState<Loaded<ErpCreditRequest[]>>({ rows: [] });
  const [close, setClose] = useState<Loaded<ErpCloseRow[]>>({ rows: [] });
  const [open, setOpen] = useState<ErpPendingEntry | null>(null);
  const [asking, setAsking] = useState<{ title: string; cta: string; run: (reason: string) => Promise<unknown> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const scoped = branch === ALL_BRANCHES ? undefined : branch;
  const load = useCallback(async () => {
    const settle = async <T,>(p: Promise<T>, empty: T, set: (v: Loaded<T>) => void) => {
      try { set({ rows: await p }); } catch (e) { set({ rows: empty, refused: roleRefused(e), error: roleRefused(e) ? undefined : errText(e, 'Could not load') }); }
    };
    await Promise.all([
      settle(erpApi.pendingWork(scoped), null, setPw),
      settle(erpApi.changeRequests(), [], setCrs),
      settle(erpApi.leaveApplications(scoped), [], setLeave),
      settle(erpApi.creditRequests(scoped), [], setCredit),
      settle(erpApi.closeBoard(), [], setClose),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [scoped]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const entries = useMemo(() => pendingEntries(pw.rows, branch), [pw.rows, branch]);
  const stages = useMemo(() => stageCounts(entries), [entries]);
  const atBranch = useCallback((b?: string) => branch === ALL_BRANCHES || String(b || '').toUpperCase() === branch, [branch]);
  const requests = useMemo(() => crs.rows.filter((r) => !isHrRequest(r) && atBranch(r.branch)), [crs.rows, atBranch]);
  const hrRequests = useMemo(() => crs.rows.filter((r) => isHrRequest(r) && atBranch(r.branch)), [crs.rows, atBranch]);
  const closeRows = useMemo(() => close.rows.filter((r) => (r.status === 'held' || r.status === 'checking') && atBranch(r.branch)), [close.rows, atBranch]);
  const counts: Record<Tab, number> = { entries: entries.length, requests: requests.length, credit: credit.rows.length, hr: leave.rows.length + hrRequests.length, close: closeRows.length };

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(key);
    try { await run(); showToast(done); await load(); }
    catch (e) { showToast(errText(e, 'The ERP did not accept that')); }
    finally { setBusy(null); }
  };

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

      {/* The five tabs, each with its pending count — as on the ERP. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }} contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.tab, on && st.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[st.tabText, on && st.tabTextOn]}>{t.label}</Text>
              <View style={[st.count, on && st.countOn]}><Text style={[st.countText, on && st.countTextOn]}>{counts[t.key]}</Text></View>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
      >
        {loading ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View> : null}

        {!loading && tab === 'entries' ? (
          <>
            <View style={st.strip}>
              <Text style={st.stripTitle}>PENDING BY STAGE · {branch === ALL_BRANCHES ? 'All branches' : branch} · {stages.total} pending</Text>
              <Text style={st.stripLine}>Check {stages.check}  ·  Verify {stages.verify}  ·  Approve {stages.approve}</Text>
            </View>
            {pw.refused ? refusedNote('Entries') : errorNote(pw.error)}
            {entries.length === 0 && !pw.refused && !pw.error ? <Text style={st.empty}>Nothing is waiting for approval here.</Text> : null}
            {entries.map((e) => {
              const here = actsHere(e, me);
              return (
                <Pressable key={e.id} onPress={() => setOpen(e)} style={st.row} accessibilityRole="button" accessibilityLabel={`Open ${e.ref}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowRef} numberOfLines={1}>{e.ref || e.type}</Text>
                    <Text style={st.rowTitle} numberOfLines={1}>{e.title}</Text>
                    <Text style={st.rowSub} numberOfLines={1}>{[e.sub, e.branch, e.days ? `${e.days}d waiting` : ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {e.amount != null ? <Text style={st.amount}>{money(e.amount, e.currency)}</Text> : null}
                    {here
                      ? <View style={st.stage}><Text style={st.stageText}>{STAGE_LABEL[e.stage] || 'Approve'}</Text></View>
                      : <Text style={st.withText}>⏳ With {e.actionBranch}</Text>}
                  </View>
                  <ChevronRight size={16} color={colors.coolText3} />
                </Pressable>
              );
            })}
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
              const allowed = a.turn?.allowed !== false;
              return (
                <View key={a.id} style={st.card}>
                  <Text style={st.rowRef}>{a.name}{a.branch ? ` · ${a.branch}` : ''}</Text>
                  <Text style={st.rowTitle}>{kind} · {day(a.from)}{a.to && a.to !== a.from ? ` – ${day(a.to)}` : ''}{a.days ? ` · ${a.days} day${a.days === 1 ? '' : 's'}` : ''}</Text>
                  {a.kind === 'time' && (a.checkIn || a.checkOut) ? <Text style={st.rowSub}>In {a.checkIn || '—'} · Out {a.checkOut || '—'}</Text> : null}
                  {a.reason ? <Text style={st.rowSub}>“{a.reason}”</Text> : null}
                  {a.waitingOn ? <Text style={st.rowSub}>Waiting on {a.waitingOn}</Text> : null}
                  {!allowed && a.turn?.why ? <Text style={[st.rowSub, { color: colors.orange }]}>{a.turn.why}</Text> : null}
                  <View style={st.actions}>
                    {a.canReject !== false ? <ActionButton label="Reject" tone="danger" disabled={!!busy} onPress={() => setAsking({ title: `Reject ${kind.toLowerCase()}`, cta: 'Reject', run: (note) => erpApi.decideLeave(a.id, 'reject', note) })} /> : null}
                    <ActionButton label="Approve" disabled={!allowed || !!busy} busy={busy === a.id} onPress={() => void act(a.id, () => erpApi.decideLeave(a.id, 'approve', ''), `${kind} approved`)} />
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
                <Text style={st.rowRef}>{c.name || c.counterparty || 'Credit line'}{c.branch ? ` · ${c.branch}` : ''}</Text>
                <Text style={st.rowTitle}>{prettyType(c.op || c.kind || 'Request')}{c.limit != null ? ` · ${money(c.limit, c.currency)}` : ''}{c.creditDays ? ` · ${c.creditDays} days` : ''}</Text>
                {c.waitingFor ? <Text style={st.rowSub}>Waiting for {c.waitingFor}</Text> : null}
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
                <Text style={st.rowRef}>{r.branch}</Text>
                <Text style={st.rowTitle}>{r.label || [day(r.from), day(r.upTo)].filter(Boolean).join(' – ')}</Text>
                <Text style={[st.rowSub, { color: r.status === 'held' ? colors.orange : colors.coolText }]}>{r.status === 'held' ? 'On hold — signed by the FM, waiting for the Owner to lock' : 'Being checked'}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {open ? <EntrySheet entry={open} me={me} chain={chain} onClose={() => setOpen(null)} onDone={() => { setOpen(null); void load(); }} /> : null}
      {asking ? <ReasonSheet title={asking.title} cta={asking.cta} onClose={() => setAsking(null)} onSubmit={async (reason) => {
        const job = asking;
        setAsking(null);
        await act(job.title, () => job.run(reason), `${job.cta} — done`);
      }} /> : null}
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
      {r.maker?.name ? <Text style={st.rowTitle}>Raised by {r.maker.name}{r.maker.role ? ` (${r.maker.role})` : ''}</Text> : null}
      {summary ? <Text style={st.rowSub}>{summary}</Text> : null}
      {(r.chain ?? []).length ? <Text style={st.rowSub}>{(r.chain ?? []).map((c) => `${c.label || c.role}${signed.includes(c.role) ? ' ✓' : ''}`).join(' → ')}</Text> : null}
      {next ? <Text style={st.rowSub}>Waiting on {next.label || next.role}</Text> : null}
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

// One entry: what it is, who has signed, the would-be journal, and the single next action.
function EntrySheet({ entry, me, chain, onClose, onDone }: { entry: ErpPendingEntry; me: ErpMe; chain: ErpChain; onClose: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const [detail, setDetail] = useState<ErpEntryDetail | null>(null);
  const [journal, setJournal] = useState<ErpJournal | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  // The ERP's refusal ("Awaiting Verify", "Ledger not in BOM's chart"…) is shown IN the sheet: the
  // app's toast host sits under an open Modal, so a toast here would never be seen.
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([erpApi.entry(entry.kind, entry.id), erpApi.journal(entry.kind, entry.id).catch(() => null)])
      .then(([raw, j]) => { if (!alive) return; setDetail(toEntryDetail(entry.kind, raw)); setJournal(j); })
      .catch((e) => { if (alive) setError(errText(e, 'Could not open this entry')); });
    return () => { alive = false; };
  }, [entry.kind, entry.id]);

  const here = actsHere(entry, me);
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
                <View style={st.card}>
                  <Text style={st.rowTitle}>{detail.party || entry.title}</Text>
                  {entry.amount != null ? <Text style={[st.amount, { marginTop: 4 }]}>{money(entry.amount, entry.currency)}</Text> : null}
                  {detail.narration ? <Text style={[st.rowSub, { marginTop: 6 }]}>{detail.narration}</Text> : null}
                  <Text style={[st.rowSub, { marginTop: 8 }]}>Entered by {detail.submittedBy || '—'}</Text>
                  <Text style={st.rowSub}>Checked: {detail.checkedBy ? `${detail.checkedBy}${detail.checkedAt ? ` · ${day(detail.checkedAt)}` : ''}` : 'not yet'}</Text>
                  <Text style={st.rowSub}>Verified: {detail.verifiedBy ? `${detail.verifiedBy}${detail.verifiedAt ? ` · ${day(detail.verifiedAt)}` : ''}` : 'not yet'}</Text>
                </View>
                {journal && journal.postings?.length ? (
                  <View style={st.card}>
                    <Text style={[st.rowRef, { marginBottom: 6 }]}>Journal</Text>
                    {journal.postings.map((p, i) => (
                      <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: colors.coolDivider }}>
                        <Text style={{ flex: 1, color: colors.ink, fontSize: 12.5 }} numberOfLines={2}>{p.ledger}</Text>
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
                {!here ? <Text style={st.note}>⏳ Its next step is given in {actingBranch}, outside your branch access.</Text> : null}
                {here && me.viewOnly ? <Text style={st.note}>Your ERP login is view-only.</Text> : null}
                {here && action && !action.allowed ? <Text style={st.note}>{action.hint}</Text> : null}
                {here && fxBlocked ? <Text style={st.note}>Approving this needs an exchange rate — approve it in the ERP.</Text> : null}
                {actionError ? <View style={[st.error, { marginHorizontal: 0 }]}><Text style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>{actionError}</Text></View> : null}
              </>
            ) : null}
          </ScrollView>
          {detail && here && !me.viewOnly ? (
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

// A reason is required for every refusal — the ERP's screens ask for one too.
function ReasonSheet({ title, cta, onClose, onSubmit }: { title: string; cta: string; onClose: () => void; onSubmit: (reason: string) => void | Promise<void> }) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{title}</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason (required)" placeholderTextColor={colors.coolText3} multiline autoFocus
            style={{ marginTop: 12, minHeight: 80, borderRadius: 10, backgroundColor: colors.coolMuted, padding: 12, color: colors.ink, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <ActionButton label="Cancel" tone="plain" onPress={onClose} />
            <ActionButton label={cta} tone="danger" disabled={!reason.trim()} onPress={() => void onSubmit(reason.trim())} />
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
  strip: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 12, backgroundColor: colors.coolMuted },
  stripTitle: { color: colors.coolText, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4 },
  stripLine: { color: colors.ink, fontSize: 13.5, fontWeight: '700' as const, marginTop: 4 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.coolDivider, backgroundColor: colors.card },
  rowRef: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
  rowTitle: { color: colors.ink, fontSize: 13.5, marginTop: 2 },
  rowSub: { color: colors.coolText, fontSize: 12, marginTop: 2 },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
  stage: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.orange + '22' },
  stageText: { color: colors.orange, fontSize: 11, fontWeight: '800' as const },
  withText: { color: colors.coolText, fontSize: 11.5, fontWeight: '600' as const },
  card: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8, marginTop: 12 },
  empty: { color: colors.coolText, textAlign: 'center' as const, padding: 28, fontSize: 13 },
  note: { color: colors.coolText, fontSize: 12.5, marginHorizontal: 16, marginTop: 12, lineHeight: 18 },
  error: { marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2' },
};
