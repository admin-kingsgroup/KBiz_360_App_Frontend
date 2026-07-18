import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { formatWhenLabel } from '../../logic/reminderWhen';
import { to12h, to24h } from '../../logic/timeWheel';
import { SheetSave } from './SheetSave';
import { TimeWheel } from './TimeWheel';

// Bottom-sheet date & time picker (pure JS — no native picker module, so it works in Expo Go and
// existing dev builds). Calendar month grid + alarm-style scroll wheels; confirm returns one Date.
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface DateTimeSheetProps {
  visible: boolean;
  initial?: Date | null;
  onClose: () => void;
  onConfirm: (d: Date) => void;
}

export function DateTimeSheet({ visible, initial, onClose, onConfirm }: DateTimeSheetProps) {
  const insets = useSafeAreaInsets(); // keep the sheet clear of the Android nav bar / iOS home indicator
  const now = new Date();
  const base = initial ?? new Date(now.getTime() + 3600_000);
  const [year, setYear] = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth()); // 0-based
  const [day, setDay] = useState(base.getDate());
  const [hour, setHour] = useState(base.getHours());
  const [minute, setMinute] = useState(base.getMinutes());
  const [openSeq, setOpenSeq] = useState(0); // remount key so the wheels re-seed on each open

  // Re-seed from `initial` each time the sheet opens (it stays mounted between opens).
  useEffect(() => {
    if (!visible) return;
    const b = initial ?? new Date(Date.now() + 3600_000);
    setYear(b.getFullYear()); setMonth(b.getMonth()); setDay(b.getDate());
    setHour(b.getHours()); setMinute(b.getMinutes());
    setOpenSeq((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const [, nudge] = useState(0); // re-render hook so a press-time past-check can surface the warning row
  const chosen = new Date(year, month, day, hour, minute, 0, 0);
  const inPast = chosen.getTime() <= Date.now();

  // Re-validate at press time — the render-time check goes stale while the sheet sits open.
  const confirm = (): void => {
    const d = new Date(year, month, day, hour, minute, 0, 0);
    if (d.getTime() <= Date.now()) { nudge((n) => n + 1); return; }
    onConfirm(d);
  };

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
    // Clamp so e.g. Jan 31 → Feb lands on Feb 28, not silently overflowing into March.
    setDay((prev) => Math.min(prev, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  };
  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const isPastDay = (d: number): boolean => atCurrentMonth && d < now.getDate();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16), maxHeight: '90%' }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-1">
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Date &amp; time</Text>
            <Pressable onPress={onClose} hitSlop={9} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>

          {/* Calendar scrolls within its own area on short screens so the wheels/footer stay reachable.
              (The TimeWheel's ScrollViews are siblings of this one, never nested inside it.) */}
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
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
              if (d === null) return <View key={`b${i}`} style={{ flexBasis: `${100 / 7}%`, height: 34 }} />;
              const selected = d === day;
              const disabled = isPastDay(d);
              const isToday = atCurrentMonth && d === now.getDate();
              return (
                <Pressable key={d} disabled={disabled} onPress={() => setDay(d)} style={{ flexBasis: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.ink : 'transparent', borderWidth: isToday && !selected ? 1 : 0, borderColor: colors.ink }}>
                    <Text style={{ color: disabled ? colors.textMuted2 : selected ? '#fff' : colors.ink, fontSize: 13, fontWeight: selected ? '800' : '600' }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          </ScrollView>

          {/* Time — alarm-style snap wheels with AM/PM pills on the centre row. Per-axis callbacks
              composed with functional setState so same-frame commits can't clobber each other. */}
          <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 8 }}>TIME</Text>
          <TimeWheel
            key={openSeq}
            hour={hour}
            minute={minute}
            onHour12={(h12) => setHour((h) => to24h(h12, to12h(h).meridiem))}
            onMinute={setMinute}
            onMeridiem={(mer) => setHour((h) => to24h(to12h(h).h12, mer))}
          />

          <View className="px-5 pt-1">
            {inPast ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>Pick a time in the future</Text> : null}
            <SheetSave label={`Set for ${formatWhenLabel(chosen)}`} disabled={inPast} onPress={confirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
