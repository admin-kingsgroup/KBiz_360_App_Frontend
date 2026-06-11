import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User as UserIcon, Plus, Edit3, ChevronLeft, LogOut } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { ROLE_DEFS } from '../../src/constants/roles';
import { useAccessStore } from '../../src/store/accessStore';
import { useAuthStore } from '../../src/store/authStore';
import { useUiStore } from '../../src/store/uiStore';
import { listUsers, toUser } from '../../src/api/directory';
import { useMessagingStore } from '../../src/store/messagingStore';

// Users tab — faithful port of source UsersTab. Reads canonical accessStore.users.
// Tap a user to edit; "other staff" aggregate rows just toast (source behavior preserved).
export default function Users() {
  const router = useRouter();
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const [loading, setLoading] = useState(true);

  // Hydrate the canonical user list from the real CRM directory (read-only).
  useEffect(() => {
    let active = true;
    listUsers()
      .then((list) => { if (active) useAccessStore.getState().setUsers(list.map(toUser)); })
      .catch(() => { /* keep any cached users */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Tapping a teammate opens (or creates) a 1:1 conversation and navigates into the chat.
  const openUser = async (id: string, name: string) => {
    if (id === 'a9' || name.toLowerCase().includes('other')) { showToast('Group of staff — open individually'); return; }
    try {
      const convId = await useMessagingStore.getState().openDirect(id);
      router.push({ pathname: '/chat/[id]', params: { id: convId } });
    } catch {
      showToast('Could not open chat');
    }
  };
  const signOut = () => { useAuthStore.getState().signOut(); useAccessStore.getState().setViewAs(null); showToast('Signed out'); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Team & Users</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{users.length} shown</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {loading && users.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <ActivityIndicator color={colors.ink} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Loading team…</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5 mb-1">
          <UserIcon size={11} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }}>ALL USERS · {users.length}</Text>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
          {users.map((u, i) => {
            const role = ROLE_DEFS[u.role];
            return (
              <Pressable key={u.id} onPress={() => openUser(u.id, u.name)} className="flex-row items-center gap-2.5 px-3.5 py-2.5"
                style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
                <Avatar initials={u.initials} color={u.color} size={36} />
                <View className="flex-1">
                  <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{u.name}</Text>
                  {u.scopeLine ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{u.scopeLine}</Text> : null}
                </View>
                <View style={{ backgroundColor: role.color, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 }}>{role.badge}</Text>
                </View>
                <Edit3 size={13} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => router.push('/admin/user-form')} className="flex-row items-center justify-center gap-1.5 mt-3"
          style={{ paddingVertical: 13, borderRadius: 13, backgroundColor: colors.ink }}>
          <Plus size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>Invite user · pick role & access</Text>
        </Pressable>
        <Pressable onPress={signOut} className="flex-row items-center justify-center gap-2 mt-3"
          style={{ paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.coral + '40' }}>
          <LogOut size={14} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>Sign out → back to Login</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
