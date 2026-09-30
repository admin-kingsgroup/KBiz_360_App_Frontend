import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, BellOff } from 'lucide-react-native';
import { colors } from '../../theme';
import { usePulseStore } from '../../store/pulseStore';
import { useUiStore } from '../../store/uiStore';
import { ALERT_MUTE_CHOICES, muteLabel, muteStateOf } from '../../logic/alertMutes';

// What the sheet mutes: one alert card or screen, which may stand for several branch channels.
export interface AlertMuteTarget { name: string; channelIds: string[]; }

// Mute / unmute an alert for the signed-in user only (logic/alertMutes). The events keep showing
// in the Alerts tab; muting stops the push notifications and the tab-badge count. Opened by
// long-pressing an alert card, or from the bell in the alert screen's header.
export function AlertMuteSheet({ target, onClose }: { target: AlertMuteTarget | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const mutes = usePulseStore((s) => s.mutes);
  const showToast = useUiStore((s) => s.showToast);
  if (!target) return null;
  const state = muteStateOf(mutes, target.channelIds);

  const apply = (muted: boolean, hours: number | null = null): void => {
    onClose();
    usePulseStore.getState().setMuted(target.channelIds, muted, hours)
      .then(() => showToast(muted ? `${target.name} muted` : `${target.name} unmuted`))
      .catch(() => showToast(muted ? 'Could not mute — try again' : 'Could not unmute — try again'));
  };

  const rows = [
    ...(state.all ? [] : ALERT_MUTE_CHOICES.map((c) => ({
      key: c.label, label: c.hours === null ? 'Mute always' : `Mute for ${c.label}`, Icon: BellOff, onPress: () => apply(true, c.hours),
    }))),
    ...(state.some ? [{ key: 'unmute', label: 'Unmute', Icon: Bell, onPress: () => apply(false) }] : []),
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16, paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider, marginBottom: 8 }} />
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '700', paddingHorizontal: 20 }}>
            {state.all ? muteLabel(state.until) : `Mute ${target.name}`}
          </Text>
          <Text style={{ color: colors.coolText, fontSize: 13, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>
            {state.all
              ? 'These alerts are not notifying you. They still show here.'
              : 'You will still see these alerts here — they just will not notify you.'}
          </Text>
          {rows.map((r, i) => (
            <Pressable key={r.key} onPress={r.onPress} android_ripple={{ color: colors.coolMuted }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
              <r.Icon size={20} color={colors.coolText} />
              <Text style={{ color: colors.ink, fontSize: 15.5 }}>{r.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
