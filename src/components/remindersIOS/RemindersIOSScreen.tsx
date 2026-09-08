import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Search, Clock, Menu, Flag, CircleDot, ChevronRight, ChevronLeft, Ellipsis, Plus } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { parseQuickAdd, whenLabel } from '../../logic/quickAdd';
import { listReminders, completeReminder, createReminder, deleteReminder } from '../../api/reminders';
import type { ReminderRecord } from '../../data/reminders';
import type { IOSReminder, IOSBusiness } from '../../data/remindersIOS';
import { useDirectoryStore, refreshDirectoryUsers } from '../../store/directoryStore';
import { useAccessStore } from '../../store/accessStore';
import { useMessagingStore } from '../../store/messagingStore';
import { useUiStore } from '../../store/uiStore';
import { useReminderBadgeStore } from '../../store/reminderBadgeStore';
import { cancelReminderLocal } from '../../services/notifications/reminderLocal';
import { T, BRANCH_PALETTE, type BranchPaletteEntry } from './tokens';
import { ReminderRow } from './ReminderRow';

// iOS Reminders-style screen, wired to REAL data: reminders come from the reminders API
// (For me + I set merged; the archive tab is the Completed set) and the business/branch structure
// comes from the CRM directory. A reminder files under its assignee's branch → business. Flags are
// device-local only (the reminders API has no flag field); un-completing is not supported by the
// API, so the done circle is one-way.

type ScreenId = 'home' | 'today' | 'scheduled' | 'all' | 'flagged' | string;

interface Section {
  key: string;
  label: string;
  labelColor: string;
  items: IOSReminder[];
}

const SMART_META: Record<string, { title: string; color: string }> = {
  today: { title: 'Today', color: T.accent },
  scheduled: { title: 'Scheduled', color: T.overdue },
  all: { title: 'All', color: T.allGray },
  flagged: { title: 'Flagged', color: T.flag },
};

const pillShadow = {
  shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
} as const;

const DAY_MS = 864e5;

