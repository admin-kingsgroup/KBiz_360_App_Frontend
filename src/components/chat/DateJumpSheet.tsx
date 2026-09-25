import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors } from '../../theme';

// WhatsApp-style "jump to date" calendar for the in-chat search. The mirror image of the reminder
// DateTimeSheet: PAST days are pickable and the future is blocked (there are no messages there
// yet). Tapping a day jumps immediately — no confirm step, exactly like WhatsApp's calendar.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface DateJumpSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (dayStart: Date) => void; // local midnight of the tapped day
}

export function DateJumpSheet({ visible, onClose, onPick }: DateJumpSheetProps) {
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  // Re-open lands on the current month, not wherever the last browse wandered off to.
  useEffect(() => {
    if (!visible) return;
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth());
  }, [visible]);

  // Calendar cells: leading blanks so day 1 lands on its weekday (Monday-first).
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: (first.getDay() + 6) % 7 }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [year, month]);

  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const goMonth = (delta: number): void => {
    if (delta > 0 && atCurrentMonth) return; // no browsing into the future
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };
  const isFutureDay = (d: number): boolean => atCurrentMonth && d > now.getDate();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-1">
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Jump to date</Text>
            <Pressable onPress={onClose} hitSlop={9} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>

          {/* Month header */}
          <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <Pressable onPress={() => goMonth(-1)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
              <ChevronLeft size={16} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800' }}>{MONTHS[month]} {year}</Text>
            <Pressable onPress={() => goMonth(1)} disabled={atCurrentMonth} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: atCurrentMonth ? 0.35 : 1 }}>
              <ChevronRight size={16} color={colors.ink} />
            </Pressable>
          </View>

          {/* Weekday row + day grid (7 columns) */}
          <View className="flex-row px-4">
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={{ flexBasis: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: i === 6 ? colors.danger : colors.textMuted, fontSize: 10, fontWeight: '800' }}>{w}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap px-4">
            {cells.map((d, i) => {
              if (d === null) return <View key={`b${i}`} style={{ flexBasis: `${100 / 7}%`, height: 34 }} />;
              const disabled = isFutureDay(d);
              const isToday = atCurrentMonth && d === now.getDate();
              const isSunday = new Date(year, month, d).getDay() === 0;
              return (
                <Pressable key={d} disabled={disabled} onPress={() => onPick(new Date(year, month, d))} style={{ flexBasis: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: isToday ? 1 : 0, borderColor: colors.ink }}>
                    <Text style={{ color: disabled ? (isSunday ? 'rgba(220,38,38,0.45)' : colors.textMuted2) : isSunday ? colors.danger : colors.ink, fontSize: 13, fontWeight: '600' }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
