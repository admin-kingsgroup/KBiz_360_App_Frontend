import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { erpApi, type ErpApprovalsStatus, type ErpCashPlan, type ErpChangeRequest, type ErpCloseRow, type ErpConcern, type ErpConcernsErp, type ErpMe, type ErpRecordedEvent } from '../../api/erp';
import { ALL_BRANCHES, money } from '../../logic/erpApprovals';
import {
  RR_NOTE, STATUS_COLUMNS, STATUS_SECTIONS, cellsAtFocus, closeLine, closeStage, closeWaitingOn, closesAt, concernStatus, concernsOn, erpConcernGroups, holderName, holderRows,
  payablesOverview, raisedBy, recordedRow, tally, unheld, type ApprovalTab, type ConcernBucket, type EntryPill, type StatusHolder, type StatusTally,
} from '../../logic/erpApprovalTabs';
import { requestSubject, requestTypeLabel, waitingRoles, notRetired } from '../../logic/erpRequests';
import { colors } from '../../theme';

// The read-only tabs of ERP Approvals in the app (2026-11-18): Close, Status, Raise & Resolve and the payables tiles. They show
// what the ERP shows; signing a close and answering a concern stay in the ERP.

export interface ErpRead<T> { data: T | null; loading: boolean; refused: boolean; error: string }
const failure = (e: unknown): { refused: boolean; error: string } => {
  const refused = e instanceof ApiError && e.status === 403;
  return { refused, error: refused ? '' : e instanceof ApiError && e.message ? e.message : 'Could not load' };
};
/** A read made when its tab opens, and again on each pull to refresh (`refresh` changes). */
export function useErpRead<T>(read: () => Promise<T>, deps: unknown[]): ErpRead<T> {
  const [state, setState] = useState<ErpRead<T>>({ data: null, loading: true, refused: false, error: '' });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    read().then((data) => { if (live) setState({ data, loading: false, refused: false, error: '' }); })
      .catch((e) => { if (live) setState({ data: null, loading: false, ...failure(e) }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what the read depends on
  }, deps);
  return state;
}

const Note = ({ children }: { children: ReactNode }) => <Text style={st.note}>{children}</Text>;
const Empty = ({ children }: { children: ReactNode }) => <Text style={st.empty}>{children}</Text>;
const Spinner = () => <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
const TONE = { bad: { bg: '#FEE2E2', fg: colors.danger }, warn: { bg: colors.orange + '22', fg: colors.orange }, ok: { bg: colors.primarySoft, fg: colors.primary }, info: { bg: '#DBEAFE', fg: '#1D4ED8' }, plain: { bg: colors.coolMuted, fg: colors.coolText } };
const Pill = ({ tone, word }: { tone: keyof typeof TONE; word: string }) => <View style={[st.pill, { backgroundColor: TONE[tone].bg }]}><Text style={[st.pillText, { color: TONE[tone].fg }]}>{word}</Text></View>;
function ReadState({ read, what, onRetry }: { read: Pick<ErpRead<unknown>, 'refused' | 'error'>; what: string; onRetry: () => void }) {
  if (read.refused) return <Empty>{what} are not open to your ERP role.</Empty>;
  if (!read.error) return null;
  return <Pressable onPress={onRetry} style={st.error} accessibilityRole="button"><Text style={{ color: colors.danger, fontSize: 12.5 }}>{read.error} — tap to retry</Text></Pressable>;
}
const day = (s?: string): string => {
  const d = s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—';
};

// ── Close ──
export function CloseTab({ read, focus, onRetry }: { read: ErpRead<ErpCloseRow[]>; focus: string; onRetry: () => void }) {
  const rows = useMemo(() => closesAt(read.data ?? [], focus), [read.data, focus]);
  return (
    <>
      <Note>Closes waiting on someone — held for the Owner&apos;s lock, or being checked by the team before the FM signs. They are opened and signed in the ERP.</Note>
      <ReadState read={read} what="Month closes" onRetry={onRetry} />
      {read.loading && !read.data ? <Spinner /> : null}
      {read.data && !rows.length ? <Empty>{focus === ALL_BRANCHES ? 'No close is waiting.' : `No close is waiting at ${focus}.`}</Empty> : null}
      {rows.map((r) => (
        <View key={r.branch} style={st.card}>
          <View style={st.head}><Text style={st.title}>{r.branch}</Text><Pill tone="warn" word={closeStage(r)} /></View>
          <Text style={st.line}>{r.label}</Text>
          {closeLine(r) ? <Text style={st.sub}>{closeLine(r)}</Text> : null}
          <Text style={st.sub}>Waiting on <Text style={st.strong}>{closeWaitingOn(r)}</Text></Text>
        </View>
      ))}
    </>
  );
}

// ── Status ▸ By book & holder ──
type Go = (to: { tab: ApprovalTab; sub?: string; pill?: EntryPill; book?: string }) => void;
function Counts({ t, book, go }: { t: StatusTally; book?: string; go: Go }) {
  const shown = STATUS_COLUMNS.filter((c) => t.by[c.key]);
  if (!shown.length) return null;
  return (
    <View style={st.counts}>
      {shown.map((c) => (
        <Pressable key={c.key} onPress={() => go({ ...c.go, book })} style={st.countChip} accessibilityRole="button" accessibilityLabel={`${c.label}, ${t.by[c.key]}, open`}>
          <Text style={st.countLabel}>{c.label}</Text><Text style={st.countN}>{t.by[c.key]}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const Waiting = ({ t }: { t: StatusTally }) => (t.total
  ? <View style={{ alignItems: 'flex-end' }}><Text style={st.total}>{t.total}</Text>{t.oldest != null ? <Text style={st.sub}>{t.oldest} d</Text> : null}</View>
  : <Pill tone="ok" word="Clear" />);

export function StatusBoard({ read, focus, books, go, onRetry }: { read: ErpRead<ErpApprovalsStatus | null>; focus: string; books: string[]; go: Go; onRetry: () => void }) {
  const all = focus === ALL_BRANCHES;
  const [view, setView] = useState<'branch' | 'user'>('branch');
  const shown = all ? view : 'user';
  const d = read.data;
  const model = useMemo(() => {
    if (!d) return null;
    const cells = cellsAtFocus(d.cells, focus);
    const strays = all ? [...new Set(cells.map((c) => String(c.branch ?? '').toUpperCase()).filter((c) => c && !books.includes(c)))] : [];
    const codes = all ? [...books, ...strays] : [focus];
    const users = holderRows(d, cells, codes);
    const busy = users.filter((u) => u.total > 0).sort((a, b) => b.total - a.total);
    return {
      total: tally(cells), users, busy, gaps: d.rosterUnread ? [] : users.filter(unheld), shared: tally(cells, (c) => !c.branch),
      bookRows: codes.map((code) => ({ code, t: tally(cells, (c) => String(c.branch ?? '').toUpperCase() === code) })),
    };
  }, [d, focus, all, books]);
  return (
    <>
      <Note>What is pending on every approval tab, and with whom. Counts only — tap a count to open its tab.</Note>
      <ReadState read={read} what="The status board and its counts" onRetry={onRetry} />
      {read.loading && !d ? <Spinner /> : null}
      {model ? (
        <>
          <View style={st.tiles}>
            <Tile label="Waiting" value={String(model.total.total)} sub="across the tabs · counts only" />
            <Tile label="With" value={`${model.busy.length} queue${model.busy.length === 1 ? '' : 's'}`} sub={model.busy[0] ? `most on ${holderName(model.busy[0])} (${model.busy[0].total})` : 'nothing waiting'} />
            <Tile label="Oldest wait" value={model.total.oldest == null ? '—' : `${model.total.oldest} days`} sub={all ? 'across the books' : `at ${focus}`} danger={(model.total.oldest ?? 0) >= 30} />
            <Tile label="Stage with no holder" value={String(model.gaps.length)} sub={model.gaps.length ? model.gaps.map((u) => u.book ? `${u.label} · ${u.book}` : u.label).join(', ') : 'every stage is staffed'} />
          </View>
          {d?.unread?.length ? <Note>Some tabs could not be read just now, so these counts may be short.</Note> : null}
          {all ? (
            <View style={st.segment}>
              {([['branch', 'Branch-wise'], ['user', 'User-wise']] as const).map(([k, label]) => (
                <Pressable key={k} onPress={() => setView(k)} style={[st.segmentTab, view === k && st.segmentOn]} accessibilityRole="tab" accessibilityState={{ selected: view === k }}>
                  <Text style={[st.segmentText, view === k && st.segmentTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {shown === 'branch' ? (
            <>
              {model.bookRows.map(({ code, t }) => <Row key={code} title={code} t={t} book={code} go={go} />)}
              {model.shared.total ? <Row title="Group-wide" sub="no one book — counted once" t={model.shared} go={go} /> : null}
              <Row title="TK Group" t={model.total} go={go} />
            </>
          ) : STATUS_SECTIONS.map((s) => {
            const rows = model.users.filter((u) => u.group === s.key);
            if (!rows.length) return null;
            return (
              <View key={s.key}>
                <Text style={st.section}>{s.title.toUpperCase()}</Text>
                <Text style={st.sectionHint}>{s.hint}</Text>
                {rows.map((u) => <Row key={u.key} title={holderName(u)} sub={holderLine(u, all ? 'All books' : focus)} badge={u.badge} t={u} book={u.book || undefined} go={go} />)}
              </View>
            );
          })}
        </>
      ) : null}
    </>
  );
}
const holderLine = (u: StatusHolder, where: string): string => [u.label, u.act, u.book || where, u.people.length > 1 ? `${u.people.length} share this queue` : ''].filter(Boolean).join(' · ');
function Tile({ label, value, sub, danger }: { label: string; value: string; sub: string; danger?: boolean }) {
  return <View style={st.tile}><Text style={st.tileLabel}>{label.toUpperCase()}</Text><Text style={[st.tileValue, danger && { color: colors.danger }]}>{value}</Text><Text style={st.sub}>{sub}</Text></View>;
}
function Row({ title, sub, badge, t, book, go }: { title: string; sub?: string; badge?: string; t: StatusTally; book?: string; go: Go }) {
  return (
    <View style={st.card}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{title}</Text>
          {sub ? <Text style={st.sub}>{badge ? <Text style={st.strong}>{badge} · </Text> : null}{sub}</Text> : null}
        </View>
        <Waiting t={t} />
      </View>
      <Counts t={t} book={book} go={go} />
    </View>
  );
}

// ── Status ▸ Raised by me, Recorded ──
export function RaisedByMe({ pending, me, refresh, onRetry }: { pending: ErpChangeRequest[]; me: ErpMe; refresh: number; onRetry: () => void }) {
  const returned = useErpRead(() => erpApi.changeRequests('returned'), [refresh]);
  const mine = (rows: ErpChangeRequest[]) => rows.filter(notRetired).filter((r) => raisedBy(r, me));
  const back = mine(returned.data ?? []);
  const waiting = mine(pending);
  const row = (r: ErpChangeRequest, isBack: boolean) => {
    const at = new Date(r.updatedAt || r.createdAt || 0).getTime();
    const days = at > 0 ? Math.max(0, Math.floor((Date.now() - at) / 86_400_000)) : null;
    const age = days == null ? '' : ` · ${days} day${days === 1 ? '' : 's'}`;
    return (
      <View key={r._id} style={st.card}>
        <View style={st.head}><Text style={[st.title, { flex: 1 }]}>{requestTypeLabel(r.type)}{r.branch ? ` · ${r.branch}` : ''}</Text><Pill tone={isBack ? 'warn' : 'plain'} word={isBack ? 'Correct and resend' : 'In approval'} /></View>
        {requestSubject(r) ? <Text style={st.line}>{requestSubject(r)}</Text> : null}
        <Text style={st.sub}>{isBack ? `Sent back${r.reason ? ` — ${r.reason}` : ''}` : `Waiting on ${waitingRoles(r).join(' → ') || 'nobody'}`}{age}</Text>
      </View>
    );
  };
  return (
    <>
      <Note>What you asked for and where each stands — and anything sent back to you to correct.</Note>
      <ReadState read={returned} what="Requests sent back" onRetry={onRetry} />
      {returned.loading && !returned.data ? <Spinner /> : null}
      {!returned.loading && !back.length && !waiting.length ? <Empty>Nothing raised by you is waiting.</Empty> : null}
      {back.map((r) => row(r, true))}
      {waiting.map((r) => row(r, false))}
    </>
  );
}
export function RecordedList({ focus, refresh, onRetry }: { focus: string; refresh: number; onRetry: () => void }) {
  const branch = focus === ALL_BRANCHES ? undefined : focus;
  const read = useErpRead<ErpRecordedEvent[]>(() => erpApi.recordedEvents(branch), [branch, refresh]);
  const rows = (read.data ?? []).map(recordedRow);
  return (
    <>
      <Note>Done at once by the BA / Senior Accountant and kept for audit: cheque bounces, client promises, assets seen, ADM disputes dropped.</Note>
      <ReadState read={read} what="Recorded items" onRetry={onRetry} />
      {read.loading && !read.data ? <Spinner /> : null}
      {read.data && !rows.length ? <Empty>Nothing recorded yet.</Empty> : null}
      {rows.map((r) => (
        <View key={r.id} style={st.card}>
          <View style={st.head}><Text style={[st.title, { flex: 1 }]}>{r.what}</Text>{r.amount ? <Text style={st.strong}>{r.amount.toLocaleString('en-IN')}</Text> : null}</View>
          {r.ref ? <Text style={st.line}>{r.ref}</Text> : null}
          <Text style={st.sub}>{[r.at, r.branch, r.by].filter(Boolean).join(' · ')}</Text>
          {r.reason ? <Text style={st.sub}>{r.reason}</Text> : null}
        </View>
      ))}
    </>
  );
}

// ── Raise & Resolve ──
const TYPE_WORD: Record<string, string> = { mismatch: 'Data mismatch', followup: 'Follow-up', question: 'Question', action: 'Action needed' };
const VIEW_ONLY = 'Open and answer concerns in the ERP — opening one there marks it seen, so the app only lists them.';
function ConcernCard({ r }: { r: ErpConcern }) {
  const s = concernStatus(r);
  const who = r.holder?.name || r.to?.name;
  return (
    <View style={st.card}>
      <View style={st.head}><Text style={[st.title, { flex: 1 }]}>{r.title}</Text><Pill tone={s.tone} word={s.word} /></View>
      <Text style={st.sub}>{[r.no != null ? `#${r.no}` : '', TYPE_WORD[r.type ?? ''] ?? r.type, r.book, r.priority === 'urgent' ? 'Urgent' : ''].filter(Boolean).join(' · ')}</Text>
      <Text style={st.sub}>{[r.from?.name ? `From ${r.from.name}` : '', who ? `with ${who}` : '', r.dueDay ? `due ${day(r.dueDay)}` : ''].filter(Boolean).join(' · ')}</Text>
      {r.last?.text ? <Text style={st.sub} numberOfLines={2}>{r.last.name ? `${r.last.name}: ` : ''}{r.last.text}</Text> : null}
    </View>
  );
}
export function ConcernList({ rows, bucket, read, onRetry }: { rows: ErpConcern[]; bucket: ConcernBucket; read: Pick<ErpRead<unknown>, 'loading' | 'refused' | 'error'>; onRetry: () => void }) {
  const list = concernsOn(rows, bucket);
  return (
    <>
      <Note>{RR_NOTE[bucket]} {VIEW_ONLY}</Note>
      <ReadState read={read} what="Concerns" onRetry={onRetry} />
      {read.loading && !list.length ? <Spinner /> : null}
      {!read.loading && !read.refused && !read.error && !list.length ? <Empty>{bucket === 'move' ? 'Nothing needs your move.' : 'Nothing here.'}</Empty> : null}
      {list.map((r) => <ConcernCard key={r.id} r={r} />)}
    </>
  );
}
const OPEN_AT_MOST = 15;
const SHOW_AT_MOST = 50;
export function ErpConcernsList({ focus, refresh, onRetry }: { focus: string; refresh: number; onRetry: () => void }) {
  const branch = focus === ALL_BRANCHES ? undefined : focus;
  const read = useErpRead<ErpConcernsErp>(() => erpApi.erpConcerns({ branch }), [branch, refresh]);
  const groups = useMemo(() => erpConcernGroups(read.data), [read.data]);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  return (
    <>
      <Note>The concerns the ERP raised itself, closed only by the ERP, the night the problem is gone. {VIEW_ONLY}</Note>
      <ReadState read={read} what="ERP Concerns" onRetry={onRetry} />
      {read.loading && !read.data ? <Spinner /> : null}
      {read.data && !groups.length ? <Empty>No ERP Concern is open here.</Empty> : null}
      {groups.map((g) => {
        const open = toggled[g.key] ?? g.rows.length <= OPEN_AT_MOST;
        return (
          <View key={g.key}>
            <Pressable onPress={() => setToggled((t) => ({ ...t, [g.key]: !open }))} style={st.rule} accessibilityRole="button" accessibilityState={{ expanded: open }}>
              <Text style={st.strong}>{g.book} · Rule {g.rule}</Text>
              <Text style={st.sub}>{g.name} · {g.rows.length}{g.late ? ` · ${g.late} late` : ''}</Text>
            </Pressable>
            {open ? g.rows.slice(0, SHOW_AT_MOST).map((r) => <ConcernCard key={r.id} r={r} />) : null}
            {open && g.rows.length > SHOW_AT_MOST ? <Note>{g.rows.length - SHOW_AT_MOST} more in the ERP.</Note> : null}
          </View>
        );
      })}
    </>
  );
}

// ── Pay & Credit ▸ Payment requests: the payables above the "recently approved" list ──
export function PayablesTiles({ focus, refresh }: { focus: string; refresh: number }) {
  const read = useErpRead<ErpCashPlan>(() => erpApi.cashPlan(), [refresh]);
  const [picked, setPicked] = useState<string>();
  const o = useMemo(() => payablesOverview(read.data, focus, picked), [read.data, focus, picked]);
  if (!read.data || !o) return null;
  const m = (n: number) => money(n, o.currency);
  return (
    <>
      {focus === ALL_BRANCHES ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {(read.data.branches ?? []).map((b) => (
            <Pressable key={b.branch} onPress={() => setPicked(b.branch)} style={[st.book, b.branch === o.branch && st.bookOn]} accessibilityRole="tab" accessibilityState={{ selected: b.branch === o.branch }}>
              <Text style={[st.bookText, b.branch === o.branch && { color: '#fff' }]}>{b.branch}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={st.tiles}>
        <Tile label={`Payables · ${o.branch}`} value={m(o.payables)} sub="dated in the books · expenses excluded" />
        <Tile label="Requested (APFP)" value={m(o.requested)} sub={`${o.requestedCount} APFP · in Part 1 of the plan`} />
        <Tile label="Not requested" value={m(o.notRequested)} sub={`${o.payees.length} payee${o.payees.length === 1 ? '' : 's'} · Part 2`} />
        <Tile label="Waiting for a signature" value={String(o.waiting)} sub={`APFP of ${o.branch} waiting to be signed`} danger={o.waiting > 0} />
      </View>
      {o.payees.length ? <Text style={st.section}>NOT REQUESTED YET — PAYEE-WISE</Text> : null}
      {o.payees.map((p) => (
        <View key={p.party} style={st.card}>
          <View style={st.head}><Text style={[st.title, { flex: 1 }]}>{p.party}</Text><Text style={[st.strong, { color: colors.danger }]}>{m(p.amount)}</Text></View>
          {p.kind === 'hub' ? <Text style={st.sub}>hub current account · paid by an HPV, no APFP</Text> : null}
          {p.dueNow > 0.005 && p.ahead > 0.005 ? <Text style={st.sub}>{m(p.dueNow)} due · {m(p.ahead)} not yet due{p.aheadOn ? ` (from ${day(p.aheadOn)})` : ''}</Text> : null}
          <View style={[st.counts, { alignItems: 'center' }]}>
            <Pill tone={p.overdueDays > 0 ? 'bad' : 'plain'} word={p.overdueDays > 0 ? `OVERDUE ${p.overdueDays}d` : p.notYetDue ? 'NOT YET DUE' : 'DUE'} />
            <Text style={st.sub}>Oldest {day(p.dueOn)}</Text>
            {p.reco && p.reco.kind !== 'none' ? <Text style={[st.sub, p.reco.ok === false && { color: colors.danger }]}>Reconciled {p.reco.throughDate ? day(p.reco.throughDate) : 'never'}</Text> : null}
          </View>
        </View>
      ))}
    </>
  );
}

const st = {
  note: { color: colors.coolText, fontSize: 12.5, marginHorizontal: 16, marginTop: 12, lineHeight: 18 },
  empty: { color: colors.coolText, textAlign: 'center' as const, padding: 28, fontSize: 13 },
  error: { marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2' },
  card: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider },
  head: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 10 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
  line: { color: colors.ink, fontSize: 13.5, marginTop: 4 },
  sub: { color: colors.coolText, fontSize: 12, marginTop: 2 },
  strong: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const },
  total: { color: colors.ink, fontSize: 16, fontWeight: '800' as const },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, flexShrink: 1 },
  pillText: { fontSize: 11, fontWeight: '800' as const },
  section: { color: colors.coolText, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4, marginHorizontal: 16, marginTop: 18 },
  sectionHint: { color: colors.coolText3, fontSize: 11.5, marginHorizontal: 16, marginTop: 2 },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginHorizontal: 16, marginTop: 12 },
  tile: { flexGrow: 1, flexBasis: '46%' as const, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider },
  tileLabel: { color: colors.coolText, fontSize: 10.5, fontWeight: '800' as const, letterSpacing: 0.3 },
  tileValue: { color: colors.ink, fontSize: 19, fontWeight: '800' as const, marginTop: 4 },
  counts: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 10 },
  countChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.coolMuted },
  countLabel: { color: colors.coolText, fontSize: 12 },
  countN: { color: colors.primary, fontSize: 12.5, fontWeight: '800' as const },
  segment: { flexDirection: 'row' as const, marginHorizontal: 16, marginTop: 14, padding: 3, borderRadius: 10, backgroundColor: colors.coolMuted },
  segmentTab: { flex: 1, minHeight: 34, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 8 },
  segmentOn: { backgroundColor: colors.card },
  segmentText: { color: colors.coolText, fontSize: 12.5, fontWeight: '600' as const },
  segmentTextOn: { color: colors.ink, fontWeight: '800' as const },
  rule: { marginHorizontal: 16, marginTop: 14, minHeight: 44, padding: 10, borderRadius: 10, backgroundColor: colors.coolMuted },
  book: { minHeight: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.coolDivider, alignItems: 'center' as const, justifyContent: 'center' as const },
  bookOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  bookText: { color: colors.ink, fontSize: 12, fontWeight: '700' as const },
};
