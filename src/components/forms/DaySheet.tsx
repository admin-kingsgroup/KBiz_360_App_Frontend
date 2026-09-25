import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { SheetSave } from './SheetSave';

// Bottom-sheet DAY picker (pure JS, like DateTimeSheet, so it works in Expo Go). Calendar grid
// only — no time — returning a 'YYYY-MM-DD' key. Unlike DateTimeSheet it may reach a bounded way
// into the past (sick leave is applied after the fact), so the bounds arrive as day keys.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const keyOf = (y: number, m: number, d: number): string => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// Device-local today key (matches the screens' own day keys — never the UTC date).
const localToday = (): string => { const n = new Date(); return keyOf(n.getFullYear(), n.getMonth(), n.getDate()); };

export interface DaySheetProps {
  visible: boolean;
  title: string;
  initial?: string | null; // 'YYYY-MM-DD'
  minDay: string; // inclusive bounds, 'YYYY-MM-DD'
  maxDay: string;
  onClose: () => void;
  onConfirm: (day: string) => void;
}

export function DaySheet({ visible, title, initial, minDay, maxDay, onClose, onConfirm }: DaySheetProps) {
  const insets = useSafeAreaInsets(); // keep the sheet clear of the Android nav bar / iOS home indicator
  const base = initial && /^\d{4}-\d{2}-\d{2}$/.test(initial) ? initial : localToday();
  const [year, setYear] = useState(Number(base.slice(0, 4)));
  const [month, setMonth] = useState(Number(base.slice(5, 7)) - 1); // 0-based
  const [day, setDay] = useState(Number(base.slice(8, 10)));

  // Re-seed each time the sheet opens (it stays mounted between opens).
  useEffect(() => {
    if (!visible) return;
    setYear(Number(base.slice(0, 4)));
    setMonth(Number(base.slice(5, 7)) - 1);
    setDay(Number(base.slice(8, 10)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: (first.getDay() + 6) % 7 }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [year, month]);

  const todayLocal = localToday();
  // Months are navigable while any of their days is inside [minDay..maxDay].
  const canGo = (delta: number): boolean => {
    const d = new Date(year, month + delta, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return mk >= minDay.slice(0, 7) && mk <= maxDay.slice(0, 7);
  };
  const goMonth = (delta: number): void => {
    if (!canGo(delta)) return;
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setDay((prev) => Math.min(prev, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  };

  const chosen = keyOf(year, month, day);
  const outOfBounds = chosen < minDay || chosen > maxDay;
  const confirm = (): void => {
    if (outOfBounds) return;
    onConfirm(chosen);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-1">
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={9} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>

          {/* Month header */}
          <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <Pressable onPress={() => goMonth(-1)} disabled={!canGo(-1)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: canGo(-1) ? 1 : 0.35 }}>
              <ChevronLeft size={16} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800' }}>{MONTHS[month]} {year}</Text>
            <Pressable onPress={() => goMonth(1)} disabled={!canGo(1)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: canGo(1) ? 1 : 0.35 }}>
              <ChevronRight size={16} color={colors.ink} />
            </Pressable>
          </View>

          {/* Weekday row + day grid (Monday-first, Sunday red in the last column) */}
          <View className="flex-row px-4">
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={{ flexBasis: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: i === 6 ? colors.danger : colors.textMuted, fontSize: 10, fontWeight: '800' }}>{w}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap px-4" style={{ marginBottom: 8 }}>
            {cells.map((d, i) => {
              if (d === null) return <View key={`b${i}`} style={{ flexBasis: `${100 / 7}%`, height: 34 }} />;
              const k = keyOf(year, month, d);
              const selected = d === day;
              const disabled = k < minDay || k > maxDay;
              const isToday = k === todayLocal;
              const isSunday = new Date(year, month, d).getDay() === 0;
              return (
                <Pressable key={d} disabled={disabled} onPress={() => setDay(d)} style={{ flexBasis: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.ink : 'transparent', borderWidth: isToday && !selected ? 1 : 0, borderColor: colors.ink }}>
                    <Text style={{ color: disabled ? (isSunday ? 'rgba(220,38,38,0.45)' : colors.textMuted2) : selected ? '#fff' : isSunday ? colors.danger : colors.ink, fontSize: 13, fontWeight: selected ? '800' : '600' }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="px-5 pt-1">
            {outOfBounds ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>That day is out of range</Text> : null}
            <SheetSave label="Set day" disabled={outOfBounds} onPress={confirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
