import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getMyAttendanceMonth, getHolidays, type MyAttendanceMonth, type MonthDay, type HolidayRow, type DayState } from '../../src/api/hr';

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

  const load = useCallback((m: string): void => {
    setData(null); setSelected(null); setFailed(false);
    getMyAttendanceMonth(m).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(month); }, [month, load]);
  useEffect(() => {
    getHolidays(Number(month.slice(0, 4))).then((h) => setHolidays(h.published ? h.holidays : [])).catch(() => setHolidays([]));
  }, [month]);

  // Monday-first grid: leading blanks so day 1 lands on its weekday column.
  const cells = useMemo(() => {
    if (!data) return [] as (MonthDay | null)[];
    const lead = (new Date(`${data.month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
    return [...Array.from({ length: lead }, () => null), ...data.days];
  }, [data]);

  const upcoming = useMemo(() => {
    if (!holidays || !data) return [];
    return holidays.filter((h) => h.date >= data.today).slice(0, 8);
  }, [holidays, data]);

  const canGoNext = month < thisMonth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>My Attendance</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{data ? `${data.employee.branch || '—'} branch calendar` : 'Month view'}</Text>
        </View>
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
              <Tile n={data.summary.absent} label="Absent" color={colors.danger} />
              <Tile n={data.summary.leave} label="Leave" color={colors.teal} />
              <Tile n={data.summary.lateMarks} label="Late" color={colors.orange} />
            </View>
            <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
              {data.summary.hoursTotal}h worked · avg {data.summary.avgHours}h/day
              {data.leaveBalance ? ` · leave balance ${data.leaveBalance.balance}d at month end` : ''}
            </Text>
            {data.beforeFirstPunch ? (
              <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
                This month is before your first punch in the app — blank days are no data, not absences.
              </Text>
            ) : null}

            {/* Calendar grid (Monday-first) */}
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 16, padding: 10, marginBottom: 12 }}>
              <View className="flex-row">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                  <View key={i} style={{ flexBasis: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ color: i === 6 ? colors.danger : colors.coolText, fontSize: 10, fontWeight: '800' }}>{w}</Text>
                  </View>
                ))}
              </View>
              <View className="flex-row flex-wrap">
                {cells.map((d, i) => {
                  if (d === null) return <View key={`b${i}`} style={{ flexBasis: `${100 / 7}%`, height: 42 }} />;
                  const c = STATE_COLORS[d.state];
                  const faint = d.state === 'future' || d.state === 'notEmployed' || d.state === 'noData';
                  const isSel = selected?.day === d.day;
                  const isToday = d.day === data.today;
                  return (
                    <Pressable key={d.day} onPress={() => setSelected(d)} style={{ flexBasis: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: faint ? 'transparent' : c + '22', borderWidth: isSel ? 2 : isToday ? 1.5 : 0, borderColor: isSel ? colors.ink : colors.primary }}>
                        <Text style={{ color: faint ? colors.coolText3 : c, fontSize: 13, fontWeight: '700' }}>{Number(d.day.slice(8, 10))}</Text>
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
                    {new Date(selected.day + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} · <Text style={{ color: STATE_COLORS[selected.state] }}>{STATE_LABELS[selected.state]}{selected.halfLeave ? ' · half-day leave' : ''}{selected.granted && selected.state === 'weekOff' ? ' (granted)' : ''}</Text>
                  </Text>
                  {selected.state === 'present' ? (
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>
                      In {fmtT(selected.checkInAt)} · Out {selected.open ? 'still in' : fmtT(selected.checkOutAt)}{selected.hours != null ? ` · ${selected.hours}h` : ''}{selected.method ? ` · ${selected.method}` : ''}{selected.adjusted ? ' · edited' : ''}{selected.late ? ` · late ${selected.lateMinutes}m` : ''}
                    </Text>
                  ) : selected.holiday ? (
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>{selected.holiday.name || 'Optional holiday availed'}</Text>
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
            </View>

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
                {upcoming.map((h) => (
                  <View key={h.date} className="flex-row items-center gap-3 p-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 14 }}>
                    <View style={{ alignItems: 'center', width: 44 }}>
                      <Text style={{ color: colors.orange, fontSize: 16, fontWeight: '800' }}>{Number(h.date.slice(8, 10))}</Text>
                      <Text style={{ color: colors.coolText, fontSize: 10, fontWeight: '700' }}>{new Date(h.date + 'T00:00:00').toLocaleDateString([], { month: 'short' }).toUpperCase()}</Text>
                    </View>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{h.name}{h.movable ? ' *' : ''}</Text>
                      <Text style={{ color: colors.coolText, fontSize: 11.5 }}>{h.weekday}{h.kind === 'optional' ? ' · optional (prior approval)' : ''}</Text>
                    </View>
                  </View>
                ))}
                <Text style={{ color: colors.coolText, fontSize: 10.5, textAlign: 'center', marginTop: 4 }}>* subject to moon sighting — the date may shift</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Tile = memo(function Tile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 14, alignItems: 'center', backgroundColor: color + '12' }}>
      <Text style={{ color, fontSize: 20, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
});
