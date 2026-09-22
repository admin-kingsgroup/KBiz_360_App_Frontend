import { Pressable, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RequestForm } from '../../src/components/approvals/ApprovalsScreen';
import { colors } from '../../src/theme';

export default function NewApprovalRequestScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to approvals">
          <ChevronLeft size={23} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>New request</Text>
          <Text style={styles.subtitle}>Create an approval request for your team</Text>
        </View>
      </View>
      <RequestForm />
    </SafeAreaView>
  );
}

const styles = {
  screen: { flex: 1, backgroundColor: colors.coolBg },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 13, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.coolDivider },
  backButton: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 20, backgroundColor: colors.coolMuted },
  headerCopy: { flex: 1 },
  title: { color: colors.ink, fontSize: 21, fontWeight: '800' as const },
  subtitle: { color: colors.coolText, fontSize: 12, marginTop: 2 },
};