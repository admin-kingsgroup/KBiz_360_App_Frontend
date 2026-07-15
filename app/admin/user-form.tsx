import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { FormField, SheetSave } from '../../src/components/forms';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import {
  listUsers, toUser, listRoles, listBranches, createUser, updateUser, humanizeRole,
  type DirectoryRole, type DirectoryBranch,
} from '../../src/api/directory';
import { ApiError } from '../../src/api/client';

// Create / edit a user. Writes to the CRM users collection so the account can log in normally.
// Fields map 1:1 to the CRM user: name, email, password, phone, role, branches, status.
export default function UserForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const editUser = id ? users.find((u) => u.id === id) : undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [roles, setRoles] = useState<DirectoryRole[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => undefined);
    listBranches().then(setBranches).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (editUser) {
      setName(editUser.name);
      setEmail(editUser.email || '');
      setPhone(editUser.phone ?? '');
      setRoleId(editUser.roleId ?? null);
      setBranchIds(editUser.branches || []);
      setActive(editUser.status !== 'inactive');
    }
  }, [editUser]);

  const branchLabel = (b: DirectoryBranch): string => b.code || b.name || b.city || 'Branch';
  const roleList = useMemo(() => [...roles].sort((a, b) => a.level - b.level), [roles]);
  const toggleBranch = (bid: string): void => setBranchIds((s) => (s.includes(bid) ? s.filter((x) => x !== bid) : [...s, bid]));

  const valid = name.trim() && email.trim() && roleId && (editUser || password.length >= 6);
  const missing = [!name.trim() && 'name', !email.trim() && 'email', !roleId && 'role', !editUser && password.length < 6 && 'password (6+ chars)'].filter(Boolean).join(' · ');

  const refreshUsers = () => listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined);

  const save = async (): Promise<void> => {
    if (!valid || !roleId) return;
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    setSaving(true);
    try {
      if (editUser) {
        const patch: Parameters<typeof updateUser>[1] = { firstName, lastName, phone: phone.trim() || null, roleId, branchIds, status: active ? 'active' : 'inactive' };
        if (password.length >= 6) patch.password = password;
        await updateUser(editUser.id, patch);
        showToast(`${name.trim()} updated`);
      } else {
        await createUser({ email: email.trim(), password, firstName, lastName, phone: phone.trim() || null, roleId, branchIds });
        showToast(`${name.trim()} invited`);
      }
      await refreshUsers();
      router.back();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save user');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 }}>{editUser ? `Edit · ${editUser.name}` : 'Invite new user'}</Text>
        <Pressable onPress={() => router.back()} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F2EC' }}><X size={14} color={colors.textMuted} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 20 }}>
        <FormField label="Full name" required>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Anjali Sharma" placeholderTextColor={colors.textMuted}
            style={input} />
        </FormField>
        <FormField label="Email" required>
          <TextInput value={email} onChangeText={setEmail} editable={!editUser} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textMuted}
            style={[input, editUser ? { opacity: 0.6 } : null]} />
        </FormField>
        <FormField label="Phone">
          <TextInput value={phone} onChangeText={setPhone} placeholder="Optional" keyboardType="phone-pad" placeholderTextColor={colors.textMuted} style={input} />
        </FormField>
        <FormField label={editUser ? 'Password (leave blank to keep)' : 'Password'} required={!editUser}>
          <TextInput value={password} onChangeText={setPassword} placeholder={editUser ? '••••••••' : 'At least 6 characters'} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.textMuted} style={input} />
        </FormField>

        <FormField label="Role" required>
          {roleList.length === 0 ? <ActivityIndicator color={colors.textMuted} /> : (
            <View className="gap-1.5">
              {roleList.map((r) => {
                const on = roleId === r.id;
                return (
                  <Pressable key={r.id} onPress={() => setRoleId(r.id)} className="flex-row items-center gap-2.5 px-3 py-2.5"
                    style={{ borderWidth: 1, borderRadius: 10, borderColor: on ? colors.ink : colors.cardEdge, backgroundColor: on ? '#FAFAF7' : '#fff' }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{humanizeRole(r.name)}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>Level {r.level}</Text>
                    </View>
                    {on ? <Check size={16} color={colors.success} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </FormField>

        <FormField label={`Branches · ${branchIds.length} selected`}>
          <View className="flex-row flex-wrap gap-1.5">
            {branches.map((b) => {
              const on = branchIds.includes(b.id);
              return (
                <Pressable key={b.id} onPress={() => toggleBranch(b.id)} className="items-center" style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: on ? colors.ink : '#fff', borderColor: on ? colors.ink : colors.cardEdge }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12, fontWeight: '800' }}>{branchLabel(b)}</Text>
                  {b.city ? <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 9.5, opacity: 0.8 }}>{b.city}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textMuted2, fontSize: 10.5, marginTop: 6 }}>Branches determine what this user can see (with their role). Leave empty for company-wide roles.</Text>
        </FormField>

        {editUser ? (
          <FormField label="Status">
            <Pressable onPress={() => setActive((a) => !a)} className="flex-row items-center justify-between px-3 py-3" style={{ borderWidth: 1, borderRadius: 11, borderColor: colors.cardEdge, backgroundColor: '#fff' }}>
              <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{active ? 'Active' : 'Inactive (cannot log in)'}</Text>
              <View style={{ width: 44, height: 26, borderRadius: 999, backgroundColor: active ? colors.success : colors.cardEdge, padding: 3, alignItems: active ? 'flex-end' : 'flex-start' }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
              </View>
            </Pressable>
          </FormField>
        ) : null}

        {!valid ? <Text style={{ color: colors.coral, fontSize: 10.5, fontWeight: '600', marginBottom: 8 }}>Required: {missing}</Text> : null}
        <SheetSave label={saving ? 'Saving…' : editUser ? 'Save changes' : 'Create user'} disabled={!valid || saving} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontWeight: '700' as const, color: colors.ink };
