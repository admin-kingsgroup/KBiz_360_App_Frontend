import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { formatTime } from '../../logic/reminderWhen';
import { SheetSave } from './SheetSave';

// Bottom-sheet date & time picker (pure JS — no native picker module, so it works in Expo Go and
// existing dev builds). Calendar month grid + hour/minute chip rows; confirm returns one Date.
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const hourLabel = (h: number): string => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

export interface DateTimeSheetProps {
  visible: boolean;
  initial?: Date | null;
  onClose: () => void;
  onConfirm: (d: Date) => void;
}

export function DateTimeSheet({ visible, initial, onClose, onConfirm }: DateTimeSheetProps) {
  const now = new Date();
  const base = initial ?? new Date(now.getTime() + 3600_000);
  const [year, setYear] = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth()); // 0-based
  const [day, setDay] = useState(base.getDate());
  const [hour, setHour] = useState(base.getHours());
  const [minute, setMinute] = useState(base.getMinutes() - (base.getMinutes() % 5));

  // Re-seed from `initial` each time the sheet opens (it stays mounted between opens).
  useEffect(() => {
    if (!visible) return;
    const b = initial ?? new Date(Date.now() + 3600_000);
    setYear(b.getFullYear()); setMonth(b.getMonth()); setDay(b.getDate());
    setHour(b.getHours()); setMinute(b.getMinutes() - (b.getMinutes() % 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const chosen = new Date(year, month, day, hour, minute, 0, 0);
  const inPast = chosen.getTime() <= Date.now();

  // Calendar cells for the shown month: leading blanks so day 1 lands on its weekday.
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: first.getDay() }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [year, month]);

  const goMonth = (delta: number): void => {
    const d = new Date(year, month + delta, 1);
    // Don't navigate before the current month.
    if (d.getFullYear() < now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth())) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };
  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const isPastDay = (d: number): boolean => atCurrentMonth && d < now.getDate();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-1">
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Date &amp; time</Text>
            <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>

          {/* Month header */}
          <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <Pressable onPress={() => goMonth(-1)} disabled={atCurrentMonth} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: atCurrentMonth ? 0.35 : 1 }}>
              <ChevronLeft size={16} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800' }}>{MONTHS[month]} {year}</Text>
            <Pressable onPress={() => goMonth(1)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
              <ChevronRight size={16} color={colors.ink} />
            </Pressable>
          </View>

          {/* Weekday row + day grid (7 columns) */}
          <View className="flex-row px-4">
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={{ flexBasis: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>{w}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap px-4">
            {cells.map((d, i) => {
              if (d === null) return <View key={`b${i}`} style={{ flexBasis: `${100 / 7}%`, height: 38 }} />;
              const selected = d === day;
              const disabled = isPastDay(d);
              const isToday = atCurrentMonth && d === now.getDate();
              return (
                <Pressable key={d} disabled={disabled} onPress={() => setDay(d)} style={{ flexBasis: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.ink : 'transparent', borderWidth: isToday && !selected ? 1 : 0, borderColor: colors.ink }}>
                    <Text style={{ color: disabled ? colors.textMuted2 : selected ? '#fff' : colors.ink, fontSize: 13, fontWeight: selected ? '800' : '600' }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Time — hour chips then minute chips */}
          <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 8 }}>TIME</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingVertical: 6 }}>
            {HOURS.map((h) => {
              const on = h === hour;
              return (
                <Pressable key={h} onPress={() => setHour(h)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: on ? colors.ink : '#fff', borderColor: on ? colors.ink : colors.cardEdge }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '700' }}>{hourLabel(h)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingBottom: 6 }}>
            {MINUTES.map((m) => {
              const on = m === minute;
              return (
                <Pressable key={m} onPress={() => setMinute(m)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: on ? colors.teal : '#fff', borderColor: on ? colors.teal : colors.cardEdge }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '700' }}>:{m.toString().padStart(2, '0')}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View className="px-5 pt-1">
            {inPast ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>Pick a time in the future</Text> : null}
            <SheetSave label={`Set for ${formatTime(chosen)}`} disabled={inPast} onPress={() => onConfirm(chosen)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
