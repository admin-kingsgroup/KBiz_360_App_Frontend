import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Keyboard, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info, Palmtree, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { SheetSave } from '../forms/SheetSave';
import { applyLeave } from '../../api/hr';
import { ApiError } from '../../api/client';
import { dayLabel, leaveDraftError } from '../../logic/leave';
import { useUiStore } from '../../store/uiStore';

export interface AbsentLeaveSheetProps {
  visible: boolean;
  /** Absent days ('YYYY-MM-DD') that have no leave request yet — the choices offered. */
  days: string[];
  /** The day the sheet opens on (the one tapped). */
  initialDay: string | null;
  today: string;
  balance: number | null;
  halfDayAllowed: boolean; // server feature flag (MyLeave.features.halfDay)
  onClose: () => void;
  onSent: () => void;
}

// "Apply paid leave" for an ABSENT day, opened from the My Attendance calendar. Files the same
// one-day application the Paid leave screen sends (applyLeave), so HR decides it on the ERP the
// same way; the day only turns into paid leave once HR approves it.
export function AbsentLeaveSheet({ visible, days, initialDay, today, balance, halfDayAllowed, onClose, onSent }: AbsentLeaveSheetProps) {
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const [day, setDay] = useState<string | null>(initialDay);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  // Fresh draft on every open, on the tapped day.
  useEffect(() => {
    if (!visible) return;
    setDay(initialDay ?? days[0] ?? null);
    setHalf(false);
    setReason('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- days is read once per open, on purpose
  }, [visible, initialDay]);

  const error = day ? leaveDraftError({ from: day, to: day, reason }, today) : 'Pick the day';
  // An empty reason just keeps the button disabled; any OTHER problem (e.g. the day is too far
  // back) is said at once, since typing a reason would not fix it.
  const shownError = error && !(error.startsWith('Say why') && !reason.trim()) ? error : null;
  const askHalf = half && halfDayAllowed;

  const send = (): void => {
    if (!day || error || sending) return;
    Keyboard.dismiss();
    setSending(true);
    applyLeave({ from: day, to: day, reason: reason.trim(), ...(askHalf ? { dayType: 'half' as const } : {}) })
      .then(() => {
        showToast('Leave request sent to HR');
        onSent();
        onClose();
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not send the request'))
      .finally(() => setSending(false));
  };

  const close = (): void => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: Math.max(24, insets.bottom + 14) }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>

            <View className="flex-row items-center gap-3 px-5">
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.teal + '1A', alignItems: 'center', justifyContent: 'center' }}>
                <Palmtree size={20} color={colors.teal} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Apply paid leave</Text>
                <Text style={{ color: colors.coolText, fontSize: 12.5 }}>Turn an absent day into paid leave. HR approves it.</Text>
              </View>
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={colors.coolText} />
              </Pressable>
            </View>

            <View className="px-5" style={{ marginTop: 14 }}>
              <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>ABSENT DAY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                {days.map((d) => {
                  const on = d === day;
                  return (
                    <Pressable key={d} onPress={() => setDay(d)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: on ? colors.primary : colors.ink, fontSize: 14, fontWeight: '700' }}>{dayLabel(d)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {halfDayAllowed ? (
              <View className="px-5" style={{ marginTop: 14 }}>
                <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>LEAVE FOR</Text>
                <View className="flex-row" style={{ gap: 6, backgroundColor: colors.coolMuted, borderRadius: 14, padding: 4 }}>
                  {([['Full day', false], ['Half day', true]] as const).map(([label, val]) => {
                    const on = half === val;
                    return (
                      <Pressable key={label} onPress={() => setHalf(val)} accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.card : 'transparent' }}>
                        <Text style={{ color: on ? colors.primary : colors.coolText, fontSize: 14, fontWeight: '700' }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View className="flex-row items-center gap-2 mx-5" style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.orange + '1F' }}>
              <Info size={17} color="#8A5E14" />
              <Text style={{ flex: 1, color: '#6B4508', fontSize: 12.5 }}>
                Leave balance: <Text style={{ fontWeight: '800' }}>{balance == null ? '–' : `${balance} day${balance === 1 ? '' : 's'}`}</Text>. HR decides whether the day is paid.
              </Text>
            </View>

            <View className="px-5" style={{ marginTop: 14 }}>
              <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>REASON</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="For example, I was unwell"
                placeholderTextColor={colors.coolText3}
                maxLength={300}
                multiline
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
                accessibilityLabel="Reason"
                style={{ minHeight: 52, borderRadius: 12, backgroundColor: colors.coolMuted, paddingHorizontal: 12, paddingVertical: 12, color: colors.ink, fontSize: 14, textAlignVertical: 'top' }}
              />
            </View>

            <View className="px-5" style={{ marginTop: 12 }}>
              {shownError ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{error}</Text> : null}
              <SheetSave label={sending ? 'Sending…' : 'Send to HR'} disabled={!!error || sending} onPress={send} />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
