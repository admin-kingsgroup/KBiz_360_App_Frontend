import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Palmtree } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { HrMenuButton } from '../../src/components/hr/HrMenu';
import { AbsentLeaveSheet } from '../../src/components/hr/AbsentLeaveSheet';
import { shiftDay } from '../../src/logic/leave';
import { getMyAttendanceMonth, getHolidays, getMyLeave, type MyAttendanceMonth, type MonthDay, type HolidayRow, type DayState, type MyLeave } from '../../src/api/hr';

// My Attendance — the person's own month, read exactly the way the ERP's monthly report reads
// it (same classifier, served by the backend): present / absent / paid leave / holiday /
// week off / no-data, plus the leave balance as at the month end and the branch holiday list.

const STATE_COLORS: Record<DayState, string> = {
  present: colors.primary,
  absent: colors.danger,
  leave: colors.teal,
  holiday: colors.orange,
  weekOff: colors.coolText3,
  future: colors.coolMuted,
  notEmployed: colors.coolMuted,
  noData: colors.coolMuted,
};
const STATE_LABELS: Record<DayState, string> = {
  present: 'Present',
  absent: 'Absent',
  leave: 'Paid leave',
  holiday: 'Holiday',
  weekOff: 'Week off',
  future: 'Upcoming',
  notEmployed: 'Not employed',
  noData: 'No data',
};

// Holiday cards sit on a wash of the Holiday orange — the colour this page ALREADY uses for the
// legend dot and the calendar's holiday markers, so the list reads as part of the calendar above it
// rather than introducing a new hue. Alpha-suffix tints follow the Tile convention below.
const HOLIDAY_BG = colors.orange + '12';        // ~7%, the same wash Tile uses
const HOLIDAY_EDGE = colors.orange + '33';
const HOLIDAY_NEXT_BG = colors.orange + '28';   // the soonest one runs deeper so it reads first
const HOLIDAY_NEXT_EDGE = colors.orange + '66';
// Darkened orange for 11.5px text ON the deeper wash — colors.orange itself is too light there to
// stay legible at that size.
const HOLIDAY_NEXT_INK = '#8A5E14';

