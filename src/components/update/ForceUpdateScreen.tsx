import { useEffect } from 'react';
import { BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ArrowRight, Check, Download, Lock } from 'lucide-react-native';
import { colors } from '../../theme';
import type { AppVersionPolicy } from '../../api/appVersion';

// Full-screen "Update required" page (approved demo, option A — 2026-10-07). Covers every screen,
// swallows the Android back button, and has no way out except "Update now", which opens the store.
// Mounted by the root layout whenever useForceUpdate() says this version is below the minimum.

const DEFAULT_NOTES = ['Bug fixes and security updates'];

async function openStore(storeUrl: string | null): Promise<void> {
  // Android: the Play Store app first (market://), then the web listing the backend sent.
  const pkg = Constants.expoConfig?.android?.package;
  if (Platform.OS === 'android' && pkg) {
    try {
      await Linking.openURL(`market://details?id=${pkg}`);
      return;
    } catch {
      // No Play Store app on this device — fall through to the web link.
    }
  }
  if (storeUrl) await Linking.openURL(storeUrl).catch(() => undefined);
}

export function ForceUpdateScreen({ policy, currentVersion }: { policy: AppVersionPolicy; currentVersion: string | null }) {
  const insets = useSafeAreaInsets();

  // Back button does nothing while this is up — the app must not be usable behind it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const notes = policy.notes.length ? policy.notes : DEFAULT_NOTES;
  const canOpenStore = Platform.OS === 'android' || !!policy.storeUrl;

  return (
    <View style={[StyleSheet.absoluteFill, s.root]} accessibilityViewIsModal>
      <View style={[s.hero, { paddingTop: insets.top }]}>
        <View style={[s.blob, { top: 40 + insets.top, left: -40, width: 160, height: 160, borderRadius: 80 }]} />
        <View style={[s.blob, { bottom: -50, right: -30, width: 200, height: 200, borderRadius: 100 }]} />
        <View style={s.badge}>
          <Download size={46} color="#fff" strokeWidth={2} />
        </View>
        <View style={s.pill}>
          <Text style={s.pillText}>KBIZ 360 · SMART CONNECT</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
        <View style={{ gap: 8 }}>
          <Text style={s.title} accessibilityRole="header">Update required</Text>
          <Text style={s.lead}>
            A new version of KBiz 360 is on the {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}. Please update to keep using the app.
          </Text>
        </View>

        <View style={s.versions}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.vLabel}>Your version</Text>
            <Text style={s.vOld}>{currentVersion ?? '—'}</Text>
          </View>
          <ArrowRight size={20} color={colors.coolText3} />
          <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
            <Text style={s.vLabel}>New version</Text>
            <Text style={s.vNew}>{policy.minVersion}</Text>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={s.section}>WHAT'S NEW</Text>
          {notes.map((n) => (
            <View key={n} style={s.noteRow}>
              <Check size={18} color={colors.primary} strokeWidth={2.4} style={{ marginTop: 2 }} />
              <Text style={s.noteText}>{n}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: 28 + insets.bottom }]}>
        {canOpenStore ? (
          <Pressable
            onPress={() => void openStore(policy.storeUrl)}
            accessibilityRole="button"
            accessibilityLabel="Update now"
            style={({ pressed }) => [s.cta, pressed && { backgroundColor: colors.primaryDark }]}
          >
            <Download size={20} color="#fff" strokeWidth={2.2} />
            <Text style={s.ctaText}>Update now</Text>
          </Pressable>
        ) : null}
        <View style={s.lockRow}>
          <Lock size={14} color={colors.coolText} />
          <Text style={s.lockText}>The app stays locked until you update</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: '#fff', zIndex: 1000, elevation: 1000 },
  hero: { height: 300, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 18, overflow: 'hidden' },
  blob: { position: 'absolute', backgroundColor: '#D3EBE5' },
  badge: {
    width: 96, height: 96, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 12 }, elevation: 8,
  },
  pill: { height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: '#fff', justifyContent: 'center' },
  pillText: { color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20, gap: 20 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: '#101828' },
  lead: { fontSize: 15, lineHeight: 22, color: '#475467' },
  versions: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 1, borderColor: colors.coolDivider,
  },
  vLabel: { fontSize: 12, fontWeight: '600', color: colors.coolText },
  vOld: { fontSize: 17, fontWeight: '700', color: colors.textBody },
  vNew: { fontSize: 17, fontWeight: '800', color: colors.primary },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: colors.coolText },
  noteRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 14.5, lineHeight: 21, color: colors.textBody },
  footer: { paddingHorizontal: 24, paddingTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.coolMuted },
  cta: { height: 54, borderRadius: 16, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  lockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  lockText: { fontSize: 12.5, color: colors.coolText },
});
