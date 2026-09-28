import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, BackHandler, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, ClipboardCheck, X } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useUiStore } from '../../src/store/uiStore';
import { useApprovalBadgeStore } from '../../src/store/approvalBadgeStore';
import { ApiError } from '../../src/api/client';
import { colorForId } from '../../src/logic/directory';
import { ageLabel, groupByPerson, isStale, monthLabel, monthsOf } from '../../src/logic/regularizationQueue';
import { getRegularizationsForAdmin, decideRegularization, type Regularization } from '../../src/api/hr';

// SUPER-ADMIN queue: attendance-correction requests, in the approved design's three tabs
// (Pending / Approved / Rejected), grouped under the person who asked. Approve corrects the day
// through the same evidence-preserving path as the super admin's own time editor (the server does
// it); Reject requires a note that goes back to the requester. Server-gated to super_admin
// (owner rule 2026-09-08 — nobody else may change a recorded time), so this screen only assumes
// the caller reached it through the super-admin entry points.
//
// Bulk approve/reject runs the SAME per-request endpoint once per selection, in order: there is no
// bulk route, and inventing a client-side "apply many" that half-succeeds silently would be worse
// than reporting exactly how many landed. A partial run says so and reloads.

type Tab = 'pending' | 'approved' | 'rejected';
const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const ALL_MONTHS = 'all';
const fmtT = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'open');
const fmtD = (key: string): string => new Date(key + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const initials = (name: string): string =>
  (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('') || '?').toUpperCase();

export default function RegularizationsScreen() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<Regularization[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Regularization | 'bulk' | null>(null);
  const [note, setNote] = useState('');
  const [month, setMonth] = useState<string>(ALL_MONTHS);
  const [monthOpen, setMonthOpen] = useState(false);
  // Ids ticked for a bulk decision. Kept as a Set so a reload that drops a decided row simply
  // stops matching it, rather than leaving a phantom in the count.
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback((which: Tab): void => {
    setRows(null);
    getRegularizationsForAdmin(which).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(tab); setPicked(new Set()); }, [tab, load]);
  // The Pending tab's badge has to stay right while the reviewer reads the decided tabs.
  const refreshPendingCount = useCallback((): void => {
    getRegularizationsForAdmin('pending').then((r) => setPendingCount(r.length)).catch(() => undefined);
  }, []);
  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  const months = useMemo(() => monthsOf(rows ?? []), [rows]);
  const visible = useMemo(
    () => (rows ?? []).filter((r) => month === ALL_MONTHS || r.date.startsWith(month)),
    [rows, month],
  );
  const groups = useMemo(() => groupByPerson(visible), [visible]);
  // Only what is both ticked AND on screen can be acted on — a month filter must not silently
  // approve rows the reviewer cannot see.
  const selected = useMemo(() => visible.filter((r) => picked.has(r.id)), [visible, picked]);
  // Selection is a MODE entered by long-pressing a row, not tick boxes standing on every row.
  // Deriving it from the selection is what makes unticking the last row leave the mode, so nobody
  // is stranded in an empty selection offering "Approve 0".
  const selecting = selected.length > 0;

  const toggle = useCallback((id: string): void => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  // Hardware Back cancels the selection before it leaves the screen — otherwise a stray back press
  // throws away a whole backlog of ticks.
  useEffect(() => {
    if (!selecting) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked(new Set());
      return true;
    });
    return () => sub.remove();
  }, [selecting]);

  const afterDecision = useCallback((): void => {
    setRejecting(null); setNote(''); setPicked(new Set());
    load(tab); refreshPendingCount();
    // A correction decided here also leaves the Approvals tab's queue, so its badge must follow.
    void useApprovalBadgeStore.getState().refresh();
  }, [load, tab, refreshPendingCount]);

  const decide = useCallback((r: Regularization, action: 'approve' | 'reject', decisionNote?: string): void => {
    setBusyId(r.id);
    decideRegularization(r.id, action, decisionNote)
      .then(() => {
        showToast(action === 'approve' ? 'Approved — the day was corrected' : 'Rejected — the requester was told');
        afterDecision();
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not record the decision'))
      .finally(() => setBusyId(null));
  }, [afterDecision, showToast]);

  // Sequential, so the server applies them in a defined order and one failure does not cancel the
  // rest. The toast reports what actually landed.
  const decideMany = useCallback(async (list: Regularization[], action: 'approve' | 'reject', decisionNote?: string): Promise<void> => {
    setBusyId('bulk');
    let done = 0;
    let firstError = '';
    for (const r of list) {
      try {
        await decideRegularization(r.id, action, decisionNote);
        done += 1;
      } catch (e) {
        if (!firstError) firstError = e instanceof ApiError ? e.message : 'Could not record the decision';
      }
    }
    setBusyId(null);
    const verb = action === 'approve' ? 'Approved' : 'Rejected';
    showToast(done === list.length ? `${verb} ${done}` : `${verb} ${done} of ${list.length} — ${firstError}`);
    afterDecision();
  }, [afterDecision, showToast]);

  const confirmApprove = useCallback((r: Regularization): void => {
    Alert.alert('Approve this correction?', `${r.name ?? 'This person'} · ${fmtD(r.date)}\nIn ${fmtT(r.checkInAt)} · Out ${fmtT(r.checkOutAt)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => decide(r, 'approve') },
    ]);
  }, [decide]);

  const confirmApproveMany = useCallback((): void => {
    const list = selected;
    Alert.alert(`Approve ${list.length} corrections?`, 'Each day is corrected exactly as asked.', [
      { text: 'Cancel', style: 'cancel' },
      { text: `Approve ${list.length}`, onPress: () => { void decideMany(list, 'approve'); } },
    ]);
  }, [selected, decideMany]);

  const bulkBusy = busyId === 'bulk';
  const decided = tab !== 'pending';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
      {/* The bar is the mode: normally back / title / month filter; inside a selection it becomes
          the count, the way out, and Select all, on a tinted ground. */}
      {selecting ? (
        <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10, backgroundColor: colors.primarySoft }}>
          <Pressable onPress={() => setPicked(new Set())} accessibilityRole="button" accessibilityLabel="Leave selection"
            style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={colors.primary} strokeWidth={2.4} />
          </Pressable>
          <Text style={{ flex: 1, color: colors.primary, fontSize: 17, fontWeight: '800' }}>{selected.length} selected</Text>
          <Pressable onPress={() => setPicked(new Set(visible.map((r) => r.id)))} accessibilityRole="button" accessibilityLabel="Select all requests"
            style={{ height: 34, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700' }}>Select all</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8 }}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"
            style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={22} color={colors.ink} strokeWidth={2.2} />
          </Pressable>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 20, fontWeight: '800' }}>Time corrections</Text>
          {/* Month filter over what is loaded. It opens showing every month present, and defaults to
              all of them — a queue must never hide a waiting request behind a default. */}
          <Pressable onPress={() => setMonthOpen(true)} disabled={months.length === 0}
            accessibilityRole="button" accessibilityLabel="Filter by month"
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textBody, fontSize: 13, fontWeight: '600' }}>{month === ALL_MONTHS ? 'All months' : monthLabel(month)}</Text>
          </Pressable>
        </View>
      )}

      {/* Segmented control — one white card slides across a grey track. */}
      <View role="tablist" className="flex-row" style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.coolMuted, borderRadius: 12, padding: 4, gap: 4 }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} className="flex-row items-center justify-center"
              accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 38, borderRadius: 9, gap: 6, backgroundColor: on ? colors.card : 'transparent' }}>
              <Text style={{ color: on ? colors.primary : colors.coolText, fontSize: 13, fontWeight: on ? '800' : '600' }}>{t.label}</Text>
              {t.key === 'pending' && pendingCount > 0 ? (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}>
        {rows === null ? (
          <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
        ) : groups.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 56, paddingHorizontal: 32 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><ClipboardCheck size={36} color={colors.primary} /></View>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{tab === 'pending' ? 'All caught up' : `Nothing ${tab}`}</Text>
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              {month === ALL_MONTHS ? 'No requests to show here.' : `No requests in ${monthLabel(month)}.`}
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.userId}>
              {/* Person header — whose week this block is. */}
              <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 10, backgroundColor: colors.surfaceSubtle, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.coolDivider }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colorForId(g.userId), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{initials(g.name)}</Text>
                </View>
                <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' }}>
                  {g.name}{g.branch ? <Text style={{ fontWeight: '500', color: colors.coolText }}> · {g.branch}</Text> : null}
                </Text>
                <Text style={{ color: colors.coolText, fontSize: 12 }}>{g.rows.length} request{g.rows.length === 1 ? '' : 's'}</Text>
              </View>
              {g.rows.map((r) => (
                <RequestRow key={r.id} r={r} decided={decided} selecting={selecting} selected={picked.has(r.id)}
                  busy={busyId === r.id || bulkBusy}
                  onToggle={() => toggle(r.id)}
                  onApprove={confirmApprove}
                  onReject={(x) => { setRejecting(x); setNote(''); }} />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Bulk bar — only while something is ticked, and only on the tab where a decision is possible. */}
      {/* Bulk bar — the only way to act while selecting. The count lives in the header, so both
          buttons get the full width instead of competing with a label. */}
      {!decided && selecting ? (
        <View className="flex-row items-center" style={{ borderTopWidth: 1, borderTopColor: colors.coolDivider, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10, backgroundColor: colors.card }}>
          <Pressable disabled={bulkBusy} onPress={() => { setRejecting('bulk'); setNote(''); }}
            style={{ flex: 1, height: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.dangerEdge, alignItems: 'center', justifyContent: 'center', opacity: bulkBusy ? 0.5 : 1 }}>
            <Text style={{ color: colors.dangerText, fontSize: 14, fontWeight: '700' }}>Reject {selected.length}</Text>
          </Pressable>
          <Pressable disabled={bulkBusy} onPress={confirmApproveMany}
            style={{ flex: 1, height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: bulkBusy ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{bulkBusy ? 'Working…' : `Approve ${selected.length}`}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Month picker */}
      <Modal visible={monthOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMonthOpen(false)}>
        <Pressable onPress={() => setMonthOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 28 }}>
            {[ALL_MONTHS, ...months].map((m) => (
              <Pressable key={m} onPress={() => { setMonth(m); setMonthOpen(false); }} className="flex-row items-center"
                style={{ minHeight: 48, paddingHorizontal: 20, gap: 10 }}>
                <Text style={{ flex: 1, color: colors.ink, fontSize: 15, fontWeight: month === m ? '700' : '500' }}>{m === ALL_MONTHS ? 'All months' : monthLabel(m)}</Text>
                {month === m ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reject-with-note dialog (the note is required — it goes back to the requester). One note
          covers a bulk rejection: the reviewer is refusing them for the same stated reason. */}
      <Modal visible={!!rejecting} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRejecting(null)}>
        <Pressable onPress={() => setRejecting(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 6 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>
                {rejecting === 'bulk' ? `Reject ${selected.length} requests` : 'Reject request'}
              </Text>
              <Pressable onPress={() => setRejecting(null)} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={16} color={colors.coolText} /></Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 10 }}>
              {rejecting === 'bulk'
                ? 'The same note goes back to everyone selected.'
                : `${rejecting?.name ?? 'Requester'} · ${rejecting ? fmtD(rejecting.date) : ''} — the note goes back to them.`}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Why is this refused?"
              placeholderTextColor={colors.coolText3}
              multiline
              maxLength={300}
              autoFocus
              style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top', marginBottom: 12 }}
            />
            <Pressable
              disabled={!note.trim() || busyId !== null}
              onPress={() => {
                if (!rejecting) return;
                if (rejecting === 'bulk') void decideMany(selected, 'reject', note.trim());
                else decide(rejecting, 'reject', note.trim());
              }}
              style={{ height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: note.trim() ? colors.danger : colors.coolMuted }}>
              <Text style={{ color: note.trim() ? '#fff' : colors.coolText3, fontSize: 14, fontWeight: '700' }}>{busyId !== null ? 'Rejecting…' : 'Reject with note'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// One request: tick box, the day and the times asked for, the stated reason, how long it has
// waited, and the two decisions. On the decided tabs the controls give way to the outcome.
const RequestRow = memo(function RequestRow({ r, decided, selecting, selected, busy, onToggle, onApprove, onReject }: {
  r: Regularization; decided: boolean; selecting: boolean; selected: boolean; busy: boolean;
  onToggle: () => void; onApprove: (r: Regularization) => void; onReject: (r: Regularization) => void;
}) {
  // A request that leaves the day open is the common case this feature exists for (a forgotten
  // punch-out), and it is the part a reviewer must actually look at — so it is called out, not
  // rendered as the word "open" in the middle of a sentence.
  const openOut = r.checkOutAt === null;
  const stale = !decided && isStale(r.appliedAt);
  const when = decided ? (r.decidedAt ?? r.appliedAt) : r.appliedAt;
  return (
    // The WHOLE row is the press target, the way ChatListItem does it — a long press anywhere on it
    // enters selection; once in the mode a tap toggles. An inner flex child as the target did not
    // receive the gesture at all. The Reject/Approve buttons are nested Pressables and still win
    // the touch for themselves.
    <Pressable className="flex-row"
      onPress={selecting && !decided ? onToggle : undefined}
      onLongPress={!decided ? onToggle : undefined}
      delayLongPress={300}
      android_ripple={{ color: colors.coolMuted }}
      accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${r.name ?? 'request'}, ${fmtD(r.date)}`}
      style={{ gap: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.coolMuted, backgroundColor: selected ? colors.rowUnread : colors.card }}>
      {/* The tick box exists only inside the mode, and only on a row still open for a decision. */}
      {selecting && !decided ? (
        <View accessible accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
          style={{ width: 20, height: 20, marginTop: 2, borderRadius: 6, borderWidth: selected ? 0 : 1.5, borderColor: colors.borderStrong, backgroundColor: selected ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{fmtD(r.date)}</Text>
        <Text style={{ color: colors.textBody, fontSize: 13 }}>
          In {fmtT(r.checkInAt)} · {openOut
            ? <Text style={{ color: colors.warn, fontWeight: '700' }}>Out missing</Text>
            : <Text>Out {fmtT(r.checkOutAt)}</Text>}
        </Text>
        {r.reason ? <Text style={{ color: colors.coolText, fontSize: 12.5 }}>“{r.reason}”</Text> : null}
        {decided && r.decisionNote ? <Text style={{ color: colors.coolText, fontSize: 12.5 }}>Note: {r.decisionNote}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: stale ? colors.warnSoft : colors.coolMuted }}>
          <Text style={{ color: stale ? colors.warn : colors.coolText, fontSize: 11, fontWeight: '700' }}>{ageLabel(when)}</Text>
        </View>
        {/* Inside the mode the bulk bar is the only way to act, so the row's own buttons stand down. */}
        {decided || selecting ? null : (
          <View className="flex-row" style={{ gap: 6 }}>
            <Pressable disabled={busy} onPress={() => onReject(r)}
              accessibilityRole="button" accessibilityLabel={`Reject ${r.name ?? 'request'}, ${fmtD(r.date)}`}
              style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.dangerEdge, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: colors.dangerText, fontSize: 12.5, fontWeight: '700' }}>Reject</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => onApprove(r)}
              accessibilityRole="button" accessibilityLabel={`Approve ${r.name ?? 'request'}, ${fmtD(r.date)}`}
              style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Approve</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
});
