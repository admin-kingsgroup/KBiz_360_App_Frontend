import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { Modal } from '../ui/Modal';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, X } from 'lucide-react-native';
import { ApiError } from '../../api/client';
import {
  erpApi, type ErpChangeRequest, type ErpCreditRequest, type ErpEditRequest, type ErpEntryDetail, type ErpJournal, type ErpLeaveApplication, type ErpMe,
  type ErpApprovalsStatus, type ErpCloseRow, type ErpConcernsErp, type ErpConcernsMine, type ErpHubCounts, type ErpPaymentRequestRow, type ErpPendingEntry, type ErpPendingWork,
} from '../../api/erp';
import {
  ALL_BRANCHES, STAGE_LABEL, actsHere, erpText, leaveChainSteps, leaveKindLabel, leaveTags, leaveTurnNote, mayApproveLeave, money, nextErpAction, ownerSignsPast,
  ownerApproveText, isOwnerRole, OWNER_ALL_LEVELS_REASON, awaitingApproval, awaitingCheck, branchOptions, CHECK_IN_ERP_NOTE, isCheckStage, pendingEntries, swapAwaitingPartner, swapCardLines, swapHoldNote, toEntryDetail,
  type ErpChain, type LeaveTagTone,
} from '../../logic/erpApprovals';
import {
  RECENT_DAYS, allBranchesTotal, approvalsAt, atFocus, branchCounts, chainRoleOf, entriesAtFocus, chainSteps, isHrRequest, isMarginReview, isPaymentRequest, isStuck, lastSigner, mayReapply, outsideChainWhy, ownRequestWhy,
  paymentAfterOf, paymentDetailRows, paymentState, paymentSubject, recentSubject, REAPPLY_REASON, signPastLevels, signedWhy, tabCounts, tabTotals, waitingLabel, waitingOnMe,
} from '../../logic/erpPayables';
import {
  ENTRY_PILLS, PARTY_BANK_TYPES, SUBTABS, cellsAtFocus, closesOwed, concernsAt, entriesOnPill, hasSubTabs, placeOf, rrBadge, setupRows, supplierBankRows, tally,
  type ApprovalTab, type ConcernBucket, type EntryPill, type SubTabOwner,
} from '../../logic/erpApprovalTabs';
import { CloseTab, ConcernList, ErpConcernsList, PayablesTiles, RaisedByMe, RecordedList, StatusBoard, type ErpRead } from './ErpReadTabs';
import { About, ApprovalsHeader, BranchPicker, HomeList } from './ApprovalsHome';
import { HOME_TITLE, homeMine, homeRows, type HomeKey } from '../../logic/erpApprovalHome';
import { entryRequestGroups, requestChanges, requestGates, requestHeadline, requestSubject, requestTypeLabel } from '../../logic/erpRequests';
import { creditAccount, creditApproveAsk, creditAsked, creditBoxRows, creditButtons, creditContactLines, creditDetailsTitle, creditDoneText, creditMissing, creditOpLabel, creditPartyWord, creditState, creditSteps, isoDay } from '../../logic/erpCredit';
import { useApprovalBadgeStore } from '../../store/approvalBadgeStore';
import { reviewNewCount, useOwnerReviewStore } from '../../store/ownerReviewStore';
import { REVIEW_DAYS, decidedAgo, decisionAmount, decisionTitle, isNewDecision, seenFrom, sortDecisions } from '../../logic/ownerReview';
import type { ErpDirectorDecision } from '../../api/erp';
import { useUiStore } from '../../store/uiStore';
import { colors } from '../../theme';

// ERP approvals inside the app (owner, 2026-10-07) for a person with ERP access. Every read and action goes through
// the app's backend to the ERP as this person; the ERP applies all of its rules and its refusal reason is shown as is.
//
// THE ERP'S SECTIONS, in its order and with its sub-tabs (owner, 2026-11-18: "exact same, same order"): Entries · Pay & Credit ·
// HR & Payroll · Setup · Close · Status · Raise & Resolve (logic/erpApprovalTabs). The app signs what it signed before;
// Close, Status and Raise & Resolve are read-only here (ErpReadTabs). The Owner keeps Review after them (the widget's Review tile).
//
// ONE HOME LIST, NOT A TAB STRIP (owner, 2026-11-19: "a lot of extra stuff"): the screen opens on the sections as a list, what
// needs this person on top (ApprovalsHome, logic/erpApprovalHome). It is the old "Waiting on me" tab — `tab === 'mine'` is the
// home — and a section opens from it with a back button. The branch is one dropdown; the rule text is behind a tap.

export type Tab = ApprovalTab;
const ENTRY_APPROVER_ROLES = ['FinanceManager', 'Owner', 'AccountsExecutive', 'Senior Branch Accountant'];
const FIRST_SUBS: Record<SubTabOwner, string> = { pay: 'payables', setup: 'settings', status: 'board', rr: 'move' };
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

