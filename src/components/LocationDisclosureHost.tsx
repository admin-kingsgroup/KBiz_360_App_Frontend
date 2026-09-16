import { useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { MapPin, Check } from 'lucide-react-native';
import { colors } from '../theme';
import { LOCATION_DISCLOSURE } from '../logic/locationDisclosure';
import { usePendingLocationDisclosure, answerLocationDisclosure, setLocationDisclosureHostMounted } from '../services/locationDisclosure';

// App-wide host for the location "prominent disclosure" (Google Play User Data policy). Mounted
// once in the root layout, above the navigator. Shows whenever a caller awaits
// requestLocationWithDisclosure(); the OS location dialog fires only after "I agree". Rules kept
// here on purpose: one topic only (location), no auto-dismiss, an explicit affirmative button,
// and the decline path never opens the OS dialog.
export function LocationDisclosureHost() {
  const purpose = usePendingLocationDisclosure();
  useEffect(() => {
    setLocationDisclosureHostMounted(true);
    return () => setLocationDisclosureHostMounted(false);
  }, []);
  if (!purpose) return null;
  const copy = LOCATION_DISCLOSURE[purpose];
  const decline = (): void => answerLocationDisclosure(false);
  const agree = (): void => answerLocationDisclosure(true);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={decline}>
      <View style={{ flex: 1, backgroundColor: 'rgba(12,14,20,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 420, maxHeight: '88%', borderRadius: 22, backgroundColor: colors.card, overflow: 'hidden' }}>
          <ScrollView contentContainerStyle={{ padding: 22 }} bounces={false}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <MapPin size={26} color={colors.primary} />
            </View>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 }}>{copy.title}</Text>
            <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 21, marginBottom: 14 }}>{copy.body}</Text>
            {copy.points.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Check size={12} color={colors.primary} strokeWidth={3} />
                </View>
                <Text style={{ flex: 1, color: colors.coolText, fontSize: 13.5, lineHeight: 19 }}>{p}</Text>
              </View>
            ))}
            <Text style={{ color: colors.coolText3, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 18 }}>
              Tap “I agree” to continue — your phone will then ask you to allow location for KBiz 360. You can change this anytime in your phone’s Settings.
            </Text>
            <Pressable onPress={agree} style={{ height: 50, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>I agree</Text>
            </Pressable>
            <Pressable onPress={decline} style={{ height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
              <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '600' }}>Not now</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
