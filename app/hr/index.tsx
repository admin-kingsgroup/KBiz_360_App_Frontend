import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getMyAttendance } from '../../src/api/attendance';
import { getMyAttendanceMonth } from '../../src/api/hr';
import { HrMenuButton, HR_PAGES } from '../../src/components/hr/HrMenu';

// "HH:MM" wall-clock for an ISO timestamp — same format as the Profile hero.
const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
// The ERP accrues 2.5 days a month, so a balance is often fractional — trim '.0', keep '.5'.
const days = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// HR home: opened from the Profile "HR" row. A today-at-a-glance card plus one tile per HR page;
// the header menu (shared with every HR page) moves between them.
export default function HrHome() {
  const router = useRouter();
  const [today, setToday] = useState<{ inTime: string | null; outTime: string | null; exempt: boolean } | null>(null);
  const [month, setMonth] = useState<{ leaveBalance: number | null; present: number; exempt: boolean } | null>(null);

  // Refetch on focus so the card is current after a punch or leave request on a child page.
  // The two fetches fail independently, so one failure never blanks the other half.
  useFocusEffect(useCallback(() => {
    let active = true;
    getMyAttendance()
      .then((m) => { if (active) setToday({ inTime: m.inTime, outTime: m.outTime, exempt: !!m.exempt }); })
      .catch(() => { /* offline — card falls back to '–' */ });
    getMyAttendanceMonth()
      .then((m) => { if (active) setMonth({ leaveBalance: m.leaveBalance?.balance ?? null, present: m.summary.present, exempt: m.exempt }); })
      .catch(() => { /* offline — card falls back to '–' */ });
    return () => { active = false; };
  }, []));

  const exempt = !!today?.exempt || !!month?.exempt;
  const live = !!today?.inTime && !today.outTime;
  const todayStat = !today ? '–'
    : today.inTime ? (today.outTime ? `${hhmm(today.inTime)}–${hhmm(today.outTime)}` : `In ${hhmm(today.inTime)}`)
    : 'Absent';
  const stats = [
    ...(exempt ? [] : [{ k: 'TODAY', v: todayStat, live }]),
    { k: 'LEAVE LEFT', v: month?.leaveBalance != null ? `${days(month.leaveBalance)} days` : '–', live: false },
    { k: 'THIS MONTH', v: month ? `${month.present} present` : '–', live: false },
  ];
  const dateText = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>HR</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Overview</Text>
        </View>
        <HrMenuButton current="home" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}>
        <View style={{ borderRadius: 20, padding: 16, backgroundColor: colors.primary }}>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{dateText}</Text>
          <View className="flex-row" style={{ marginTop: 12 }}>
            {stats.map((s, i) => (
              <View key={s.k} className="flex-row flex-1">
                {i > 0 ? <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 12 }} /> : null}
                <View className="flex-1">
                  <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 9.5, fontWeight: '700', letterSpacing: 1 }}>{s.k}</Text>
                  <View className="flex-row items-center" style={{ gap: 5, marginTop: 3 }}>
                    {s.live ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
                    <Text numberOfLines={1} style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>{s.v}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {HR_PAGES.map((p) => (
            <Pressable key={p.key} onPress={() => router.push(p.href)} android_ripple={{ color: colors.coolMuted }} accessibilityRole="button"
              style={{ width: '47.5%', flexGrow: 1, minHeight: 120, padding: 14, gap: 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${p.tint}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <p.Icon size={20} color={p.tint} />
              </View>
              <View>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{p.label}</Text>
                <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>{p.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
