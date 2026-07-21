import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Check, Search } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { FormField, SheetSave } from '../../src/components/forms';
import { useUiStore } from '../../src/store/uiStore';
import { listCompanies, listBranches, listUsers, createBranch, type DirectoryCompany, type DirectoryBranch, type DirectoryUser } from '../../src/api/directory';
import { ApiError } from '../../src/api/client';

// Create a branch under a specific business (super-admin). Writes to the CRM branches collection so
// the new branch shows up everywhere branches are used (groups, users, attendance, alerts).
export default function BranchForm() {
  const router = useRouter();
  const { companyId: prefillCompany } = useLocalSearchParams<{ companyId?: string }>();
  const showToast = useUiStore((s) => s.showToast);

  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [companiesError, setCompaniesError] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(prefillCompany ?? null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  // Optional team members — users (of the selected business) added to the branch on create.
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState('');

  // A failed load must surface a Retry — a swallowed error looks like an infinite spinner.
  const loadCompanies = (): void => {
    setCompaniesError(false);
    listCompanies()
      .then((c) => { setCompanies(c); if (!prefillCompany && c.length === 1) setCompanyId(c[0].id); })
      .catch(() => setCompaniesError(true));
    listUsers().then(setUsers).catch(() => undefined);
    listBranches().then(setBranches).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadCompanies, []);

  // Users offered for membership: those already in the selected business (their branches belong to
  // it) plus users with no branch yet (otherwise unreachable). Search narrows by name/email.
  const eligibleUsers = useMemo(() => {
    if (!companyId) return [];
    const bizBranchIds = new Set(branches.filter((b) => b.companyId === companyId).map((b) => b.id));
    const base = users.filter((u) => u.branchIds.length === 0 || u.branchIds.some((b) => bizBranchIds.has(b)));
    const q = userQuery.trim().toLowerCase();
    const filtered = q ? base.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : base;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [companyId, users, branches, userQuery]);

  const toggleUser = (id: string): void =>
    setSelectedUsers((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));

  // A branch always belongs to a business — that's a hard requirement.
  const valid = !!companyId && name.trim().length > 0 && code.trim().length > 0;
  const missing = [!companyId && 'business', !name.trim() && 'branch name', !code.trim() && 'branch code'].filter(Boolean).join(' · ');

  const save = async (): Promise<void> => {
    if (!valid || !companyId) return;
    setSaving(true);
    try {
      const created = await createBranch({
        companyId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        userIds: selectedUsers.length ? selectedUsers : undefined,
      });
      const n = created.membersAdded ?? 0;
      showToast(`Branch ${code.trim().toUpperCase()} created${n ? ` · ${n} member${n === 1 ? '' : 's'} added` : ''}`);
      router.back();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not create branch');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 }}>New branch</Text>
        <Pressable onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={17} color={colors.coolText} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        {/* Business — required; a branch is always created under one business. */}
        <FormField label="Business" required hint="The branch is created under this business.">
          {companiesError ? (
            <Pressable onPress={loadCompanies} className="flex-row items-center gap-2" style={{ paddingVertical: 8 }}>
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Couldn't load businesses.</Text>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          ) : companies.length === 0 ? <ActivityIndicator color={colors.primary} /> : (
            <View className="flex-row flex-wrap gap-2">
              {companies.map((c) => {
                const on = companyId === c.id;
                return (
                  <Pressable key={c.id} onPress={() => setCompanyId(c.id)} className="flex-row items-center gap-1.5" style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
                    <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 14, fontWeight: '600' }}>{c.name}</Text>
                    {on ? <Check size={15} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </FormField>

        <FormField label="Branch name" required>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Pune Office" placeholderTextColor={colors.coolText3} style={input} />
        </FormField>

        {/* Optional team members — users of the selected business (plus not-yet-assigned users)
            get this branch added to their memberships when it is created. */}
        {companyId ? (
          <FormField label={`Team members${selectedUsers.length ? ` (${selectedUsers.length})` : ''}`} hint="Optional — these users are added to the new branch.">
            <View className="flex-row items-center gap-2" style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 }}>
              <Search size={16} color={colors.coolText3} />
              <TextInput value={userQuery} onChangeText={setUserQuery} placeholder="Search people…" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: colors.ink }} />
            </View>
            {eligibleUsers.length === 0 ? (
              <Text style={{ color: colors.coolText3, fontSize: 13 }}>{userQuery ? 'No matches.' : 'No users found for this business.'}</Text>
            ) : (
              <View style={{ borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 12, backgroundColor: colors.card, maxHeight: 280 }}>
                <ScrollView nestedScrollEnabled>
                  {eligibleUsers.map((u, i) => {
                    const on = selectedUsers.includes(u.id);
                    return (
                      <Pressable key={u.id} onPress={() => toggleUser(u.id)} className="flex-row items-center justify-between px-3 py-2.5" style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.coolDivider }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{u.name}</Text>
                          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{u.position || u.role}{u.branchIds.length === 0 ? ' · no branch yet' : ''}</Text>
                        </View>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1.5, borderColor: colors.coolDivider, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </FormField>
        ) : null}
        <FormField label="Branch code" required hint="Short unique code, e.g. PNQ. Must not clash with an existing branch.">
          <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="e.g. PNQ" autoCapitalize="characters" autoCorrect={false} maxLength={20} placeholderTextColor={colors.coolText3} style={input} />
        </FormField>
        {!valid ? <Text style={{ color: colors.danger, fontSize: 11.5, fontWeight: '600', marginBottom: 8 }}>Required: {missing}</Text> : null}
        <SheetSave label={saving ? 'Creating…' : 'Create branch'} disabled={!valid || saving} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontWeight: '500' as const, color: colors.ink };
