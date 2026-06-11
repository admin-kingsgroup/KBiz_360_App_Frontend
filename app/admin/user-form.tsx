import { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Eye, Check, Camera, Lock } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { FormField, SheetSave, SectionNote } from '../../src/components/forms';
import { ROLE_ICONS } from '../../src/components/ui/roleIcons';
import { ROLE_DEFS, ROLE_OPTIONS } from '../../src/constants/roles';
import { MODULES, BIZ_MODULES } from '../../src/constants/modules';
import { businesses, branches, businessDepts } from '../../src/data/businesses';
import { validateUserDraft } from '../../src/logic/validation';
import type { RoleKey, User } from '../../src/types';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';

// Create/Edit user — faithful port of source InviteUserSheet. Validation comes from the
// foundation validateUserDraft (identical predicate set). No backend; on save -> accessStore.upsertUser.
const COLOR_OPTIONS = ['#9B6EF3', '#5B9DEE', '#5BC5A0', '#E6A040', '#E07B5F', '#EC4899', '#0A0A0C', '#6D6D72'];
const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

interface ChipItem { id: string; label: string; color: string; icon: string; isAlert?: boolean; }

function ChipRow({ title, items, sel, setSel }: { title: string; items: ChipItem[]; sel: string[]; setSel: (v: string[]) => void }) {
  const ids = items.map((it) => it.id);
  const allOn = ids.length > 0 && ids.every((id) => sel.includes(id));
  return (
    <View className="mb-2">
      <View className="flex-row items-center justify-between mb-1">
        <Text style={{ color: colors.warmMute, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 }}>
          {title} · {items.filter((it) => sel.includes(it.id)).length}/{items.length}
        </Text>
        <Pressable onPress={() => setSel(allOn ? sel.filter((x) => !ids.includes(x)) : Array.from(new Set([...sel, ...ids])))}>
          <Text style={{ color: colors.blue, fontSize: 9.5, fontWeight: '800' }}>{allOn ? 'Clear' : 'All'}</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {items.map((it) => {
          const on = sel.includes(it.id);
          const bg = on ? (it.isAlert ? it.color : colors.ink) : '#fff';
          return (
            <Pressable key={it.id} onPress={() => setSel(toggle(sel, it.id))} className="flex-row items-center gap-1"
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, backgroundColor: bg, borderColor: on ? bg : colors.cardEdge }}>
              {it.isAlert
                ? <Text style={{ fontSize: 11 }}>{it.icon}</Text>
                : <View style={{ width: 15, height: 15, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: it.color }}><Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{it.icon}</Text></View>}
              <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 10.5, fontWeight: '800' }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function UserForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const editUser = id ? users.find((u) => u.id === id) : undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey>('EMPLOYEE');
  const [selBizId, setSelBizId] = useState<string | null>(null);
  const [selBranches, setSelBranches] = useState<string[]>([]);
  const [accGroups, setAccGroups] = useState<string[]>([]);
  const [accDepts, setAccDepts] = useState<string[]>([]);
  const [accAlerts, setAccAlerts] = useState<string[]>([]);

  useEffect(() => {
    if (editUser) {
      setName(editUser.name); setEmail(editUser.email || '');
      setRole(editUser.role); setSelBizId(editUser.bizId);
      setSelBranches(editUser.branches || []); setAccGroups(editUser.accessGroups || []);
      setAccDepts(editUser.accessDepts || []); setAccAlerts(editUser.accessAlerts || []);
    }
  }, [editUser]);

  const isSuper = role === 'SUPER_ADMIN';
  const activeBiz = businesses.find((b) => b.id === selBizId);
  const effBranches = selBizId === 'tk' ? branches : [];
  const hasBranches = effBranches.length > 0;
  const selBr = effBranches.filter((b) => selBranches.includes(b.code));
  const deptDefs = (selBizId && businessDepts[selBizId]) || [];
  const alertsAvail = useMemo(
    () => ((selBizId && BIZ_MODULES[selBizId]) || []).map((k) => MODULES.find((m) => m.key === k)).filter((m): m is typeof MODULES[number] => Boolean(m)),
    [selBizId],
  );

  // Validation via foundation module (identical to source predicates)
  const v = validateUserDraft(
    { name, email, role, bizId: selBizId, branches: selBranches, accessGroups: accGroups, accessDepts: accDepts, accessAlerts: accAlerts },
    { branches, businessDepts, bizModules: BIZ_MODULES, modules: MODULES },
  );

  const onRole = (rk: RoleKey) => { if (rk !== role) { setRole(rk); setSelBranches([]); setAccGroups([]); setAccDepts([]); setAccAlerts([]); } };
  const onBiz = (bid: string) => { setSelBizId(bid); setSelBranches([]); setAccGroups([]); setAccDepts([]); setAccAlerts([]); };
  const onToggleBranch = (code: string) => { setSelBranches(toggle(selBranches, code)); setAccGroups([]); };

  const save = () => {
    if (!v.valid) return;
    const bc = (activeBiz?.code || selBizId || '').toUpperCase();
    const scopeLine = isSuper
      ? 'Full access · all businesses & branches'
      : `${bc}${selBranches.length ? ' ' + selBranches.join('/') : ''} · ${accGroups.length}G · ${accDepts.length}D · ${accAlerts.length}A`;
    const user: User = {
      id: editUser ? editUser.id : `u-${Date.now()}`,
      name: name.trim(), email: email.trim(),
      initials: editUser ? editUser.initials : name.trim().split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
      color: editUser ? editUser.color : COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)],
      role, scopeLine, login: editUser ? editUser.login : 'Pending', bizId: selBizId,
      branches: selBranches, accessGroups: accGroups, accessDepts: accDepts, accessAlerts: accAlerts, attendance: true,
    };
    useAccessStore.getState().upsertUser(user);
    showToast(editUser ? `${user.name} updated` : `${user.name} invited`);
    router.back();
  };

  const required = [
    !name.trim() && 'name', !email.trim() && 'email',
    !isSuper && !selBizId && 'business', !isSuper && !v.branchOK && 'branch',
    !isSuper && !v.groupsOK && 'a group', !isSuper && !v.deptsOK && 'a department', !isSuper && !v.alertsOK && 'a system alert',
  ].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 }}>{editUser ? `Edit · ${editUser.name}` : 'Invite new user'}</Text>
        <Pressable onPress={() => router.back()} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F2EC' }}><X size={14} color={colors.textMuted} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 20 }}>
        <FormField label="Full name" required>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Anjali Sharma" placeholderTextColor={colors.textMuted}
            style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontWeight: '700', color: colors.ink }} />
        </FormField>
        <FormField label="Email" required>
          <TextInput value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textMuted}
            style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, color: colors.ink }} />
        </FormField>

        <FormField label="Role" required>
          <View className="gap-1.5">
            {ROLE_OPTIONS.map((rk) => {
              const r = ROLE_DEFS[rk]; const on = rk === role; const Icon = ROLE_ICONS[rk];
              return (
                <Pressable key={rk} onPress={() => onRole(rk)} className="flex-row items-start gap-2.5 px-3 py-2.5"
                  style={{ borderWidth: 1, borderRadius: 10, borderColor: on ? colors.ink : colors.cardEdge, backgroundColor: on ? '#FAFAF7' : '#fff' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: r.color, marginTop: 2 }}><Icon size={13} color="#fff" /></View>
                  <View className="flex-1">
                    <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>{r.label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{r.scope}</Text>
                    {on ? <View className="flex-row items-center gap-1 mt-1"><Eye size={10} color={r.color} /><Text style={{ color: r.color, fontSize: 10, fontWeight: '700' }}>{r.sees}</Text></View> : null}
                  </View>
                  {on ? <Check size={16} color={colors.success} style={{ marginTop: 4 }} /> : null}
                </Pressable>
              );
            })}
          </View>
        </FormField>

        {isSuper ? (
          <SectionNote>👑 Super Admin has direct access to everything — all businesses, branches, groups, departments & system alerts. No grants needed.</SectionNote>
        ) : (
          <SectionNote>🔒 This role has no access by default. You must explicitly grant the business, branch, groups, departments & system alerts below.</SectionNote>
        )}

        {!isSuper && (
          <>
            <FormField label="Business · required">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {businesses.map((b) => {
                  const sel = selBizId === b.id;
                  return (
                    <Pressable key={b.id} onPress={() => onBiz(b.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: sel ? b.color : '#fff', borderColor: sel ? b.color : colors.cardEdge }}>
                      <Text style={{ color: sel ? '#fff' : colors.ink, fontSize: 11, fontWeight: '800' }}>{b.code}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {selBizId ? <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 8 }}>Selected: <Text style={{ color: colors.ink }}>{activeBiz?.name}</Text></Text> : null}
            </FormField>

            {selBizId && hasBranches ? (
              <FormField label={`Branch · required · ${selBranches.length} selected`}>
                <Pressable onPress={() => { const all = selBranches.length === effBranches.length; setSelBranches(all ? [] : effBranches.map((b) => b.code)); setAccGroups([]); }}>
                  <Text style={{ color: colors.blue, fontSize: 10.5, fontWeight: '800', marginBottom: 6 }}>{selBranches.length === effBranches.length ? 'Clear all' : 'Select all branches'}</Text>
                </Pressable>
                <View className="flex-row flex-wrap gap-1.5">
                  {effBranches.map((b) => {
                    const sel = selBranches.includes(b.code);
                    return (
                      <Pressable key={b.id} onPress={() => onToggleBranch(b.code)} className="items-center" style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, backgroundColor: sel ? colors.ink : '#fff', borderColor: sel ? colors.ink : colors.cardEdge }}>
                        <Text style={{ color: sel ? '#fff' : colors.ink, fontSize: 12, fontWeight: '800' }}>{b.code}</Text>
                        <Text style={{ color: sel ? '#fff' : colors.ink, fontSize: 9.5, fontWeight: '600', opacity: 0.8 }}>{b.city}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </FormField>
            ) : null}

            {selBizId && hasBranches && selBranches.length === 0 ? (
              <SectionNote>Select at least one branch above to grant its groups, departments & system alerts.</SectionNote>
            ) : null}

            {/* Branch-wise access */}
            {hasBranches && selBranches.length > 0 ? (
              <View className="mb-3">
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 }}>ACCESS · REQUIRED · BY BRANCH</Text>
                <View className="gap-2.5">
                  {selBr.map((b) => {
                    const brData = branches.find((x) => x.code === b.code);
                    const gItems: ChipItem[] = (brData?.groups || []).map((g) => ({ id: `${b.code}-${g.name}`, label: g.name, color: g.color, icon: g.icon }));
                    const dItems: ChipItem[] = deptDefs.map((d) => ({ id: `${b.code}-${d.name}`, label: d.name, color: d.color, icon: d.icon }));
                    const aItems: ChipItem[] = alertsAvail.map((m) => ({ id: `${b.code}-${m.key}`, label: m.name, color: m.color, icon: m.icon, isAlert: true }));
                    return (
                      <View key={b.code} style={{ borderRadius: 12, borderWidth: 1, padding: 10, borderColor: (brData?.color || colors.cardEdge) + '55', backgroundColor: '#fff' }}>
                        <View className="flex-row items-center gap-1.5 mb-2">
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: brData?.color }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{b.code}</Text></View>
                          <Text style={{ color: colors.ink, fontSize: 11.5, fontWeight: '700' }}>{b.city}</Text>
                        </View>
                        <ChipRow title="Groups" items={gItems} sel={accGroups} setSel={setAccGroups} />
                        {dItems.length > 0 ? <ChipRow title="Departments" items={dItems} sel={accDepts} setSel={setAccDepts} /> : null}
                        {aItems.length > 0 ? <ChipRow title="System Alerts" items={aItems} sel={accAlerts} setSel={setAccAlerts} /> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Non-branch business access */}
            {!hasBranches && selBizId && alertsAvail.length > 0 ? (
              <FormField label={`Access · System Alerts · required · ${accAlerts.length}/${alertsAvail.length}`}>
                <View className="flex-row flex-wrap gap-1.5">
                  {alertsAvail.map((m) => {
                    const sel = accAlerts.includes(m.key);
                    return (
                      <Pressable key={m.key} onPress={() => setAccAlerts(toggle(accAlerts, m.key))} className="flex-row items-center gap-1.5"
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: sel ? m.color : '#fff', borderColor: sel ? m.color : colors.cardEdge }}>
                        <Text style={{ fontSize: 12 }}>{m.icon}</Text>
                        <Text style={{ color: sel ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '800' }}>{m.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </FormField>
            ) : null}
          </>
        )}

        {/* Attendance — mandatory */}
        <FormField label="Attendance">
          <View className="flex-row items-center gap-2.5" style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.cardEdge, backgroundColor: colors.orange + '12' }}>
            <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orange + '22' }}><Camera size={15} color={colors.orange} /></View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>Attendance enabled</Text>
              <Text style={{ color: colors.warmMute, fontSize: 10 }}>Auto via office Wi-Fi / geofence · mandatory</Text>
            </View>
            <View className="flex-row items-center gap-1" style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.success + '1A' }}>
              <Lock size={10} color={colors.success} /><Text style={{ color: colors.success, fontSize: 9, fontWeight: '800' }}>REQUIRED</Text>
            </View>
          </View>
        </FormField>

        {!v.valid ? <Text style={{ color: colors.coral, fontSize: 10.5, fontWeight: '600', marginBottom: 8 }}>Required: {required}</Text> : null}
        <SheetSave label={editUser ? 'Save changes' : 'Send invite'} disabled={!v.valid} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}
