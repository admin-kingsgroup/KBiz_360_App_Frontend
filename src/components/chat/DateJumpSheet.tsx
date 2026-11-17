import { textStyles } from '../../theme/typography';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { AnchoredMenu, type AnchorRect } from '../ui/AnchoredMenu';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors } from '../../theme';

// WhatsApp-style "jump to date" calendar for the in-chat search. The mirror image of the reminder
// DateTimeSheet: PAST days are pickable and the future is blocked (there are no messages there
// yet). Tapping a day jumps immediately — no confirm step, exactly like WhatsApp's calendar.
// It opens from the calendar button as a card (AnchoredMenu) — it was a bottom sheet over a dark scrim
// (owner, 2026-11-17).
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface DateJumpSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (dayStart: Date) => void; // local midnight of the tapped day
  /** The calendar button that opened it; without one the card opens mid-screen. */
  anchor?: AnchorRect | null;
}

export function DateJumpSheet({ visible, onClose, onPick, anchor }: DateJumpSheetProps) {
  const { width: winW, height: winH } = useWindowDimensions();
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
    <AnchoredMenu anchor={visible ? (anchor ?? { x: winW / 2 - 160, y: winH / 4, width: 320, height: 0 }) : null}
      onClose={onClose} width={340} background={colors.paper} border={colors.cardEdge} label="Jump to date">
      <View style={{ paddingBottom: 14 }}>
          <View className="flex-row items-center justify-between" style={{ paddingLeft: 20, paddingRight: 14, paddingTop: 12 }}>
            <Text style={{ color: colors.ink, ...textStyles.headline }}>Jump to date</Text>
            <Pressable onPress={onClose} hitSlop={9} accessibilityRole="button" accessibilityLabel="Close"
              style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>

          {/* Month header */}
          <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <Pressable onPress={() => goMonth(-1)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
              <ChevronLeft size={16} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.ink, ...textStyles.headline }}>{MONTHS[month]} {year}</Text>
            <Pressable onPress={() => goMonth(1)} disabled={atCurrentMonth} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, opacity: atCurrentMonth ? 0.35 : 1 }}>
              <ChevronRight size={16} color={colors.ink} />
            </Pressable>
          </View>

          {/* Weekday row + day grid (7 columns) */}
          <View className="flex-row px-4">
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={{ flexBasis: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: i === 6 ? colors.danger : colors.textMuted, ...textStyles.caption2, fontWeight: '600' }}>{w}</Text>
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
                    <Text style={{ color: disabled ? (isSunday ? 'rgba(220,38,38,0.45)' : colors.textMuted2) : isSunday ? colors.danger : colors.ink, ...textStyles.callout }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
      </View>
    </AnchoredMenu>
  );
}
