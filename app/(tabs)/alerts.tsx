import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SystemAlertsList, HomeHeader } from '../../src/components/home';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { usePulseStore } from '../../src/store/pulseStore';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';

// Alerts tab — the system-alert cards (My Alerts, HR · CRM · ERP · CRM Reports · ERP Reports),
// promoted from the old Groups tab's second segment to a bottom tab of their own. Groups moved into
// the Chats tab (its Groups chip), so this screen holds alerts only.
export default function Alerts() {
  const router = useRouter();
  const access = useAccessStore((s) => s.access());
  // The socket keeps events live; a refresh on focus covers anything missed while it was down.
  useRefreshOnFocus(() => { void usePulseStore.getState().refresh(); });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <HomeHeader title="Alerts" />
      <ScrollView style={{ flex: 1 }}>
        {/* Alert creation moved to the "+" create hub — no inline create button here. */}
        <SystemAlertsList activeBizId="tk" access={access} onOpen={(id) => router.push({ pathname: '/alert/[id]', params: { id } })} />
      </ScrollView>
    </SafeAreaView>
  );
}