// dueAt ISO → the prototype's {day-offset, '3:00 PM'} date model. Midnight = date-only (no time).
function dayTimeOf(iso?: string): { day: number; time: string } {
  if (!iso) return { day: 0, time: '' };
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return { day: 0, time: '' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
  const day = Math.round((dueDay.getTime() - today.getTime()) / DAY_MS);
  const h = due.getHours();
  const m = due.getMinutes();
  const time = h === 0 && m === 0 ? '' : `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { day, time };
}

// New-reminder button — icon-only "+" pill in the TOP-RIGHT corner (home header row + detail
// nav row), sized to match the other 40px nav pills.
function NewReminderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="New Reminder" hitSlop={6}
      style={{ backgroundColor: T.card, borderRadius: 999, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', ...pillShadow }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={15} color="#fff" strokeWidth={3} />
      </View>
    </Pressable>
  );
}

function SmartCard({ Icon, iconSize, color, count, label, filled, onPress }: {
  Icon: LucideIcon; iconSize: number; color: string; count: number; label: string; filled?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ flexBasis: '45%', flexGrow: 1, backgroundColor: T.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={iconSize} color="#fff" fill={filled ? '#fff' : 'none'} strokeWidth={filled ? 1 : 2} />
        </View>
        <Text style={{ fontSize: 24, fontWeight: '700', color: T.ink }}>{count}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: T.sub }}>{label}</Text>
    </Pressable>
  );
}

export default function RemindersIOSScreen() {
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const [screen, setScreen] = useState<ScreenId>('home');
  const [branch, setBranch] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  // Real records: open (For me + I set, deduped) and archived (the Completed set).
  const [recs, setRecs] = useState<{ open: ReminderRecord[]; archived: ReminderRecord[] }>({ open: [], archived: [] });
  const [loaded, setLoaded] = useState(false);
  // Device-local flags — the reminders API has no flag field, so flagging is a personal, on-device mark.
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const openRow = useRef<SwipeableMethods | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [forme, iset, archive] = await Promise.all([
        listReminders('forme'), listReminders('iset'), listReminders('archive'),
      ]);
      const seen = new Set<string>();
      const open = [...forme.visible, ...iset.visible].filter((r) => !seen.has(r.id) && !!seen.add(r.id));
      setRecs({ open, archived: archive.visible });
    } catch { /* offline / not signed in — keep what we have */ } finally { setLoaded(true); }
  }, []);
  useFocusEffect(useCallback(() => {
    void loadData();
    void useDirectoryStore.getState().load(); // real businesses + branches
    void refreshDirectoryUsers(); // assignee → branch mapping
  }, [loadData]));

  // ── Real org structure ─────────────────────────────────────────────────────
  const dir = useDirectoryStore();
  const users = useAccessStore((s) => s.users);
  const access = useAccessStore((s) => s.access()); // honors "View as"

  // ── Real records → display rows ────────────────────────────────────────────
  // A reminder files under its ASSIGNEE's (first) branch, and that branch's business. Assignees
  // with no branch (e.g. super admins) carry no business/branch — they still show in the smart lists.
  const reminders: IOSReminder[] = useMemo(() => {
    const branchById = new Map(dir.branches.map((b) => [b.id, b]));
    const userBranchId = new Map(users.map((u) => [u.id, (u.branches ?? [])[0] ?? '']));
    const toRow = (r: ReminderRecord, done: boolean): IOSReminder => {
      const br = branchById.get(userBranchId.get(r.forId) ?? '');
      const { day, time } = dayTimeOf(r.dueAt);
      return {
        id: r.id,
        list: br?.companyId ?? '',
        branch: br?.code ?? '',
        title: r.text ?? r.title ?? '',
        notes: '',
        day,
        time,
        flag: flagged.has(r.id),
        prio: 0,
        done,
        assignedTo: r.forId && r.forId !== meId ? r.forName : undefined,
        assignedBy: r.byId && r.byId !== meId ? (r.byName ?? undefined) : undefined,
        tags: [],
        subs: [],
      };
    };
    return [
      // An open item in 'review' state is finished by its assignee (awaiting approval) — shown done.
      ...recs.open.map((r) => toRow(r, r.state === 'review' || !!r.completedAt)),
      ...recs.archived.map((r) => toRow(r, true)),
    ];
  }, [recs, flagged, users, dir.branches, meId]);

  // Businesses the user actually has ACCESS to. For branch-scoped users the server already scopes
  // the directory to their access (branch memberships + explicit business grants from Team &
  // Users), so their list passes through as-is. Company-wide roles (super admin / company manager)
  // get every tenant business from the server — for them, hide empty setup shells (no branches)
  // unless one holds a visible reminder, so a reminder they can see never loses its list.
  const businesses: IOSBusiness[] = useMemo(() => {
    const companyWide = !access || access.isSuper || access.canManage;
    const withBranches = new Set(dir.branches.map((br) => br.companyId ?? ''));
    const withMyReminders = new Set(reminders.map((r) => r.list));
    return dir.businesses
      .filter((b) => !companyWide || withBranches.has(b.id) || withMyReminders.has(b.id))
      .map((b) => ({
        id: b.id, name: b.name, code: b.code, color: b.color,
        branches: dir.branches.filter((br) => br.companyId === b.id).map((br) => br.code),
      }));
  }, [dir.businesses, dir.branches, access, reminders]);

  // Branch → badge colors, assigned in branch order across businesses (cycle of 8).
  const branchColorMap = useMemo(() => {
    const m: Record<string, BranchPaletteEntry> = {};
    let i = 0;
    for (const biz of businesses) for (const b of biz.branches) if (!(b in m)) m[b] = BRANCH_PALETTE[i++ % BRANCH_PALETTE.length];
    return m;
  }, [businesses]);

  const closeOpenRow = () => { openRow.current?.close(); openRow.current = null; };
  const registerOpenRow = (m: SwipeableMethods | null) => {
    if (openRow.current && openRow.current !== m) openRow.current.close();
    openRow.current = m;
  };

  const openScreen = (id: ScreenId) => {
    closeOpenRow();
    setScreen(id); setBranch('all'); setSearchQ(''); setAdding(false); setShowCompleted(false);
  };
  const goHome = () => { closeOpenRow(); setScreen('home'); setAdding(false); };

  // ── Real actions ───────────────────────────────────────────────────────────
  // Complete is one-way (the API has no un-complete): optimistic strike-through, then sync.
  const toggleDone = (id: string) => {
    const rec = recs.open.find((r) => r.id === id);
    if (!rec || rec.state === 'review' || rec.completedAt) return;
    void cancelReminderLocal(id); // a completed reminder must not still ring at its due time
    setRecs((s) => ({ ...s, open: s.open.map((r) => (r.id === id ? { ...r, completedAt: Date.now() } : r)) }));
    completeReminder(id)
      .then(() => { void loadData(); void useReminderBadgeStore.getState().refresh(); })
      .catch(() => { showToast('Could not update reminder'); void loadData(); });
  };
  const toggleSub = (): void => undefined; // real reminders have no subtasks
  const flagRow = (id: string) => {
    openRow.current = null;
    setFlagged((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const deleteRow = (id: string) => {
    openRow.current = null;
    setRecs((s) => ({ open: s.open.filter((r) => r.id !== id), archived: s.archived.filter((r) => r.id !== id) }));
    deleteReminder(id)
      .then(() => { void useReminderBadgeStore.getState().refresh(); })
      .catch(() => { showToast('Only the creator can delete a reminder'); void loadData(); });
  };
  const startAdd = () => {
    closeOpenRow();
    if (screen === 'home') setScreen(businesses[0]?.id ?? 'all');
    setAdding(true); setNewTitle('');
  };
  // Quick add creates a REAL reminder for myself (the full composer with assignees stays on "+").
  const commitAdd = () => {
    const p = parseQuickAdd(newTitle);
    if (p.title && meId) {
      const due = new Date();
      due.setHours(9, 0, 0, 0); // date-only input defaults to 9:00 AM
      due.setDate(due.getDate() + p.day);
      const tm = p.time.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
      if (tm) due.setHours((Number(tm[1]) % 12) + (tm[3] === 'PM' ? 12 : 0), Number(tm[2]), 0, 0);
      createReminder({ text: p.title, forIds: [meId], when: whenLabel(p.day, p.time), dueAt: due.toISOString(), section: 'today' })
        .then(() => { void loadData(); void useReminderBadgeStore.getState().refresh(); })
        .catch(() => showToast('Could not create reminder'));
    }
    setAdding(false); setNewTitle(''); Keyboard.dismiss();
  };

  // Keep the inline quick-add card visible above the keyboard.
  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    return () => clearTimeout(t);
  }, [adding]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const active = reminders.filter((r) => !r.done);
  const matchScreen = (r: IOSReminder): boolean =>
    screen === 'today' ? r.day <= 0
      : screen === 'scheduled' || screen === 'all' ? true
        : screen === 'flagged' ? r.flag
          : r.list === screen && (branch === 'all' || r.branch === branch);
  const cur = screen === 'home' ? [] : reminders.filter(matchScreen);
  const curActive = cur.filter((r) => !r.done);
  const completed = cur.filter((r) => r.done);

  let sections: Section[] = [];
  if (screen !== 'home') {
    if (screen === 'all') {
      sections = businesses
        .map((b) => ({ key: b.id, label: b.name, labelColor: b.color, items: curActive.filter((r) => r.list === b.id) }))
        .filter((s) => s.items.length > 0);
    } else {
      const buckets: Array<[string, (r: IOSReminder) => boolean, string]> = [
        ['Overdue', (r) => r.day < 0, T.overdue],
        ['Today', (r) => r.day === 0, T.ink],
        ['Tomorrow', (r) => r.day === 1, T.ink],
        ['Upcoming', (r) => r.day > 1, T.ink],
      ];
      sections = buckets
        .map(([label, f, c]) => ({ key: label, label, labelColor: c, items: curActive.filter(f) }))
        .filter((s) => s.items.length > 0);
    }
    if (showCompleted && completed.length > 0) sections.push({ key: 'completed', label: 'Completed', labelColor: T.sub, items: completed });
  }

  const curBiz = businesses.find((b) => b.id === screen);
  const meta = SMART_META[screen] ?? (curBiz ? { title: curBiz.name, color: curBiz.color } : { title: '', color: T.accent });
  const bizCodeOf = (listId: string): string => businesses.find((b) => b.id === listId)?.code.toUpperCase() ?? '';

  const q = searchQ.trim().toLowerCase();
  const results = q ? reminders.filter((r) => r.title.toLowerCase().includes(q)) : [];

  const parsed = adding ? parseQuickAdd(newTitle) : null;
  const parsedHint = parsed && parsed.hasDate && parsed.title ? `Due ${whenLabel(parsed.day, parsed.time)}` : '';

  const rowProps = { onToggleDone: toggleDone, onToggleSub: toggleSub, onFlag: flagRow, onDelete: deleteRow, onOpen: registerOpenRow, onRowPress: closeOpenRow };

  // ── Home ───────────────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Header row — large title left, "+ New Reminder" in the top-right corner */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 }}>
            <Text style={{ fontSize: 32, fontWeight: '700', letterSpacing: 0.2, color: T.ink }}>Reminders</Text>
            <NewReminderButton onPress={startAdd} />
          </View>

          {/* Search */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.fill, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10 }}>
            <Search size={16} color="rgba(120,120,128,0.8)" />
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search"
              placeholderTextColor={T.placeholder}
              style={{ flex: 1, fontSize: 17, color: T.ink, padding: 0 }}
            />
          </View>

          {q ? (
            /* Live search results — tap opens that business view */
            <View style={{ backgroundColor: T.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden' }}>
              {results.map((r) => (
                <Pressable key={r.id} onPress={() => openScreen(r.list)} style={{ paddingVertical: 11, paddingHorizontal: 16 }}>
                  <Text style={{ fontSize: 17, color: T.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
                    {businesses.find((b) => b.id === r.list)?.name} · {whenLabel(r.day, r.time)}
                  </Text>
                </Pressable>
              ))}
              {results.length === 0 ? <Text style={{ padding: 16, fontSize: 15, color: T.sub }}>No results</Text> : null}
            </View>
          ) : (
            <>
              {/* Smart cards */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginHorizontal: 16 }}>
                <SmartCard Icon={CircleDot} iconSize={16} color={T.accent} count={active.filter((r) => r.day <= 0).length} label="Today" onPress={() => openScreen('today')} />
                <SmartCard Icon={Clock} iconSize={16} color={T.overdue} count={active.length} label="Scheduled" onPress={() => openScreen('scheduled')} />
                <SmartCard Icon={Menu} iconSize={14} color={T.allGray} count={active.length} label="All" onPress={() => openScreen('all')} />
                <SmartCard Icon={Flag} iconSize={13} color={T.flag} count={active.filter((r) => r.flag).length} label="Flagged" filled onPress={() => openScreen('flagged')} />
              </View>

              {/* Businesses — the real CRM directory (companies + their branches) */}
              <Text style={{ paddingTop: 24, paddingHorizontal: 20, paddingBottom: 8, fontSize: 20, fontWeight: '700', color: T.ink }}>My Businesses</Text>
              <View style={{ backgroundColor: T.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden' }}>
                {businesses.map((b, i) => (
                  <View key={b.id}>
                    <Pressable onPress={() => openScreen(b.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: b.color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>{b.code}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 17, color: T.ink }}>{b.name}</Text>
                        <Text style={{ fontSize: 13, color: T.sub }}>{b.branches.length ? `${b.branches.length} branches` : 'No branches'}</Text>
                      </View>
                      <Text style={{ fontSize: 17, color: T.sub }}>{active.filter((r) => r.list === b.id).length}</Text>
                      <ChevronRight size={17} color="rgba(120,120,128,0.5)" strokeWidth={2.2} />
                    </Pressable>
                    {i < businesses.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: T.sep, marginLeft: 58 }} /> : null}
                  </View>
                ))}
                {dir.loaded && businesses.length === 0 ? (
                  <Text style={{ padding: 16, fontSize: 15, color: T.sub }}>No businesses in your access</Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Business / smart-list detail ───────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Nav row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}>
            <Pressable onPress={goHome} style={{ backgroundColor: T.card, borderRadius: 999, height: 40, paddingLeft: 10, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 5, ...pillShadow }}>
              <ChevronLeft size={22} color={T.accent} strokeWidth={2.4} />
              <Text style={{ fontSize: 17, color: T.accent }}>Businesses</Text>
            </Pressable>
            {adding ? (
              <Pressable onPress={commitAdd} style={{ backgroundColor: T.card, borderRadius: 999, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', ...pillShadow }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: T.accent }}>Done</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <NewReminderButton onPress={startAdd} />
                <View style={{ backgroundColor: T.card, borderRadius: 999, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', ...pillShadow }}>
                  <Ellipsis size={18} color="rgba(120,120,128,0.9)" />
                </View>
              </View>
            )}
          </View>

          {/* Large title */}
          <Text style={{ paddingTop: 8, paddingHorizontal: 20, fontSize: 32, fontWeight: '700', letterSpacing: 0.2, color: meta.color }}>{meta.title}</Text>

          {/* Branch filter chips — the business's real branches */}
          {curBiz && curBiz.branches.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 2 }}>
              {[{ id: 'all', label: 'All' }, ...curBiz.branches.map((b) => ({ id: b, label: b }))].map((c) => {
                const on = branch === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => { closeOpenRow(); setBranch(c.id); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
                      backgroundColor: on ? meta.color : T.card,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
                    }}
                  >
                    {c.id !== 'all' ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? '#fff' : branchColorMap[c.id]?.dot ?? T.allGray }} />
                    ) : null}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : T.ink }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Completed toggle */}
          {completed.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 15, color: T.sub }}>{completed.length} Completed</Text>
              <Text style={{ fontSize: 15, color: T.sub }}>·</Text>
              <Pressable onPress={() => setShowCompleted((v) => !v)} hitSlop={6}>
                <Text style={{ fontSize: 15, color: T.accent, fontWeight: '600' }}>{showCompleted ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Sections */}
          {sections.map((sec) => (
            <View key={sec.key} style={{ marginTop: 14 }}>
              <Text style={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: 8, fontSize: 20, fontWeight: '700', color: sec.labelColor }}>{sec.label}</Text>
              <View style={{ backgroundColor: T.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden' }}>
                {sec.items.map((r, i) => (
                  <ReminderRow key={r.id} r={r} bizCode={bizCodeOf(r.list)} branchColors={branchColorMap[r.branch]} isLast={i === sec.items.length - 1} {...rowProps} />
                ))}
              </View>
            </View>
          ))}

          {/* Inline quick add */}
          {adding ? (
            <View style={{ backgroundColor: T.card, borderRadius: 16, marginHorizontal: 16, marginTop: 14, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.7, borderColor: T.ring, flexShrink: 0 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  autoFocus
                  value={newTitle}
                  onChangeText={setNewTitle}
                  onSubmitEditing={commitAdd}
                  returnKeyType="done"
                  placeholder="Try “Pay vendor tomorrow at 3pm”"
                  placeholderTextColor={T.placeholder}
                  style={{ fontSize: 17, color: T.ink, padding: 0 }}
                />
                {parsedHint ? <Text style={{ fontSize: 13, color: T.accent, marginTop: 3 }}>{parsedHint}</Text> : null}
              </View>
            </View>
          ) : null}

          {/* Empty state */}
          {loaded && sections.length === 0 && completed.length === 0 && !adding ? (
            <Text style={{ paddingVertical: 90, paddingHorizontal: 20, textAlign: 'center', fontSize: 17, color: T.sub }}>No Reminders</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
