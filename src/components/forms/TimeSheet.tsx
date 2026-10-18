import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors } from '../../theme';
import { to12h, to24h } from '../../logic/timeWheel';
import { defaultTimeFor, formatTimeOfDay, isPastTime, type TimeOfDay } from '../../logic/reminderTime';
import { SheetSave } from './SheetSave';
import { TimeWheel } from './TimeWheel';

// Bottom-sheet time-of-day picker for a reminder's due day (owner 2026-10-18). Alarm-style wheels
// (pure JS, OTA-safe). A time that has already gone by on `day` cannot be set.
export interface TimeSheetProps {
  visible: boolean;
  day: string | null; // YYYY-MM-DD the time is on
  initial: TimeOfDay | null;
  onClose: () => void;
  onConfirm: (t: TimeOfDay) => void;
}

export function TimeSheet({ visible, day, initial, onClose, onConfirm }: TimeSheetProps) {
  const insets = useSafeAreaInsets();
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const [openSeq, setOpenSeq] = useState(0); // remount key so the wheels re-seed on each open

  useEffect(() => {
    if (!visible) return;
    const t = initial ?? defaultTimeFor(day);
    setHour(t.hour); setMinute(t.minute);
    setOpenSeq((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const [, nudge] = useState(0); // re-render so a press-time past-check can show the warning
  const chosen = { hour, minute };
  const past = !!day && isPastTime(day, chosen);
  // Re-check at press time — the render-time check goes stale while the sheet sits open.
  const confirm = (): void => {
    if (day && isPastTime(day, { hour, minute })) { nudge((n) => n + 1); return; }
    onConfirm({ hour, minute });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16) }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-2">
            <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Choose time</Text>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
          </View>
          {/* Per-axis callbacks composed with functional setState so same-frame commits can't clobber each other. */}
          <TimeWheel
            key={openSeq}
            hour={hour}
            minute={minute}
            onHour12={(h12) => setHour((h) => to24h(h12, to12h(h).meridiem))}
            onMinute={setMinute}
            onMeridiem={(mer) => setHour((h) => to24h(to12h(h).h12, mer))}
          />
          <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
            {past ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>That time has already gone by today — pick a later one.</Text> : null}
            <SheetSave label={`Set ${formatTimeOfDay(chosen)}`} disabled={past} onPress={confirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
