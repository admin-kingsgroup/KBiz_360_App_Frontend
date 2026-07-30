import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ChevronLeft, MapPin, Building2, User as UserIcon, Trash2 } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { ROLE_DEFS } from '../../src/constants/roles';
import { useAccessStore } from '../../src/store/accessStore';
import { useDirectoryStore } from '../../src/store/directoryStore';
import { useUiStore } from '../../src/store/uiStore';
import { ApiError } from '../../src/api/client';
import {
  listCompanies, listBranches, listDepartments, listUsers, toUser, deleteBranch, deleteDepartment,
  type DirectoryCompany, type DirectoryBranch, type DirectoryDepartment,
} from '../../src/api/directory';
import { codeFromName } from '../../src/logic/directory';
import type { User } from '../../src/types';

const PALETTE = ['#9A6CF0', '#4F8BFF', '#37B6A4', '#E8A13A', '#E3674E', '#2FB36B', '#DB2777'];
type SubTab = 'branches' | 'depts' | 'users';

// Company detail (real CRM): branches / departments / users for the company. Super-admins can
// delete branches and departments from here (users are deleted from Team & Users).
export default function BusinessDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUiStore((s) => s.showToast);
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const [subTab, setSubTab] = useState<SubTab>('branches');
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<DirectoryCompany | null>(null);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [depts, setDepts] = useState<DirectoryDepartment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [refresh, setRefresh] = useState(0); // bump to re-run the focus load after a delete

  // Reload on focus (not just mount): returning from "New branch" / department create must show the
  // fresh lists — a mount-only load kept this screen stale until it was closed and reopened.
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([listCompanies(), listBranches(), listDepartments(), listUsers()])
      .then(([companies, allBranches, allDepts, allUsers]) => {
        if (!active) return;
        setCompany(companies.find((c) => c.id === id) ?? null);
        const br = allBranches.filter((b) => b.companyId === id);
        setBranches(br);
        const branchIds = new Set(br.map((b) => b.id));
        // Departments are stored per-branch, and company-wide (app) departments are expanded across
        // every branch — so the same department appears once per branch. Dedupe by name for this
        // company-level view (matching the New Group picker) so a company-wide dept like
        // "KBIZ360 - SUPPORT" shows once, not once per branch. Per-branch groups are unaffected.
        const companyDepts = allDepts.filter((d) => (d.branchId ? branchIds.has(d.branchId) : false));
        const seenDept = new Set<string>();
        setDepts(companyDepts.filter((d) => {
          const key = (d.name ?? d.code ?? d.id).toLowerCase().trim();
          if (seenDept.has(key)) return false;
          seenDept.add(key);
          return true;
        }));
        setUsers(allUsers.map(toUser)); // 1 company = tenant → all directory users belong
      })
      .catch(() => { /* offline */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // `refresh` is a counter whose only job is re-running this load after a delete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refresh]));

  // Delete then re-run the focus load AND refresh the shared directory so Home picks it up too.
  const reload = (): void => { setRefresh((r) => r + 1); void useDirectoryStore.getState().load(); };
  const removeBranch = (b: DirectoryBranch): void => Alert.alert('Delete branch', `Delete "${b.city ?? b.name ?? b.code}"? Team members are un-assigned from it.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteBranch(b.id).then(() => { showToast('Branch deleted'); reload(); }).catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not delete branch')); } },
  ]);
  const removeDept = (d: DirectoryDepartment): void => Alert.alert('Delete department', `Delete "${d.name ?? d.code}" from every branch of this company?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteDepartment(d.id).then(() => { showToast('Department deleted'); reload(); }).catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not delete department')); } },
  ]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
        <Hdr title="Business" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }
  if (!company) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
        <Hdr title="Business" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><Text style={{ color: colors.coolText }}>Business not found</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <Hdr title={company.name} subtitle={company.status ?? undefined} onBack={() => router.back()} />

      {/* Stat card */}
      <View style={{ margin: 14, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
        <View className="flex-row items-center gap-3">
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{codeFromName(company.name)}</Text></View>
          <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.4 }}>{company.name}</Text></View>
        </View>
        <View className="flex-row mt-3" style={{ gap: 8 }}>
          {[['Branches', branches.length], ['Depts', depts.length], ['Users', users.length]].map(([l, v]) => (
            <View key={l as string} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primarySoft }}>
              <Text style={{ color: colors.primaryDark, fontSize: 20, fontWeight: '800' }}>{v as number}</Text>
              <Text style={{ color: colors.primary, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 }}>{(l as string).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Subtabs */}
      <View className="flex-row mx-4" style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        {([['branches', 'Branches'], ['depts', 'Departments'], ['users', 'Users']] as const).map(([k, l]) => {
          const on = k === subTab;
          return (
            <Pressable key={k} onPress={() => setSubTab(k)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: on ? colors.primary : colors.coolText, fontSize: 14, fontWeight: on ? '700' : '600' }}>{l}</Text>
              {on ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: 2, backgroundColor: colors.primary }} /> : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {subTab === 'branches' ? (
          branches.length === 0 ? <Empty Icon={MapPin} text="No branches" sub="This company has no branches yet" />
            : branches.map((b, i) => (
              <View key={b.id} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
                <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: PALETTE[i % PALETTE.length], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{b.code ?? '—'}</Text></View>
                <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{b.city ?? b.name ?? b.code}{b.isHO ? '  · HO' : ''}</Text><Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '500' }}>{b.country ?? ''}</Text></View>
                {isSuper ? <Pressable onPress={() => removeBranch(b)} hitSlop={8} style={{ padding: 6 }}><Trash2 size={17} color={colors.danger} /></Pressable> : null}
              </View>
            ))
        ) : subTab === 'depts' ? (
          depts.length === 0 ? <Empty Icon={Building2} text="No departments" sub="No departments found for this company" />
            : depts.map((d, i) => (
              <View key={d.id} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: PALETTE[i % PALETTE.length], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{(d.name ?? d.code ?? '?').slice(0, 1).toUpperCase()}</Text></View>
                <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{d.name ?? d.code}</Text>{d.code ? <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '500' }}>{d.code}</Text> : null}</View>
                {isSuper ? <Pressable onPress={() => removeDept(d)} hitSlop={8} style={{ padding: 6 }}><Trash2 size={17} color={colors.danger} /></Pressable> : null}
              </View>
            ))
        ) : (
          users.length === 0 ? <Empty Icon={UserIcon} text="No users" sub="No users in this company" />
            : users.map((u) => {
              const rd = ROLE_DEFS[u.role];
              return (
                <View key={u.id} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
                  <Avatar initials={u.initials} color={u.color} size={42} uri={u.avatar} />
                  <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{u.name}</Text>{u.scopeLine ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{u.scopeLine}</Text> : null}</View>
                  <View style={{ backgroundColor: rd.color, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}><Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{rd.badge}</Text></View>
                </View>
              );
            })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Empty({ Icon, text, sub }: { Icon: typeof MapPin; text: string; sub: string }) {
  return (
    <View className="items-center px-6" style={{ paddingVertical: 48 }}>
      <Icon size={30} color={colors.coolText3} />
      <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '700', marginTop: 10 }}>{text}</Text>
      <Text style={{ color: colors.coolText3, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
function Hdr({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
      <Pressable onPress={onBack} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
      <View className="flex-1"><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{subtitle}</Text> : null}</View>
    </View>
  );
}
