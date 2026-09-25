import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, Check, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { to12h, to24h } from '../../logic/timeWheel';
import { buildDayTimes, localDayKey, seedDayTimes, type DayTimesDraft } from '../../logic/attendanceEdit';
import { SheetSave } from '../forms/SheetSave';
import { TimeWheel } from '../forms/TimeWheel';

// The day whose times are being edited (a row of the admin's per-person history list).
export interface DayTimesTarget {
  date: string; // 'YYYY-MM-DD'
  inTime: string | null; // ISO — null = absent
  outTime: string | null; // ISO — null = still in (today) / never closed
  via?: string | null;
}

export interface DayTimesSheetProps {
  target: DayTimesTarget | null; // null = closed
  name: string;
  dateLabel: string;
  saving: boolean;
  onClose: () => void;
  onSave: (body: { checkInAt: string; checkOutAt: string | null }) => void;
}

const fmtHM = (hour: number, minute: number): string => {
  const { h12, meridiem } = to12h(hour);
  return `${h12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};
const EMPTY: DayTimesTarget = { date: '', inTime: null, outTime: null };

// Super-admin bottom sheet: edit one day's check-in and check-out (app/attendance.tsx). One
// alarm-style wheel (the reminder picker's TimeWheel) edits whichever of the two times is selected
// above it; today may also be left open ("still in"). Validation mirrors the server's bounds, so
// the Save button explains the problem instead of bouncing off a 400. Stays mounted between opens.
export function DayTimesSheet({ target, name, dateLabel, saving, onClose, onSave }: DayTimesSheetProps) {
  const insets = useSafeAreaInsets(); // keep the sheet clear of the Android nav bar / iOS home indicator
  const [draft, setDraft] = useState<DayTimesDraft>(() => seedDayTimes(EMPTY, new Date()));
  const [which, setWhich] = useState<'in' | 'out'>('in');
  const [openSeq, setOpenSeq] = useState(0); // remount key so the wheel re-seeds on each open

  // Re-seed each time a day is opened.
  useEffect(() => {
    if (!target) return;
    setDraft(seedDayTimes(target, new Date()));
    setWhich('in');
    setOpenSeq((n) => n + 1);
  }, [target]);

  const isToday = !!target && target.date === localDayKey(new Date());
  const result = target ? buildDayTimes(target.date, draft, new Date()) : null;
  const error = result && !result.ok ? result.error : null;

  const hour = which === 'in' ? draft.inHour : draft.outHour;
  const minute = which === 'in' ? draft.inMinute : draft.outMinute;
  // Per-axis updates composed with functional setState (see TimeWheel) — the wheel owns its
  // position after mount, so a same-frame hour+meridiem commit must not clobber the other.
  const setHour = (f: (h: number) => number): void =>
    setDraft((d) => (which === 'in' ? { ...d, inHour: f(d.inHour) } : { ...d, outHour: f(d.outHour) }));
  const setMinute = (m: number): void =>
    setDraft((d) => (which === 'in' ? { ...d, inMinute: m } : { ...d, outMinute: m }));

  // Re-validate at press time — the render-time check goes stale while the sheet sits open.
  const save = (): void => {
    if (!target) return;
    const r = buildDayTimes(target.date, draft, new Date());
    if (!r.ok) return;
    onSave({ checkInAt: r.checkInAt, checkOutAt: r.checkOutAt });
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-1">
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Edit check-in &amp; check-out</Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                {name} · {dateLabel}{target?.via ? ` · ${target.via}` : target && !target.inTime ? ' · marked absent' : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={9} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
          </View>

          {/* Which of the two times the wheel edits */}
          <View className="flex-row gap-2 px-5 pt-3">
            <TimeChip label="Check-in" Icon={ArrowDownLeft} value={fmtHM(draft.inHour, draft.inMinute)} active={which === 'in'} onPress={() => setWhich('in')} />
            <TimeChip label="Check-out" Icon={ArrowUpRight} value={draft.hasOut ? fmtHM(draft.outHour, draft.outMinute) : 'Still in'} active={which === 'out'} onPress={() => setWhich('out')} />
          </View>

          {which === 'out' && !draft.hasOut ? (
            <View style={{ height: 210, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>No check-out — the day stays open, and the 10pm sweep closes it if nobody punches out.</Text>
            </View>
          ) : (
            <TimeWheel
              key={`${openSeq}-${which}`}
              hour={hour}
              minute={minute}
              onHour12={(h12) => setHour((h) => to24h(h12, to12h(h).meridiem))}
              onMinute={setMinute}
              onMeridiem={(mer) => setHour((h) => to24h(to12h(h).h12, mer))}
            />
          )}

          {/* Only today may be left open — a past day always needs a check-out. */}
          {isToday ? (
            <Pressable onPress={() => setDraft((d) => ({ ...d, hasOut: !d.hasOut }))} accessibilityRole="checkbox" accessibilityState={{ checked: !draft.hasOut }} className="flex-row items-center gap-2 mx-5" style={{ paddingVertical: 8 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: draft.hasOut ? colors.coolDivider : colors.primary, backgroundColor: draft.hasOut ? 'transparent' : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                {!draft.hasOut ? <Check size={13} color="#fff" /> : null}
              </View>
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>Still in — no check-out yet</Text>
            </Pressable>
          ) : null}

          <View className="px-5 pt-1">
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>Times are on this phone’s clock. The original punch (method, photos) is kept and the day is marked as edited.</Text>
            {error ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{error}</Text> : null}
            <SheetSave label={saving ? 'Saving…' : 'Save times'} disabled={!!error || saving} onPress={save} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TimeChip({ label, value, Icon, active, onPress }: { label: string; value: string; Icon: typeof ArrowDownLeft; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: active ? colors.primary : colors.coolDivider, backgroundColor: active ? colors.primarySoft : colors.card }}>
      <View className="flex-row items-center gap-1">
        <Icon size={13} color={active ? colors.primary : colors.coolText} />
        <Text style={{ color: active ? colors.primary : colors.coolText, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      </View>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Pressable>
  );
}
