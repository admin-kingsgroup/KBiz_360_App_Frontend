import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MapPin, Building2, User as UserIcon } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { ROLE_DEFS } from '../../src/constants/roles';
import {
  listCompanies, listBranches, listDepartments, listUsers, toUser,
  type DirectoryCompany, type DirectoryBranch, type DirectoryDepartment,
} from '../../src/api/directory';
import { codeFromName } from '../../src/logic/directory';
import type { User } from '../../src/types';

const PALETTE = ['#9A6CF0', '#4F8BFF', '#37B6A4', '#E8A13A', '#E3674E', '#2FB36B', '#DB2777'];
type SubTab = 'branches' | 'depts' | 'users';

// Company detail (real CRM, read-only): branches / departments / users for the company.
export default function BusinessDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [subTab, setSubTab] = useState<SubTab>('branches');
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<DirectoryCompany | null>(null);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [depts, setDepts] = useState<DirectoryDepartment[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([listCompanies(), listBranches(), listDepartments(), listUsers()])
      .then(([companies, allBranches, allDepts, allUsers]) => {
        if (!active) return;
        setCompany(companies.find((c) => c.id === id) ?? null);
        const br = allBranches.filter((b) => b.companyId === id);
        setBranches(br);
        const branchIds = new Set(br.map((b) => b.id));
        setDepts(allDepts.filter((d) => (d.branchId ? branchIds.has(d.branchId) : false)));
        setUsers(allUsers.map(toUser)); // 1 company = tenant → all directory users belong
      })
      .catch(() => { /* offline */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Hdr title="Business" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><ActivityIndicator color={colors.ink} /></View>
      </SafeAreaView>
    );
  }
  if (!company) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Hdr title="Business" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><Text style={{ color: colors.textMuted }}>Business not found</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <Hdr title={company.name} subtitle={company.status ?? undefined} onBack={() => router.back()} />

      {/* Stat card */}
      <View style={{ margin: 14, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
        <View className="flex-row items-center gap-3">
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: PALETTE[0], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{codeFromName(company.name)}</Text></View>
          <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.4 }}>{company.name}</Text></View>
        </View>
        <View className="flex-row gap-1.5 mt-3">
          {[['Branches', branches.length], ['Depts', depts.length], ['Users', users.length]].map(([l, v]) => (
            <View key={l as string} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: colors.canvas }}>
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 18, fontWeight: '800' }}>{v as number}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 }}>{(l as string).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Subtabs */}
      <View className="flex-row mx-4" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        {([['branches', 'Branches'], ['depts', 'Departments'], ['users', 'Users']] as const).map(([k, l]) => {
          const on = k === subTab;
          return (
            <Pressable key={k} onPress={() => setSubTab(k)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: on ? colors.ink : colors.textMuted2, fontSize: 13, fontWeight: on ? '800' : '600' }}>{l}</Text>
              {on ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, borderRadius: 2, backgroundColor: colors.ink }} /> : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {subTab === 'branches' ? (
          branches.length === 0 ? <Empty Icon={MapPin} text="No branches" sub="This company has no branches yet" />
            : branches.map((b, i) => (
              <View key={b.id} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: PALETTE[i % PALETTE.length], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{b.code ?? '—'}</Text></View>
                <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{b.city ?? b.name ?? b.code}{b.isHO ? '  · HO' : ''}</Text><Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '600' }}>{b.country ?? ''}</Text></View>
              </View>
            ))
        ) : subTab === 'depts' ? (
          depts.length === 0 ? <Empty Icon={Building2} text="No departments" sub="No departments found for this company" />
            : depts.map((d, i) => (
              <View key={d.id} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: PALETTE[i % PALETTE.length], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{(d.name ?? d.code ?? '?').slice(0, 1).toUpperCase()}</Text></View>
                <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{d.name ?? d.code}</Text>{d.code ? <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '600' }}>{d.code}</Text> : null}</View>
              </View>
            ))
        ) : (
          users.length === 0 ? <Empty Icon={UserIcon} text="No users" sub="No users in this company" />
            : users.map((u) => {
              const rd = ROLE_DEFS[u.role];
              return (
                <View key={u.id} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
                  <Avatar initials={u.initials} color={u.color} size={36} uri={u.avatar} />
                  <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{u.name}</Text>{u.scopeLine ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{u.scopeLine}</Text> : null}</View>
                  <View style={{ backgroundColor: rd.color, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}><Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800' }}>{rd.badge}</Text></View>
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
      <Icon size={28} color={colors.textMuted2} />
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 10 }}>{text}</Text>
      <Text style={{ color: colors.textMuted2, fontSize: 11, marginTop: 4, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
function Hdr({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
      <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
      <View className="flex-1"><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{subtitle}</Text> : null}</View>
    </View>
  );
}