const fmtT = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
const monthLabel = (m: string): string => new Date(`${m}-01T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });
const thisMonth = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (m: string, n: number): string => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function MyAttendanceMonthScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<MyAttendanceMonth | null>(null);
  const [holidays, setHolidays] = useState<HolidayRow[] | null>(null);
  const [selected, setSelected] = useState<MonthDay | null>(null);
  const [failed, setFailed] = useState(false);
  const [leave, setLeave] = useState<MyLeave | null>(null);
  // Tapping an ABSENT day opens the paid-leave request for it (null = sheet closed).
  const [leaveDay, setLeaveDay] = useState<string | null>(null);
  // Calendar cell width in whole pixels. A percentage basis (100/7 %) rounds each cell UP on
  // Android, so seven cells overflowed the row and Sunday wrapped onto the next line.
  const [cellW, setCellW] = useState<number | null>(null);
  const onGridLayout = useCallback((e: LayoutChangeEvent): void => {
    const w = Math.floor(e.nativeEvent.layout.width / 7);
    setCellW((prev) => (prev === w ? prev : w));
  }, []);
  const loadLeave = useCallback((): void => { getMyLeave().then(setLeave).catch(() => undefined); }, []);

  const load = useCallback((m: string): void => {
    setData(null); setSelected(null); setFailed(false);
    getMyAttendanceMonth(m).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(month); }, [month, load]);
  useFocusEffect(useCallback(() => { load(month); loadLeave(); }, [load, loadLeave, month]));
  useEffect(() => {
    getHolidays(Number(month.slice(0, 4))).then((h) => setHolidays(h.published ? h.holidays : [])).catch(() => setHolidays([]));
  }, [month]);

  // Monday-first grid: leading blanks so day 1 lands on its weekday column.
  const cells = useMemo(() => {
    if (!data) return [] as (MonthDay | null)[];
    const lead = (new Date(`${data.month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
    return [...Array.from({ length: lead }, () => null), ...data.days];
  }, [data]);

  // Days covered by a leave request HR has not decided yet — shown as "Leave requested".
  const requestedDays = useMemo(() => {
    const set = new Set<string>();
    for (const a of leave?.applications ?? []) {
      if (a.status !== 'pending') continue;
      for (let d = a.from; d <= a.to; d = shiftDay(d, 1)) set.add(d);
    }
    return set;
  }, [leave]);
  const openAbsent = useMemo(
    () => (data ? data.days.filter((d) => d.state === 'absent' && !requestedDays.has(d.day)).map((d) => d.day) : []),
    [data, requestedDays],
  );
  const askLeaveFor = useCallback((day: string): void => setLeaveDay(day), []);

  const upcoming = useMemo(() => {
    if (!holidays || !data) return [];
    return holidays.filter((h) => h.date >= data.today).slice(0, 8);
  }, [holidays, data]);

  // Why a month can legitimately read blank — said plainly, because an unexplained empty
  // calendar looks like the screen is broken. Holidays still show underneath either way.
  const notice = useMemo((): string | null => {
    if (!data) return null;
    if (data.exempt) return 'Attendance isn’t tracked for your account, so no days are recorded here. Paid leave and holidays still come from HR.';
    if (!data.employee.hasRecord) return 'No HR record is linked to your login yet, so there is no leave balance or shift to read. Ask HR to add you on the Employee Master — your punches keep recording meanwhile.';
    if (data.beforeFirstPunch) return 'This month is before your first punch in the app — the blank days are no data, not absences.';
    if (data.summary.noData > 0 && data.summary.present === 0 && data.summary.absent === 0) return 'No attendance was recorded for you this month — the blank days are no data, not absences.';
    return null;
  }, [data]);

  const canGoNext = month < thisMonth();
  const selRequested = !!selected && selected.state === 'absent' && requestedDays.has(selected.day);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>My Attendance</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{data ? `${data.employee.branch || '—'} branch calendar` : 'Month view'}</Text>
        </View>
        <HrMenuButton current="month" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Month navigator */}
        <View className="flex-row items-center justify-between mb-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 4 }}>
          <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{monthLabel(month)}</Text>
          <Pressable onPress={() => canGoNext && setMonth((m) => shiftMonth(m, 1))} disabled={!canGoNext} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canGoNext ? 1 : 0.25 }}>
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        {failed ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <Text style={{ color: colors.coolText, fontSize: 13, marginBottom: 12 }}>Couldn’t reach the server.</Text>
            <Pressable onPress={() => load(month)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary }}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text></Pressable>
          </View>
        ) : data === null ? (
          <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {/* Summary tiles */}
            <View className="flex-row gap-2 mb-2">
              <Tile n={data.summary.present} label="Present" color={colors.primary} />
              <Tile n={data.summary.absent} label="Absent" color={colors.danger}
                onPress={openAbsent.length ? () => askLeaveFor(selected && openAbsent.includes(selected.day) ? selected.day : openAbsent[0]) : undefined} />
              <Tile n={data.summary.leave} label="Leave" color={colors.teal} />
              <Tile n={data.summary.lateMarks} label="Late" color={colors.orange} />
            </View>
            <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
              {data.summary.hoursTotal}h worked · avg {data.summary.avgHours}h/day
              {data.leaveBalance ? ` · leave balance ${data.leaveBalance.balance}d at month end` : ''}
            </Text>
            {notice ? (
              <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.orange + '12', borderWidth: 1, borderColor: colors.orange + '40', marginBottom: 12 }}>
                <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18 }}>{notice}</Text>
              </View>
            ) : null}

            {/* Calendar grid (Monday-first) */}
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 16, padding: 10, marginBottom: 12 }}>
              <View className="flex-row">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                  <View key={i} style={{ ...(cellW ? { width: cellW } : { flexBasis: '14.2%' }), alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ color: i === 6 ? colors.danger : colors.coolText, fontSize: 10, fontWeight: '800' }}>{w}</Text>
                  </View>
                ))}
              </View>
              <View className="flex-row flex-wrap" onLayout={onGridLayout}>
                {cells.map((d, i) => {
                  const cellBox = cellW ? { width: cellW } : { flexBasis: '14.2%' as const };
                  if (d === null) return <View key={`b${i}`} style={{ ...cellBox, height: 42 }} />;
                  const c = STATE_COLORS[d.state];
                  const faint = d.state === 'future' || d.state === 'notEmployed' || d.state === 'noData';
                  const isSel = selected?.day === d.day;
                  const isToday = d.day === data.today;
                  // An absent day with a pending request reads as "Leave requested" (dashed teal).
                  const requested = d.state === 'absent' && requestedDays.has(d.day);
                  const askable = d.state === 'absent' && !requested;
                  const tone = requested ? colors.teal : c;
                  return (
                    <Pressable key={d.day} onPress={() => { setSelected(d); if (askable) askLeaveFor(d.day); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${d.day}, ${requested ? 'leave requested' : STATE_LABELS[d.state]}${askable ? ', tap to apply paid leave' : ''}`}
                      style={{ ...cellBox, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: faint ? 'transparent' : tone + '22', borderWidth: isSel ? 2 : requested || isToday ? 1.5 : 0, borderStyle: requested && !isSel ? 'dashed' : 'solid', borderColor: isSel ? colors.ink : requested ? colors.teal : colors.primary }}>
                        <Text style={{ color: faint ? colors.coolText3 : tone, fontSize: 13, fontWeight: '700' }}>{Number(d.day.slice(8, 10))}</Text>
                        {d.late ? <View style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.orange }} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {/* Selected-day detail */}
              {selected ? (
                <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.coolDivider }}>
                  <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>
                    {new Date(selected.day + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} · <Text style={{ color: selRequested ? colors.teal : STATE_COLORS[selected.state] }}>{selRequested ? 'Leave requested' : STATE_LABELS[selected.state]}{selected.halfLeave ? ' · half-day leave' : ''}{selected.granted && selected.state === 'weekOff' ? ' (granted)' : ''}</Text>
                  </Text>
                  {selected.state === 'present' ? (
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>
                      In {fmtT(selected.checkInAt)} · Out {selected.open ? 'still in' : fmtT(selected.checkOutAt)}{selected.hours != null ? ` · ${selected.hours}h` : ''}{selected.method ? ` · ${selected.method}` : ''}{selected.adjusted ? ' · edited' : ''}{selected.late ? ` · late ${selected.lateMinutes}m` : ''}
                    </Text>
                  ) : selected.holiday ? (
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>{selected.holiday.name || 'Optional holiday availed'}</Text>
                  ) : selRequested ? (
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>Waiting for HR. The day turns into paid leave once it is approved.</Text>
                  ) : selected.state === 'absent' ? (
                    <Pressable onPress={() => askLeaveFor(selected.day)} accessibilityRole="button" className="flex-row items-center justify-center gap-2"
                      style={{ marginTop: 10, height: 44, borderRadius: 999, backgroundColor: colors.primary }}>
                      <Palmtree size={17} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Apply paid leave for this day</Text>
                    </Pressable>
                  ) : selected.state === 'noData' ? (
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>Before your first punch — not counted as an absence.</Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Legend */}
            <View className="flex-row flex-wrap" style={{ gap: 10, marginBottom: 16, paddingHorizontal: 4 }}>
              {(['present', 'absent', 'leave', 'holiday', 'weekOff'] as DayState[]).map((s) => (
                <View key={s} className="flex-row items-center gap-1">
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: STATE_COLORS[s] }} />
                  <Text style={{ color: colors.coolText, fontSize: 11 }}>{STATE_LABELS[s]}</Text>
                </View>
              ))}
              <View className="flex-row items-center gap-1">
                <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal }} />
                <Text style={{ color: colors.coolText, fontSize: 11 }}>Leave requested</Text>
              </View>
            </View>
            {openAbsent.length ? (
              <Text style={{ color: colors.coolText, fontSize: 11.5, marginTop: -8, marginBottom: 16, paddingHorizontal: 4 }}>Tap a red day to ask for paid leave for it.</Text>
            ) : null}

            {/* Holiday list for the branch country */}
            <View className="flex-row items-center gap-1.5" style={{ marginBottom: 8, paddingHorizontal: 4 }}>
              <CalendarDays size={13} color={colors.orange} />
              <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>UPCOMING HOLIDAYS</Text>
            </View>
            {holidays === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : holidays.length === 0 ? (
              <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No published holiday list for your branch yet.</Text>
            ) : upcoming.length === 0 ? (
              <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No holidays left this year.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {upcoming.map((h, i) => {
                  // `upcoming` is the published list filtered to today-or-later, so the first row IS
                  // the next holiday — it gets the solid date chip and the deeper wash so the one
                  // that actually matters is the one the eye lands on.
                  const next = i === 0;
                  return (
                  <View key={h.date} className="flex-row items-center gap-3 p-3" style={{ backgroundColor: next ? HOLIDAY_NEXT_BG : HOLIDAY_BG, borderWidth: 1, borderColor: next ? HOLIDAY_NEXT_EDGE : HOLIDAY_EDGE, borderRadius: 14 }}>
                    <View style={{ alignItems: 'center', width: 44, backgroundColor: next ? colors.orange : undefined, borderRadius: next ? 10 : 0, paddingVertical: next ? 5 : 0 }}>
                      <Text style={{ color: next ? '#fff' : colors.orange, fontSize: 16, fontWeight: '800' }}>{Number(h.date.slice(8, 10))}</Text>
                      <Text style={{ color: next ? 'rgba(255,255,255,0.88)' : colors.coolText, fontSize: 10, fontWeight: '700' }}>{new Date(h.date + 'T00:00:00').toLocaleDateString([], { month: 'short' }).toUpperCase()}</Text>
                    </View>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: next ? '700' : '600' }}>{h.name}{h.movable ? ' *' : ''}</Text>
                      <Text style={{ color: next ? HOLIDAY_NEXT_INK : colors.coolText, fontSize: 11.5, fontWeight: next ? '600' : '400' }}>
                        {h.weekday}{h.kind === 'optional' ? ' · optional (prior approval)' : next ? ' · next up' : ''}
                      </Text>
                    </View>
                  </View>
                  );
                })}
                <Text style={{ color: colors.coolText, fontSize: 10.5, textAlign: 'center', marginTop: 4 }}>* subject to moon sighting — the date may shift</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <AbsentLeaveSheet
        visible={leaveDay !== null}
        days={openAbsent}
        initialDay={leaveDay}
        today={data?.today ?? leave?.today ?? new Date().toISOString().slice(0, 10)}
        balance={leave?.balance?.balance ?? null}
        halfDayAllowed={!!leave?.features?.halfDay}
        onClose={() => setLeaveDay(null)}
        onSent={loadLeave}
      />
    </SafeAreaView>
  );
}

const Tile = memo(function Tile({ n, label, color, onPress }: { n: number; label: string; color: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${n} ${label}. Apply paid leave` : undefined}
      style={{ flex: 1, padding: 10, borderRadius: 14, alignItems: 'center', backgroundColor: color + '12' }}>
      <Text style={{ color, fontSize: 20, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
});
