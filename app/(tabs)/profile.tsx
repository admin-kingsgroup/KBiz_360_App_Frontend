import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Users, Shield, LogOut, Building2, Activity } from 'lucide-react-native';
import { ROLE_ICONS } from '../../src/components/ui/roleIcons';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useAuthStore } from '../../src/store/authStore';
import { ROLE_DEFS } from '../../src/constants/roles';
import { useUiStore } from '../../src/store/uiStore';
import { listCompanies, listUsers, listBranches, listRoles } from '../../src/api/directory';

// Profile tab — identity card + admin entries. Counts are loaded live from the CRM directory.
export default function Profile() {
  const router = useRouter();
  const user = useAccessStore((s) => s.user);
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const showToast = useUiStore((s) => s.showToast);
  const [counts, setCounts] = useState({ companies: 0, users: 0, branches: 0, roles: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listCompanies(), listUsers(), listBranches(), listRoles()])
      .then(([c, u, b, r]) => {
        if (active) { setCounts({ companies: c.length, users: u.length, branches: b.length, roles: r.length }); setLoaded(true); }
      })
      .catch(() => { /* offline — leave counts at 0 */ });
    return () => { active = false; };
  }, []);

  if (!user) return null;
  const rd = ROLE_DEFS[user.role];
  const RoleIcon = ROLE_ICONS[user.role];
  const n = (v: number) => (loaded ? String(v) : '–');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="px-4 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600', letterSpacing: -0.3 }}>Profile & Workspace</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }}>
        {/* Identity card */}
        <Pressable onPress={() => showToast('Edit profile')} className="mx-4 mb-4" style={{ borderRadius: 16, padding: 16, backgroundColor: colors.ink }}>
          <View className="flex-row items-center gap-3">
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.orange }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{user.initials}</Text>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <RoleIcon size={11} color={rd.color === colors.ink ? colors.orange : rd.color} />
                <Text style={{ color: rd.color === colors.ink ? colors.orange : rd.color, fontSize: 9.5, fontWeight: '700', letterSpacing: 1.4 }}>{rd.badge}</Text>
              </View>
              <Text style={{ fontFamily: 'Fraunces', color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 2 }}>{user.name}</Text>
              <Text style={{ color: '#C5C5C8', fontSize: 10.5 }}>{user.email}</Text>
            </View>
            <ChevronRight size={18} color="#C5C5C8" />
          </View>
          <View className="flex-row gap-4 mt-3 pt-3" style={{ borderTopColor: 'rgba(255,255,255,0.12)', borderTopWidth: 1 }}>
            {[[n(counts.companies), 'businesses'], [n(counts.users), 'users'], [n(counts.branches), 'branches']].map(([v, l]) => (
              <View key={l} className="flex-row items-baseline gap-1">
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{v}</Text>
                <Text style={{ color: '#C5C5C8', fontSize: 10 }}>{l}</Text>
              </View>
            ))}
          </View>
        </Pressable>

        {/* Admin sections */}
        <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge, overflow: 'hidden' }}>
          {[
            { key: 'businesses', label: 'Businesses', sub: loaded ? `${counts.companies} business${counts.companies === 1 ? '' : 'es'} · ${counts.branches} branches` : 'Companies & branches', Icon: Building2, onPress: () => router.push('/admin/businesses') },
            { key: 'users', label: 'Team & Users', sub: loaded ? `${counts.users} people` : 'Team directory', Icon: Users, onPress: () => router.push('/admin/users') },
            { key: 'roles', label: 'Roles & Permissions', sub: loaded ? `${counts.roles}-tier access hierarchy` : 'Access hierarchy', Icon: Shield, onPress: () => router.push('/admin/roles') },
            ...(isSuper ? [{ key: 'chat-analytics', label: 'Chat Analytics', sub: 'Messaging insights & activity', Icon: Activity, onPress: () => router.push('/admin/chat-analytics') }] : []),
          ].map((row, i) => (
            <Pressable key={row.key} onPress={row.onPress} className="flex-row items-center gap-3 px-4 py-3.5"
              style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
              <row.Icon size={18} color={colors.ink} />
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{row.sub}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable onPress={() => { useAuthStore.getState().signOut(); useAccessStore.getState().setViewAs(null); showToast('Signed out'); }} className="flex-row items-center justify-center gap-2 mx-4 mt-3"
          style={{ paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.coral + '40' }}>
          <LogOut size={15} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>Sign out → back to Login</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
