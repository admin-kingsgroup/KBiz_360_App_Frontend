import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { UsersRound, UserPlus, FolderKanban, Building2, MapPin, X } from 'lucide-react-native';
import { colors } from '../../theme';

// Single "Create" hub (Super-Admin only entry point). Every org/admin creation lives here so the
// individual screens no longer carry their own "New …" buttons.
const OPTIONS: { key: string; label: string; sub: string; Icon: typeof UsersRound; href: Href }[] = [
  { key: 'group', label: 'New group', sub: 'Create a team chat group', Icon: UsersRound, href: '/chat/new-group' },
  { key: 'user', label: 'New user', sub: 'Invite a team member', Icon: UserPlus, href: '/admin/user-form' },
  { key: 'department', label: 'New department', sub: 'Add a department to a business', Icon: FolderKanban, href: { pathname: '/admin/departments', params: { create: '1' } } },
  { key: 'business', label: 'New business', sub: 'Add a company to the directory', Icon: Building2, href: { pathname: '/admin/businesses', params: { create: '1' } } },
  { key: 'branch', label: 'New branch', sub: 'Add a branch under a business', Icon: MapPin, href: '/admin/branch-form' },
  // "New alert" (announcement broadcast) removed from the hub for now — the /alert/new screen
  // stays registered so it can be re-linked here when alerts creation returns.
];

export function CreateMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (href: Href): void => { onClose(); router.push(href); };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        {/* stop taps inside the sheet from dismissing */}
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: Math.max(20, insets.bottom + 12) }}>
          <View style={{ alignItems: 'center', paddingVertical: 10 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
          <View className="flex-row items-center justify-between px-5 pb-2">
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Create</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={17} color={colors.coolText} /></Pressable>
          </View>
          <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
            {OPTIONS.map((o) => (
              <Pressable key={o.key} onPress={() => go(o.href)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-3" style={{ paddingVertical: 13, borderRadius: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <o.Icon size={22} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{o.label}</Text>
                  <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{o.sub}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
