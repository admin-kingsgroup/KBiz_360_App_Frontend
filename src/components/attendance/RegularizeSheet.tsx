import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, Check, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { to12h, to24h } from '../../logic/timeWheel';
import { buildDayTimes, localDayKey, seedDayTimes, type DayTimesDraft } from '../../logic/attendanceEdit';
import { SheetSave } from '../forms/SheetSave';
import { TimeWheel } from '../forms/TimeWheel';
import type { DayTimesTarget } from './DayTimesSheet';

export interface RegularizeSheetProps {
  target: DayTimesTarget | null; // the day being regularised (null = closed)
  dateLabel: string;
  saving: boolean;
  onClose: () => void;
  onSave: (body: { checkInAt: string; checkOutAt: string | null; reason: string }) => void;
}

const fmtHM = (hour: number, minute: number): string => {
  const { h12, meridiem } = to12h(hour);
  return `${h12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};
const EMPTY: DayTimesTarget = { date: '', inTime: null, outTime: null };

// Self-service "regularise this day" sheet — the employee's version of the admin DayTimesSheet:
// same wheel, same client-side bounds (buildDayTimes mirrors the server), plus a REQUIRED reason.
// Saving files a REQUEST — nothing changes on the record until the Super Admin approves it.
export function RegularizeSheet({ target, dateLabel, saving, onClose, onSave }: RegularizeSheetProps) {
  const insets = useSafeAreaInsets(); // keep the sheet clear of the Android nav bar / iOS home indicator
  const [draft, setDraft] = useState<DayTimesDraft>(() => seedDayTimes(EMPTY, new Date()));
  const [which, setWhich] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState('');
  const [openSeq, setOpenSeq] = useState(0); // remount key so the wheel re-seeds on each open

  // Re-seed each time a day is opened.
  useEffect(() => {
    if (!target) return;
    setDraft(seedDayTimes(target, new Date()));
    setWhich('in');
    setReason('');
    setOpenSeq((n) => n + 1);
  }, [target]);

  const isToday = !!target && target.date === localDayKey(new Date());
  const result = target ? buildDayTimes(target.date, draft, new Date()) : null;
  const timesError = result && !result.ok ? result.error : null;
  const error = timesError ?? (!reason.trim() ? 'Say why — the reason goes to the Super Admin' : null);

  const hour = which === 'in' ? draft.inHour : draft.outHour;
  const minute = which === 'in' ? draft.inMinute : draft.outMinute;
  const setHour = (f: (h: number) => number): void =>
    setDraft((d) => (which === 'in' ? { ...d, inHour: f(d.inHour) } : { ...d, outHour: f(d.outHour) }));
  const setMinute = (m: number): void =>
    setDraft((d) => (which === 'in' ? { ...d, inMinute: m } : { ...d, outMinute: m }));

  // Re-validate at press time — the render-time check goes stale while the sheet sits open.
  const save = (): void => {
    if (!target || !reason.trim()) return;
    const r = buildDayTimes(target.date, draft, new Date());
    if (!r.ok) return;
    onSave({ checkInAt: r.checkInAt, checkOutAt: r.checkOutAt, reason: reason.trim() });
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        {/* No ScrollView here — the TimeWheel owns its own ScrollViews and must not be nested
            inside another vertical one (same rule as DateTimeSheet). The keyboard is handled by
            padding the sheet instead. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-1">
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Ask for a correction</Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                {dateLabel}{target?.via ? ` · recorded via ${target.via}` : target && !target.inTime ? ' · no punch recorded' : ''}
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
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>No check-out — only today can be requested open; a past day always needs one.</Text>
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

          {/* Why — required; travels to the Super Admin with the request. */}
          <View className="px-5 pt-2">
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>REASON</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. The app never fired — I was at the office by 9:40"
              placeholderTextColor={colors.coolText3}
              multiline
              maxLength={300}
              style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top' }}
            />
          </View>

          <View className="px-5 pt-3">
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>This only ASKS for the change — your record is corrected when the Super Admin approves it.</Text>
            {error ? <Text style={{ color: colors.coral, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{error}</Text> : null}
            <SheetSave label={saving ? 'Sending…' : 'Send request'} disabled={!!error || saving} onPress={save} />
          </View>
        </Pressable>
        </KeyboardAvoidingView>
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
