import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { FormField, SheetSave } from '../../src/components/forms';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { refreshDirectoryUsers } from '../../src/store/directoryStore';
import {
  getUser, toUser, listRoles, listBranches, createUser, updateUser, humanizeRole,
  type DirectoryRole, type DirectoryBranch,
} from '../../src/api/directory';
import { ApiError } from '../../src/api/client';
import type { User } from '../../src/types';

// Create / edit a user. Writes to the CRM users collection so the account can log in normally.
// Fields map 1:1 to the CRM user: name, email, password, phone, role, branches, status.
export default function UserForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  // EDIT vs CREATE is decided by the route param ALONE. The record itself is loaded separately:
  // the cached directory row (if any) prefills instantly, then the authoritative record comes from
  // GET /api/users/:id — which also returns DEACTIVATED users, who are hidden from the shared
  // directory. (Deciding the mode by "was a record found" made editing a deactivated user open the
  // "Invite new user" form and then fail with "already exists".)
  const isEdit = !!id;
  const cachedUser = id ? users.find((u) => u.id === id) : undefined;
  const [freshUser, setFreshUser] = useState<User | undefined>();
  const [loadError, setLoadError] = useState(false);
  const editUser = isEdit ? (freshUser ?? cachedUser) : undefined;

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

  const loadTarget = (): void => {
    if (!id) return;
    setLoadError(false);
    getUser(id)
      .then((du) => setFreshUser(toUser(du)))
      .catch(() => setLoadError(true)); // a cached row (if any) still prefills; otherwise show Retry
  };
  useEffect(() => {
    listRoles().then(setRoles).catch(() => undefined);
    listBranches().then(setBranches).catch(() => undefined);
    loadTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Prefill from the edit target. The cached row lands first and the server record a moment later;
  // once the admin has started typing we never overwrite their input with the late arrival.
  const touched = useRef(false);
  useEffect(() => {
    if (editUser && !touched.current) {
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
  const toggleBranch = (bid: string): void => { touched.current = true; setBranchIds((s) => (s.includes(bid) ? s.filter((x) => x !== bid) : [...s, bid])); };
  const edit = <T,>(set: (v: T) => void) => (v: T): void => { touched.current = true; set(v); };

  // In edit mode the record MUST be loaded before saving (else a blank prefill would overwrite the user).
  const targetReady = !isEdit || !!editUser;
  const valid = targetReady && name.trim() && email.trim() && roleId && (isEdit || password.length >= 6);
  const missing = [!name.trim() && 'name', !email.trim() && 'email', !roleId && 'role', !isEdit && password.length < 6 && 'password (6+ chars)'].filter(Boolean).join(' · ');

  // After a save, re-pull the shared user directory so every people list (Team & Users, pickers,
  // group info, search) shows the change immediately.
  const refreshUsers = () => refreshDirectoryUsers({ force: true });

  const save = async (): Promise<void> => {
    if (!valid || !roleId) return;
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    setSaving(true);
    try {
      if (id) { // edit mode (isEdit === !!id)
        const patch: Parameters<typeof updateUser>[1] = { firstName, lastName, phone: phone.trim() || null, roleId, branchIds, status: active ? 'active' : 'inactive' };
        if (password.length >= 6) patch.password = password;
        await updateUser(id, patch);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.3, paddingRight: 8 }}>{isEdit ? (editUser ? `Edit · ${editUser.name}` : 'Edit user') : 'Invite new user'}</Text>
        <Pressable onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={17} color={colors.coolText} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 20 }}>
        {isEdit && !editUser ? (
          loadError ? (
            <Pressable onPress={loadTarget} className="flex-row items-center gap-2" style={{ paddingVertical: 10, marginBottom: 8 }}>
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Couldn't load this user.</Text>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-2" style={{ paddingVertical: 10, marginBottom: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.coolText, fontSize: 13 }}>Loading user…</Text>
            </View>
          )
        ) : null}
        <FormField label="Full name" required>
          <TextInput value={name} onChangeText={edit(setName)} placeholder="e.g. Anjali Sharma" placeholderTextColor={colors.coolText3}
            style={input} />
        </FormField>
        <FormField label="Email" required>
          <TextInput value={email} onChangeText={edit(setEmail)} editable={!isEdit} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.coolText3}
            style={[input, isEdit ? { opacity: 0.6 } : null]} />
        </FormField>
        <FormField label="Phone">
          <TextInput value={phone} onChangeText={edit(setPhone)} placeholder="Optional" keyboardType="phone-pad" placeholderTextColor={colors.coolText3} style={input} />
        </FormField>
        <FormField label={isEdit ? 'Password (leave blank to keep)' : 'Password'} required={!isEdit}>
          <TextInput value={password} onChangeText={edit(setPassword)} placeholder={isEdit ? '••••••••' : 'At least 6 characters'} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.coolText3} style={input} />
        </FormField>

        <FormField label="Role" required>
          {roleList.length === 0 ? <ActivityIndicator color={colors.primary} /> : (
            <View className="gap-2">
              {roleList.map((r) => {
                const on = roleId === r.id;
                return (
                  <Pressable key={r.id} onPress={() => edit(setRoleId)(r.id)} className="flex-row items-center gap-2.5 px-3 py-3"
                    style={{ borderWidth: 1, borderRadius: 12, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{humanizeRole(r.name)}</Text>
                      <Text style={{ color: colors.coolText, fontSize: 11.5 }}>Level {r.level}</Text>
                    </View>
                    {on ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </FormField>

        <FormField label={`Branches · ${branchIds.length} selected`}>
          <View className="flex-row flex-wrap gap-2">
            {branches.map((b) => {
              const on = branchIds.includes(b.id);
              return (
                <Pressable key={b.id} onPress={() => toggleBranch(b.id)} className="items-center" style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
                  <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{branchLabel(b)}</Text>
                  {b.city ? <Text style={{ color: on ? 'rgba(255,255,255,0.85)' : colors.coolText3, fontSize: 10.5 }}>{b.city}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 6 }}>Branches determine what this user can see (with their role). Leave empty for company-wide roles.</Text>
        </FormField>

        {isEdit ? (
          <FormField label="Status">
            <Pressable onPress={() => { touched.current = true; setActive((a) => !a); }} className="flex-row items-center justify-between px-3 py-3" style={{ borderWidth: 1, borderRadius: 12, borderColor: colors.coolDivider, backgroundColor: colors.card }}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{active ? 'Active' : 'Inactive (cannot log in)'}</Text>
              <View style={{ width: 46, height: 28, borderRadius: 999, backgroundColor: active ? colors.primary : colors.coolDivider, padding: 3, alignItems: active ? 'flex-end' : 'flex-start' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
              </View>
            </Pressable>
          </FormField>
        ) : null}

        {!valid ? <Text style={{ color: colors.danger, fontSize: 11.5, fontWeight: '600', marginBottom: 8 }}>Required: {missing}</Text> : null}
        <SheetSave label={saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'} disabled={!valid || saving} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontWeight: '500' as const, color: colors.ink };