/** A horizontal strip keeps its chosen item in view: eight tabs and 24 pills do not fit a phone, and a link can open a later one. */
function useStripFollows(active: string) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const xs = useRef<Record<string, number>>({});
  const show = useCallback((key: string) => {
    const x = xs.current[key];
    if (x != null) ref.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, []);
  useEffect(() => { show(active); }, [active, show]);
  const onItemLayout = (key: string) => (e: LayoutChangeEvent) => {
    xs.current[key] = e.nativeEvent.layout.x;
    if (key === active) show(key);
  };
  return { ref, onItemLayout };
}

function ChipStrip({ items, active, onPick, countOf, hideZero = false }: { items: ReadonlyArray<{ key: string; label: string }>; active: string; onPick: (key: string) => void; countOf: (key: string) => number | null; hideZero?: boolean }) {
  const strip = useStripFollows(active);
  return (
    <ScrollView ref={strip.ref} horizontal showsHorizontalScrollIndicator={false} style={st.barRow} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, gap: 6 }}>
      {items.map((s) => {
        const on = s.key === active;
        const n = countOf(s.key);
        return (
          <Pressable key={s.key} onLayout={strip.onItemLayout(s.key)} onPress={() => onPick(s.key)} style={[st.chip, on && st.subOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={n == null ? s.label : `${s.label}, ${n} waiting`}>
            <Text style={[st.chipText, on && st.subTextOn]}>{s.label}</Text>
            {n != null && (n > 0 || !hideZero) ? (
              <View style={[st.chipCount, n > 0 && st.chipCountBusy]}><Text style={[st.chipCountText, n > 0 && st.chipCountTextBusy]}>{n}</Text></View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface Loaded<T> { rows: T; refused?: boolean; error?: string }
interface Asking { title: string; cta: string; tone?: 'primary' | 'danger'; placeholder?: string; run: (reason: string) => Promise<unknown>; done?: string }

export function ErpApprovalsView({ me, chain, openTab, openSub, appPending, onOpenApp }: {
  me: ErpMe; chain: ErpChain; openTab?: string; openSub?: string;
  /** The app's own requests: how many wait, and how the home list's last row opens them. */
  appPending?: number; onOpenApp?: () => void;
}) {
  const showToast = useUiStore((s) => s.showToast);
  const options = useMemo(() => branchOptions(me), [me]);
  const [branch, setBranch] = useState<string>(options[0] ?? ALL_BRANCHES);
  const owner = isOwnerRole(me.role);
  const place = useMemo(() => { const p = placeOf(openTab, openSub); return p && (p.tab !== 'review' || owner) ? p : null; }, [openTab, openSub, owner]);
  const [tab, setTab] = useState<Tab>(place?.tab ?? 'mine');
  const [subs, setSubs] = useState<Record<SubTabOwner, string>>(() => ({ ...FIRST_SUBS, ...(place?.sub && hasSubTabs(place.tab) ? { [place.tab]: place.sub } : {}) }));
  const [pill, setPill] = useState<EntryPill>('all');
  const go = useCallback((to: { tab: Tab; sub?: string; pill?: EntryPill; book?: string }) => {
    setTab(to.tab);
    const owns = to.tab;
    if (to.sub && hasSubTabs(owns)) setSubs((c) => ({ ...c, [owns]: to.sub as string }));
    if (to.tab === 'entries') setPill(to.pill ?? 'all');
    if (to.book) setBranch(to.book);
  }, []);
  // A link that names a tab (the widget's Review tile) opens it, also when this screen is already mounted.
  useEffect(() => { if (place) go(place); }, [place, go]);
  // Android's back button leaves a section for the home list — only while this tab is the one on screen.
  useFocusEffect(useCallback(() => {
    if (tab === 'mine') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setTab('mine'); return true; });
    return () => sub.remove();
  }, [tab]));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pw, setPw] = useState<Loaded<ErpPendingWork | null>>({ rows: null });
  const [crs, setCrs] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [approvedPay, setApprovedPay] = useState<Loaded<ErpChangeRequest[]>>({ rows: [] });
  const [recentPay, setRecentPay] = useState<Loaded<ErpPaymentRequestRow[]>>({ rows: [] });
  const [leave, setLeave] = useState<Loaded<ErpLeaveApplication[]>>({ rows: [] });
  const [credit, setCredit] = useState<Loaded<ErpCreditRequest[]>>({ rows: [] });
  const [edits, setEdits] = useState<Loaded<ErpEditRequest[]>>({ rows: [] });
  const [closes, setCloses] = useState<Loaded<ErpCloseRow[]>>({ rows: [] });
  const [statusBoard, setStatusBoard] = useState<Loaded<ErpApprovalsStatus | null>>({ rows: null });
  const [concerns, setConcerns] = useState<Loaded<ErpConcernsMine | null>>({ rows: null });
  const [erpConcernCounts, setErpConcernCounts] = useState<Loaded<ErpConcernsErp | null>>({ rows: null });
  const [hubCounts, setHubCounts] = useState<Loaded<ErpHubCounts | null>>({ rows: null });
  const [refresh, setRefresh] = useState(0);
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
      settle(erpApi.editRequests(), [], setEdits),
      // The tabs' badges: Close, Status and Raise & Resolve read what their own screens read.
      settle(erpApi.closeBoard(), [], setCloses),
      settle(erpApi.approvalsStatus(), null, setStatusBoard),
      settle(erpApi.concernsMine(), null, setConcerns),
      settle(erpApi.erpConcerns({ counts: true }), null, setErpConcernCounts),
      settle(erpApi.hubCounts(scoped), null, setHubCounts),
      // The Owner's Review reads its own list (store) — pulled with the rest.
      owner ? useOwnerReviewStore.getState().refresh() : Promise.resolve(),
    ]);
    setRefresh((n) => n + 1);
    setLoading(false);
    setRefreshing(false);
  }, [scoped, owner]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // REVIEW (owner, 2026-10-30): opening the tab marks everything listed as seen — the count and the widget go back to 0 —
  // while this visit still marks what was new when it opened.
  const review = useOwnerReviewStore();
  const reviewRows = useMemo(() => sortDecisions(review.rows), [review.rows]);
  const [reviewFrom, setReviewFrom] = useState<number | null>(null);
  useEffect(() => {
    if (tab !== 'review') { setReviewFrom(null); return; }
    if (!review.loaded || reviewFrom != null) return;
    setReviewFrom(seenFrom(useOwnerReviewStore.getState().lastSeen, Date.now()));
    useOwnerReviewStore.getState().markSeen();
  }, [tab, review.loaded, reviewFrom]);

  // The ERP's split: Below GP reviews sit in Entries; Other leaves out HR's types and payment requests.
  // Only the entries waiting for Approve are listed for action (owner, 2026-10-29) — Check is done on the laptop. The ones
  // waiting for Check are shown too, view-only and off every badge (owner, 2026-11-03).
  const allPending = useMemo(() => pendingEntries(pw.rows), [pw.rows]);
  const allEntries = useMemo(() => awaitingApproval(allPending), [allPending]);
  const checkAll = useMemo(() => awaitingCheck(allPending), [allPending]);
  const checkHere = useMemo(() => entriesAtFocus(checkAll, branch), [checkAll, branch]);
  const lists = useMemo(() => ({ crs: crs.rows, leave: leave.rows, credit: credit.rows, entries: allEntries, edits: edits.rows }), [crs.rows, leave.rows, credit.rows, allEntries, edits.rows]);
  const here = useMemo(() => approvalsAt(lists, branch), [lists, branch]);
  const { entries, margin, entryRequests, transit, edits: editRows, payables, requests, hrRequests, leave: leaveRows, credit: creditRows } = here;
  const entryGroups = useMemo(() => entryRequestGroups(entryRequests, transit), [entryRequests, transit]);
  const mine = useMemo(() => waitingOnMe(lists, branch, me), [lists, branch, me]);
  const stuckPay = useMemo(() => atFocus(approvedPay.rows.filter((r) => isPaymentRequest(r) && isStuck(r)), branch), [approvedPay.rows, branch]);
  const screen = tabCounts(here);
  const totals = tabTotals(screen);
  const closeOwed = closes.error || closes.refused ? 0 : closesOwed(closes.rows, branch, me.role);
  const rr = useMemo(() => rrBadge(concerns.rows, erpConcernCounts.rows, branch), [concerns.rows, erpConcernCounts.rows, branch]);
  const concernLists = useMemo(() => concernsAt(concerns.rows, branch), [concerns.rows, branch]);
  const statusTotal = statusBoard.rows ? tally(cellsAtFocus(statusBoard.rows.cells, branch)).total : null;
  // A tab whose read failed or is shut shows no figure, never a 0 (as on the ERP).
  const counts: Record<Tab, number | null> = {
    mine: mine.total + closeOwed, entries: totals.entries, pay: screen.payables + screen.credit, hr: screen.hr, setup: screen.requests,
    close: closes.error || closes.refused ? null : closeOwed, status: statusTotal, rr: concerns.rows && erpConcernCounts.rows ? rr.n : null, review: reviewNewCount(review),
  };
  const setupList = useMemo(() => setupRows(requests, subs.setup), [requests, subs.setup]);
  const bankRows = useMemo(() => supplierBankRows(requests), [requests]);
  const subCounts: Record<string, number | null> = { payables: screen.payables, bank: bankRows.length, credit: screen.credit, settings: setupRows(requests, 'settings').length, masters: setupRows(requests, 'masters').length,
    targets: setupRows(requests, 'targets').length, other: setupRows(requests, 'other').length, board: statusTotal, ...concernLists.counts, erp: erpConcernCounts.rows ? rr.n - concernLists.rows.filter((r) => r.from?.desk !== 'erp' && (r.bucket === 'move' || r.bucket === 'wait' || r.bucket === 'cc')).length : null };
  const pillCount = (k: EntryPill): number => {
    if (k === 'all') return entries.length + editRows.length;
    if (k === 'edits') return editRows.length;
    if (k === 'below-gp') return margin.length;
    if (k === 'pairs') return Number(hubCounts.rows?.settlements?.pending) || 0;
    if (k === 'awaiting-fx') return 0;
    return entriesOnPill(entries, k).length;
  };
  // Only the pills that hold something (owner, 2026-11-19): an empty pill opened an empty list, and 24 of them hid the few in use.
  const shownPills = ENTRY_PILLS.filter((p) => p.key === 'all' || p.key === pill || pillCount(p.key) > 0);
  const bookCodes = useMemo(() => options.filter((b) => b !== ALL_BRANCHES), [options]);
  const readOf = <T,>(l: Loaded<T>): ErpRead<T> => ({ data: l.refused || l.error ? null : l.rows, loading, refused: !!l.refused, error: l.error ?? '' });
  const retry = () => { void load(); };
  // Each branch chip carries the sum of the badges that branch would show.
  const chipCounts = useMemo(() => branchCounts(lists, options), [lists, options]);
  // The Approvals tab badge carries the all-branches total (plus App requests) — pushed after each load,
  // but not from a list that failed to load (a refused one is a real 0).
  const listFailed = !!(pw.error || crs.error || leave.error || credit.error || edits.error);
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
    const what = requestHeadline(r);
    // A supplier's new bank account: the approver says how it was confirmed, as on the ERP (SUPBANK-GATE-01).
    if (r.type === 'party_bank') {
      setAsking({
        title: 'How was the new bank account confirmed?', placeholder: 'Phone the supplier on the number ALREADY on file — who you spoke to, when.', cta: 'Approve', tone: 'primary', done: 'Request approved',
        run: (reason) => erpApi.actChangeRequest(r._id, 'approve', reason, r.branch),
      });
      return;
    }
    if (past.length) {
      const c = ownerApproveText(past, 'request');
      Alert.alert(c.title, `${what}\n\n${c.body}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', OWNER_ALL_LEVELS_REASON, r.branch), 'Request approved at every level') }]);
      return;
    }
    if (!confirm) { void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Request approved'); return; }
    Alert.alert('Approve this request?', what, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void act(r._id, () => erpApi.actChangeRequest(r._id, 'approve', '', r.branch), 'Request approved') }]);
  };
  const decideRequest = (r: ErpChangeRequest, action: 'approve' | 'reject' | 'send_back', confirm: boolean) => {
    if (action === 'approve') { approveRequest(r, confirm); return; }
    const what = requestHeadline(r);
    setAsking({ title: action === 'reject' ? `Reject: ${what}` : `Send back: ${what}`, cta: action === 'reject' ? 'Reject' : 'Send back', run: (reason) => erpApi.actChangeRequest(r._id, action, reason, r.branch) });
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

  // A request on any list, drawn by its kind — a payment and a Below GP review keep their own cards and words.
  const requestCard = (r: ErpChangeRequest) => {
    if (isPaymentRequest(r)) return <PaymentCard key={r._id} cr={r} me={me} busy={busy === r._id} anyBusy={!!busy} onAct={(a) => actOnPayment(r, a)} />;
    if (isMarginReview(r)) return <MarginCard key={r._id} r={r} busy={busy === r._id} anyBusy={!!busy} onConfirm={() => confirmMargin(r)} onSendBack={() => sendBackMargin(r)} />;
    return <RequestRow key={r._id} r={r} me={me} busy={busy === r._id} anyBusy={!!busy} onAct={(a) => decideRequest(r, a, !isHrRequest(r))} />;
  };
  // The home list. A request at my step counts in the section that lists it here, so a row never promises what its list lacks.
  const myIds = new Set(mine.requests.map((r) => r._id));
  const atMyStep = (list: ErpChangeRequest[]): number => list.filter((r) => myIds.has(r._id)).length;
  const approver = !pw.refused && ENTRY_APPROVER_ROLES.includes(chainRoleOf(me.role));
  const rows = homeRows({
    owner, app: !!onOpenApp, waiting: { ...counts, app: appPending ?? null },
    mine: homeMine({
      approver, entries: screen.entries, margin: screen.margin, edits: screen.edits, entryRequests: atMyStep([...entryRequests, ...transit]) + (approver ? 0 : atMyStep(margin)),
      payRequests: atMyStep(payables) + atMyStep(bankRows), hrRequests: atMyStep(hrRequests), setupRequests: atMyStep(requests.filter((r) => !PARTY_BANK_TYPES.includes(r.type))),
      credit: mine.credit.length, leave: mine.leave.length, close: closeOwed, move: rr.move, review: owner ? reviewNewCount(review) : 0, app: appPending,
    }),
  });
  const openRow = (key: HomeKey) => { if (key === 'app') onOpenApp?.(); else go({ tab: key }); };
  const loadError = pw.error || crs.error || leave.error || credit.error;
  const subOwner = hasSubTabs(tab) ? tab : null;
  const stripSubs = subOwner ? SUBTABS[subOwner].filter((x) => !x.onlyWhenWaiting || subs[subOwner] === x.key || screen.requests > 0) : [];
  const activeSub = subOwner ? subs[subOwner] : '';
  const levelLine = (level: string, text: string) => <Text style={st.note}><Text style={{ fontWeight: '800', color: colors.ink }}>{level}  </Text>{text}</Text>;
  const entriesHere = entriesOnPill(entries, pill);
  const checksHere = entriesOnPill(checkHere, pill);

  return (
    <View style={{ flex: 1 }}>
      {/* The top row: "Approvals" on the home list, a back button and the section's name inside one; the branch — the ERP's branch
          selector — as one dropdown whose choices say what waits there. ALL only for an all-branch login. */}
      <ApprovalsHeader title={tab === 'mine' ? 'Approvals' : HOME_TITLE[tab]} onBack={tab === 'mine' ? undefined : () => setTab('mine')}
        right={<BranchPicker options={options} value={branch} counts={loading ? null : chipCounts} onPick={setBranch} />} />

      {/* The sub-tabs of the tab that has them, and the Entries pills — the ERP's, in its order. */}
      {subOwner ? <ChipStrip items={stripSubs} active={activeSub} onPick={(k) => setSubs((c) => ({ ...c, [subOwner]: k }))} countOf={(k) => (loading ? null : subCounts[k] ?? null)} hideZero /> : null}
      {tab === 'entries' ? <ChipStrip items={shownPills} active={pill} onPick={(k) => setPill(k as EntryPill)} countOf={(k) => (loading ? null : pillCount(k as EntryPill))} hideZero /> : null}

      <ScrollView
        key={tab}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
      >
        {loading ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View> : null}

        {!loading && tab === 'mine' ? (
          <>
            {errorNote(loadError)}
            <HomeList rows={rows} onOpen={openRow} />
            {/* The requests at this person's step, signed right here — only when there are some. */}
            {crs.refused || mine.requests.length === 0 ? null : <Text style={st.section}>REQUESTS WAITING ON YOU ({mine.requests.length})</Text>}
            {mine.requests.map(requestCard)}
          </>
        ) : null}

        {!loading && tab === 'entries' ? (
          <>
            {/* What the ERP lists above its entries, in its order. */}
            {entryGroups.map((g) => (
              <View key={g.key}>
                <Text style={st.section}>{g.title} ({g.rows.length})</Text>
                <About><Text style={st.note}>{g.note}</Text></About>
                {g.rows.map(requestCard)}
              </View>
            ))}
            {pill === 'below-gp' ? (
              <>
                {/* The minimum-GP reviews of posted bookings, as on the ERP's Entries (owner, 2026-10-29). */}
                <About><Text style={st.note}>Already in the books, reviewed after: the BM gives the reason, then FM → Director → Owner confirm. Not accepted → send it back to the BM.</Text></About>
                {errorNote(crs.error)}
                {margin.length === 0 && !crs.error ? <Text style={st.empty}>No booking is below the GP line here.</Text> : null}
                {margin.map(requestCard)}
              </>
            ) : pill === 'pairs' || pill === 'awaiting-fx' ? (
              <Text style={st.note}>{pill === 'pairs' ? 'An HPV and its HRV are approved together, in the ERP.' : 'Deals waiting for a rate get it in the ERP.'}{pill === 'pairs' ? ` Waiting: ${pillCount('pairs')}.` : ''}</Text>
            ) : (
              <>
                {pill !== 'edits' ? (
                  <>
                    {entriesHere.length ? <Text style={st.section}>TO APPROVE ({entriesHere.length})</Text> : null}
                    {pw.refused ? refusedNote('Entries') : errorNote(pw.error)}
                    {entriesHere.length === 0 && !pw.refused && !pw.error ? <Text style={st.empty}>No entry is waiting for approval here.</Text> : null}
                    {entriesHere.map((e) => <EntryRow key={e.id} e={e} mine={actsHere(e, me)} onOpen={() => setOpen(e)} />)}
                  </>
                ) : null}

                {/* EDITS FOR FM — shown here, decided in the ERP: approving re-posts the books, and the ERP first shows the journal
                    before and after and every voucher it touches. */}
                {pill === 'all' || pill === 'edits' ? (
                  <>
                    {errorNote(edits.error)}
                    {editRows.length ? <Text style={st.section}>EDITS FOR FM ({editRows.length})</Text> : null}
                    {editRows.length ? <About label="Why these are decided in the ERP"><Text style={st.note}>The books keep the approved figures until the Finance Manager or the Owner approves the edit. Review it in the ERP, where the journal before and after is shown.</Text></About> : null}
                    {pill === 'edits' && editRows.length === 0 && !edits.error ? <Text style={st.empty}>No edit is waiting for the Finance Manager.</Text> : null}
                    {editRows.map((e) => <EditCard key={e.id} e={e} />)}
                  </>
                ) : null}

                {/* WAITING FOR CHECK — shown, never actioned here (owner, 2026-11-03): the branch Checks it in the ERP, then it
                    moves up to the list above for the Finance Manager. Last, because nothing in it is the viewer's to do. */}
                {pill !== 'edits' && checksHere.length ? <Text style={st.section}>WAITING FOR CHECK IN THE ERP ({checksHere.length})</Text> : null}
                {pill !== 'edits' && checksHere.length ? <About label="Why these are view-only here"><Text style={st.note}>{CHECK_IN_ERP_NOTE}</Text></About> : null}
                {pill !== 'edits' ? checksHere.map((e) => <EntryRow key={e.id} e={e} checkOnly onOpen={() => setOpen(e)} />) : null}
              </>
            )}
          </>
        ) : null}

        {!loading && tab === 'pay' && subs.pay === 'payables' ? (
          <>
            <About>
              <Text style={st.note}>Raised from the Finance Execution Dashboard; paid only once approved, on the Payment voucher (Entries) that picks the APFP. Expenses need none.</Text>
              {levelLine('L2', 'The BA / Senior Accountant raises → the FM approves, whoever the payee — one the FM raised too.')}
            </About>
            {crs.refused ? refusedNote('Payables') : errorNote(crs.error)}
            {payables.length === 0 && !crs.refused && !crs.error ? <Text style={st.empty}>No payment request is waiting.</Text> : null}
            {payables.map((cr) => <PaymentCard key={cr._id} cr={cr} me={me} busy={busy === cr._id} anyBusy={!!busy} onAct={(a) => actOnPayment(cr, a)} />)}

            <PayablesTiles focus={branch} refresh={refresh} />

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

        {!loading && tab === 'pay' && subs.pay === 'bank' ? (
          <>
            <About>
              <Text style={st.note}>An existing supplier&apos;s new bank account — the old one stands, and no payment request to that supplier is raised or signed, until it is approved.</Text>
              {levelLine('L2', 'The BA / Senior Accountant makes the change → the FM or the Owner approves, saying how the new account was confirmed (by phone with the supplier, on the number already on file).')}
            </About>
            {crs.refused ? refusedNote('Requests') : errorNote(crs.error)}
            {bankRows.length === 0 && !crs.refused && !crs.error ? <Text style={st.empty}>No supplier bank change is waiting.</Text> : null}
            {bankRows.map(requestCard)}
          </>
        ) : null}

        {!loading && tab === 'setup' ? (
          <>
            <About>
              <Text style={st.note}>Changes to settings, access, masters and targets.</Text>
              {levelLine('L4', "The FM proposes → Director → Owner (the Director's own: FM → Owner).")}
            </About>
            {crs.refused ? refusedNote('Requests') : errorNote(crs.error)}
            {setupList.length === 0 && !crs.refused && !crs.error ? <Text style={st.empty}>Nothing waiting here.</Text> : null}
            {setupList.map(requestCard)}
          </>
        ) : null}

        {!loading && tab === 'hr' ? (
          <>
            <About>
              <Text style={st.note}>Every HR request — decide each on its own.</Text>
              {levelLine('L4', "The staff member raises their own (leave, WFH, time correction, personal details) or the FM runs payroll → FM → Director → Owner; the Director's own: FM → Owner.")}
            </About>
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
            {hrRequests.map(requestCard)}
          </>
        ) : null}

        {tab === 'review' ? (
          <>
            <About label="About this list">
              <Text style={st.note}>Approved by the Director — payments, HR, salary, Hub FX, settings and leave whose chain ends with him, so they never came to you. Read only · all branches · last {REVIEW_DAYS} days; what is new since you last opened Review is marked.</Text>
            </About>
            {!review.loaded ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View> : null}
            {review.loaded && review.error && reviewRows.length === 0 ? errorNote(review.error) : null}
            {review.loaded && !review.error && reviewRows.length === 0 ? <Text style={st.empty}>The Director approved nothing in the last {REVIEW_DAYS} days.</Text> : null}
            {reviewRows.map((r) => <ReviewCard key={r.key || r.id} r={r} fresh={reviewFrom != null && isNewDecision(r, reviewFrom)} />)}
          </>
        ) : null}

        {!loading && tab === 'pay' && subs.pay === 'credit' ? (
          <>
            <About>
              <Text style={st.note}>Every credit request waiting, signed here.</Text>
              {levelLine('L4', 'Credit: the BA / Senior Accountant raises → FM → Director → Owner (a CRM on-boarding: the BA checks first · a CRM party on Advance: L2, the FM or the Owner).')}
            </About>
            {credit.refused ? refusedNote('Credit requests') : errorNote(credit.error)}
            {creditRows.length === 0 && !credit.refused && !credit.error ? <Text style={st.empty}>No credit requests are waiting.</Text> : null}
            {creditRows.map((c) => <CreditCard key={c.id} c={c} busy={busy === c.id} anyBusy={!!busy} onAct={(a) => actOnCredit(c, a)} onRerun={() => rerunCredit(c)} onClose={() => closeCredit(c)} />)}
          </>
        ) : null}

        {tab === 'close' ? <CloseTab read={readOf(closes)} focus={branch} onRetry={retry} /> : null}
        {tab === 'status' && subs.status === 'board' ? <StatusBoard read={readOf(statusBoard)} focus={branch} books={bookCodes} go={go} onRetry={retry} /> : null}
        {!loading && tab === 'status' && subs.status === 'raised' ? <RaisedByMe pending={crs.rows} me={me} refresh={refresh} onRetry={retry} /> : null}
        {tab === 'status' && subs.status === 'recorded' ? <RecordedList focus={branch} refresh={refresh} onRetry={retry} /> : null}
        {tab === 'rr' && subs.rr !== 'erp' ? <ConcernList rows={concernLists.rows} bucket={subs.rr as ConcernBucket} read={{ loading, refused: !!concerns.refused, error: concerns.error ?? '' }} onRetry={retry} /> : null}
        {tab === 'rr' && subs.rr === 'erp' ? <ErpConcernsList focus={branch} refresh={refresh} onRetry={retry} /> : null}
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

/* One decision the Director made, as the ERP's Owner Desk lists it: what, on whom, the branch and amount, when he signed,
   who raised it and why. `fresh` = approved after the Owner last opened Review. Nothing to act on. */
function ReviewCard({ r, fresh }: { r: ErpDirectorDecision; fresh: boolean }) {
  const amount = decisionAmount(r);
  const ago = decidedAgo(r, Date.now());
  const why = erpText(r.why);
  return (
    <View style={[st.card, fresh && { borderColor: colors.orange }]}>
      <View style={st.cardHead}>
        <Text style={[st.rowRef, { flexShrink: 1 }]}>{decisionTitle(r)}</Text>
        {fresh ? <View style={[st.tag, { backgroundColor: colors.orange + '22', borderColor: colors.orange }]}><Text style={[st.tagText, { color: colors.orange }]}>NEW</Text></View> : null}
      </View>
      <Text style={st.rowTitle}>
        {[erpText(r.branch), amount].filter(Boolean).join(' · ')}
        {ago ? <Text style={{ color: colors.coolText3 }}>{`${erpText(r.branch) || amount ? ' · ' : ''}approved by the Director ${ago}`}</Text> : null}
      </Text>
      {erpText(r.maker) ? <Text style={st.rowSub}>Raised by {erpText(r.maker)}</Text> : null}
      {why ? <Text style={st.rowSub}>Why: <Text style={{ color: colors.ink }}>{why}</Text></Text> : null}
      {erpText(r.where) ? <Text style={[st.rowSub, { color: colors.coolText3 }]}>In the ERP: {erpText(r.where)}</Text> : null}
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

function RequestRow({ r, me, busy, anyBusy, onAct }: { r: ErpChangeRequest; me: ErpMe; busy: boolean; anyBusy: boolean; onAct: (a: 'approve' | 'reject' | 'send_back') => void }) {
  const summary = typeof r.payload?.summary === 'string' ? r.payload.summary : typeof r.payload?.reason === 'string' ? r.payload.reason : '';
  const subject = requestSubject(r) || summary;
  const rows = requestChanges(r).filter((c) => c.to || c.from).slice(0, 6);
  const steps = chainSteps(r);
  const waiting = waitingLabel(r);
  const gates = requestGates(r, me);
  const why = gates.approve || gates.decline;
  return (
    <View style={st.card}>
      <Text style={st.rowRef}>{requestTypeLabel(r.type)}{r.branch ? ` · ${r.branch}` : ''}</Text>
      {subject ? <Text style={st.rowTitle}>{subject}</Text> : null}
      {rows.length ? (
        <View style={{ marginTop: 6, gap: 2 }}>
          {rows.map((c, i) => (
            <Text key={`${c.label}-${i}`} style={[st.rowSub, { marginTop: 0 }]}>
              <Text>{c.label}: </Text>
              {c.from ? <Text style={{ color: colors.coolText3 }}>{c.from}  →  </Text> : null}
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{c.to}</Text>
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={[st.rowSub, { marginTop: 6 }]}>Raised by {erpText(r.maker?.name) || erpText(r.maker?.userId) || '—'}{r.createdAt ? ` · ${ageOf(r.createdAt)}` : ''}</Text>
      {steps.length ? <ChainLine steps={steps} /> : null}
      {waiting ? <Text style={[st.rowSub, { color: colors.danger, fontWeight: '700' }]}>Waiting on {waiting}</Text> : null}
      {why ? <Text style={[st.rowSub, { color: colors.orange }]}>{why}</Text> : null}
      {!gates.decline || !gates.approve ? (
        <View style={st.actions}>
          {!gates.decline && gates.sendBack ? <ActionButton label="Send back" tone="plain" disabled={anyBusy} onPress={() => onAct('send_back')} /> : null}
          {!gates.decline ? <ActionButton label="Reject" tone="danger" disabled={anyBusy} onPress={() => onAct('reject')} /> : null}
          {!gates.approve ? <ActionButton label="Approve" busy={busy} disabled={anyBusy} onPress={() => onAct('approve')} /> : null}
        </View>
      ) : null}
    </View>
  );
}

// An edit of an approved voucher or booking, waiting for the FM: shown, never decided here.
function EditCard({ e }: { e: ErpEditRequest }) {
  const before = e.figures?.before?.total;
  const after = e.figures?.after?.total;
  return (
    <View style={st.card}>
      <Text style={st.rowRef}>{erpText(e.vno)}{e.branch ? ` · ${erpText(e.branch)}` : ''}</Text>
      {erpText(e.party) ? <Text style={st.rowTitle}>{erpText(e.party)}</Text> : null}
      {before != null || after != null ? <Text style={[st.rowSub, { color: colors.ink, fontWeight: '700' }]}>{money(before, e.currency) || '—'}  →  {money(after, e.currency) || '—'}</Text> : null}
      {e.fields?.length ? <Text style={st.rowSub}>Changes: {e.fields.map(erpText).filter(Boolean).join(', ')}</Text> : null}
      {erpText(e.reason) ? <Text style={st.rowSub}>Why: {erpText(e.reason)}</Text> : null}
      <Text style={st.rowSub}>Raised by {erpText(e.raisedBy) || '—'}{e.raisedAt ? ` · ${ageOf(e.raisedAt)}` : ''}</Text>
      {e.figures?.held ? <Text style={[st.rowSub, { color: colors.orange }]}>Held: unmatch it first</Text> : null}
      <Text style={[st.rowSub, { color: colors.orange, fontWeight: '700' }]}>Review and approve in the ERP</Text>
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

/* One pending entry in the Entries list. `checkOnly` — a row waiting for the branch's Check in the ERP, shown greyed with
   where it waits; it still opens (journal, who stamped it) but the sheet offers nothing on it. */
function EntryRow({ e, mine = false, checkOnly = false, onOpen }: { e: ErpPendingEntry; mine?: boolean; checkOnly?: boolean; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} style={[st.row, checkOnly && { opacity: 0.72 }]} accessibilityRole="button"
      accessibilityLabel={checkOnly ? `Open ${e.ref || e.type}, waiting for Check in ${e.actionBranch || e.branch}, view only` : `Open ${e.ref || e.type}`}>
      <View style={{ flex: 1 }}>
        <Text style={st.rowRef} numberOfLines={1}>{e.ref || e.type}</Text>
        <Text style={st.rowTitle} numberOfLines={1}>{erpText(e.title)}</Text>
        <Text style={st.rowSub} numberOfLines={1}>{[erpText(e.sub), e.branch, e.days ? `${e.days}d waiting` : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        {e.amount != null ? <Text style={st.amount}>{money(e.amount, e.currency)}</Text> : null}
        {checkOnly
          ? <Text style={st.withText}>⏳ Check in {e.actionBranch || e.branch}</Text>
          : mine
            ? <View style={st.stage}><Text style={st.stageText}>{STAGE_LABEL[e.stage] || 'Approve'}</Text></View>
            : <Text style={st.withText}>⏳ With {e.actionBranch}</Text>}
      </View>
      <ChevronRight size={16} color={colors.coolText3} />
    </Pressable>
  );
}

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
  // A Check-stage entry is view-only in the app (owner, 2026-11-03) — what the ERP says NOW wins over the list it was
  // opened from, so one sent back to Check while it was open gets no button either.
  const checkOnly = isCheckStage((detail && detail.reviewStage) || entry.stage);
  const action = detail && !checkOnly ? nextErpAction(detail, me, chain) : null;
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
                {checkOnly ? <Text style={[st.note, { marginHorizontal: 0 }]}>⏳ Waiting for Check in {actingBranch}. {CHECK_IN_ERP_NOTE}</Text> : null}
                {!mine && !checkOnly ? <Text style={[st.note, { marginHorizontal: 0 }]}>⏳ Its next step is given in {actingBranch}, outside your branch access.</Text> : null}
                {mine && !checkOnly && me.viewOnly ? <Text style={[st.note, { marginHorizontal: 0 }]}>Your ERP login is view-only.</Text> : null}
                {mine && action && !action.allowed ? <Text style={[st.note, { marginHorizontal: 0 }]}>{action.hint}</Text> : null}
                {mine && fxBlocked ? <Text style={[st.note, { marginHorizontal: 0 }]}>Approving this needs an exchange rate — approve it in the ERP.</Text> : null}
                {actionError ? <View style={[st.error, { marginHorizontal: 0 }]}><Text style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>{actionError}</Text></View> : null}
              </>
            ) : null}
          </ScrollView>
          {detail && mine && !me.viewOnly && !checkOnly ? (
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
  chipText: { color: colors.ink, fontSize: 12.5, fontWeight: '600' as const },
  // A count that holds something reads green; an empty one stays grey.
  chipCount: { minWidth: 20, minHeight: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.coolMuted, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipCountBusy: { backgroundColor: colors.primarySoft },
  chipCountText: { color: colors.coolText3, fontSize: 11, fontWeight: '700' as const },
  chipCountTextBusy: { color: colors.primary },
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
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.coolDivider, backgroundColor: colors.card },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '800' as const },
  stage: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.orange + '22' },
  stageText: { color: colors.orange, fontSize: 11, fontWeight: '800' as const },
  withText: { color: colors.coolText, fontSize: 11.5, fontWeight: '600' as const },
};
