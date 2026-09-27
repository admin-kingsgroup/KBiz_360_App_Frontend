import { View, Text, Pressable, Linking } from 'react-native';
import { MessageCircle, Phone } from 'lucide-react-native';
import { colors } from '../../theme';
import { contactLinks, displayPhone } from '../../logic/contactLinks';
import { useUiStore } from '../../store/uiStore';

// WhatsApp + Call buttons for someone an alert names (a converted lead's client). Tapping the
// number opens a WhatsApp chat with them on THIS phone — the salesperson's own WhatsApp — where
// they can message or call; "Call" opens the dialler for clients who are not on WhatsApp.
export function ContactActions({ phone, onUse }: { phone: string; onUse?: () => void }) {
  const showToast = useUiStore((s) => s.showToast);
  const links = contactLinks(phone);
  if (!links) return null;
  const label = displayPhone(phone);

  const openWhatsApp = async (): Promise<void> => {
    onUse?.();
    // The app scheme first (straight into the chat); wa.me when the scheme has no handler, e.g.
    // only WhatsApp Business is installed on some iPhones — it then opens the app or the browser.
    try { await Linking.openURL(links.whatsapp); return; } catch { /* fall through */ }
    try { await Linking.openURL(links.whatsappWeb); } catch { showToast('Could not open WhatsApp'); }
  };
  const call = (): void => {
    onUse?.();
    Linking.openURL(links.tel).catch(() => showToast('Could not start a call'));
  };

  return (
    <View className="flex-row items-center" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <Pressable onPress={() => { void openWhatsApp(); }} accessibilityRole="button" accessibilityLabel={`WhatsApp ${label}`}
        className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent }}>
        <MessageCircle size={14} color="#fff" strokeWidth={2.4} />
        <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
      </Pressable>
      <Pressable onPress={call} accessibilityRole="button" accessibilityLabel={`Call ${label}`}
        className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.coolMuted }}>
        <Phone size={13} color={colors.ink} strokeWidth={2.4} />
        <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>Call</Text>
      </Pressable>
    </View>
  );
}
