import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Plus, Trash2, X, Check } from 'lucide-react-native';
import { colors, shadowSm } from '../../src/theme';
import { useUiStore } from '../../src/store/uiStore';
import {
  listAppDepartments, listCompanies, listBranches, createDepartment, updateDepartment, deleteDepartment,
  type AppDepartment, type DirectoryCompany, type DirectoryBranch,
} from '../../src/api/directory';
import { ApiError } from '../../src/api/client';

const SWATCHES = ['#4F8BFF', '#37B6A4', '#9A6CF0', '#E8A13A', '#E3674E', '#2E9E6B', '#C0497B', '#0C0E14'];
type Form = { id: string | null; name: string; companyId: string | null; branchId: string | null; color: string };

// Admin → Departments. Create/edit/delete app departments (the CRM ones are read-only). A department
// belongs to a company and applies to all its branches (each branch gets that department's group),
// unless a specific branch is chosen. Super-admin only (the API enforces it).
export default function ManageDepartments() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [rows, setRows] = useState<AppDepartment[]>([]);
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = (): void => { listAppDepartments().then(setRows).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    listCompanies().then(setCompanies).catch(() => undefined);
    listBranches().then(setBranches).catch(() => undefined);
  }, []);

  const companyName = useMemo(() => { const m = new Map(companies.map((c) => [c.id, c.name])); return (id: string | null) => (id ? m.get(id) ?? 'Company' : 'All companies'); }, [companies]);
  const branchLabel = (b: DirectoryBranch): string => b.code || b.name || b.city || 'Branch';
  const branchName = useMemo(() => { const m = new Map(branches.map((b) => [b.id, branchLabel(b)])); return (id: string | null) => (id ? m.get(id) ?? 'Branch' : 'All branches'); }, [branches]);

  const startNew = (): void => setForm({ id: null, name: '', companyId: companies[0]?.id ?? null, branchId: null, color: SWATCHES[0] });
  const startEdit = (d: AppDepartment): void => setForm({ id: d.id, name: d.name, companyId: d.companyId, branchId: d.branchId, color: d.color || SWATCHES[0] });
  const branchesForCompany = form ? branches.filter((b) => !form.companyId || b.companyId === form.companyId) : [];

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.name.trim()) { showToast('Department name required'); return; }
    if (!form.companyId) { showToast('Pick a company'); return; }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), companyId: form.companyId, branchId: form.branchId, color: form.color };
      if (form.id) await updateDepartment(form.id, body);
      else await createDepartment(body);
      showToast('Department saved');
      setForm(null);
      load();
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not save'); } finally { setSaving(false); }
  };

  const remove = (d: AppDepartment): void => Alert.alert('Delete department', `Delete "${d.name}"? Its branch groups will no longer be listed.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void deleteDepartment(d.id).then(() => { showToast('Department deleted'); load(); }).catch(() => showToast('Could not delete')); } },
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View><Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Departments</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{loading ? 'Loading…' : `${rows.length} custom`}</Text></View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          <Text style={{ color: colors.warmMute, fontSize: 11.5, lineHeight: 17, paddingHorizontal: 2 }}>
            Departments you create here appear in the Departments tab and give every branch in the company a group. (Departments synced from the CRM are read-only.)
          </Text>
          {rows.map((d) => (
            <View key={d.id} className="flex-row items-center gap-3 p-3" style={[{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 14 }, shadowSm]}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: d.color || colors.blue, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{(d.name.trim()[0] ?? '•').toUpperCase()}</Text>
              </View>
              <Pressable onPress={() => startEdit(d)} className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{d.name}</Text>
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{companyName(d.companyId)} · {branchName(d.branchId)} · tap to edit</Text>
              </Pressable>
              <Pressable onPress={() => remove(d)} hitSlop={6} style={{ padding: 6 }}><Trash2 size={16} color={colors.danger} /></Pressable>
            </View>
          ))}
          {rows.length === 0 ? <Text style={{ color: colors.textMuted2, fontSize: 12, textAlign: 'center', paddingVertical: 24 }}>No custom departments yet.</Text> : null}

          <Pressable onPress={startNew} className="flex-row items-center justify-center gap-1.5 mt-1" style={{ paddingVertical: 13, borderRadius: 13, backgroundColor: colors.ink }}>
            <Plus size={15} color="#fff" /><Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>New department</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Create / edit form */}
      <Modal visible={!!form} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, maxHeight: '88%' }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '700' }}>{form?.id ? 'Edit department' : 'New department'}</Text>
              <Pressable onPress={() => setForm(null)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput value={form?.name ?? ''} onChangeText={(t) => setForm((f) => (f ? { ...f, name: t } : f))} placeholder="Department name (e.g. Marketing)" placeholderTextColor={colors.textMuted}
                style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: '600' }} />

              {companies.length > 1 ? (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>COMPANY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                    {companies.map((c) => <Chip key={c.id} label={c.name} active={form?.companyId === c.id} onPress={() => setForm((f) => (f ? { ...f, companyId: c.id, branchId: null } : f))} />)}
                  </ScrollView>
                </>
              ) : null}

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>BRANCH</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                <Chip label="All branches" active={!form?.branchId} onPress={() => setForm((f) => (f ? { ...f, branchId: null } : f))} />
                {branchesForCompany.map((b) => <Chip key={b.id} label={branchLabel(b)} active={form?.branchId === b.id} onPress={() => setForm((f) => (f ? { ...f, branchId: b.id } : f))} />)}
              </ScrollView>

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>COLOUR</Text>
              <View className="flex-row flex-wrap gap-2">
                {SWATCHES.map((c) => (
                  <Pressable key={c} onPress={() => setForm((f) => (f ? { ...f, color: c } : f))} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c, borderWidth: form?.color === c ? 3 : 0, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                    {form?.color === c ? <Check size={15} color="#fff" /> : null}
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Pressable onPress={save} disabled={saving} style={{ marginTop: 16, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{saving ? 'Saving…' : form?.id ? 'Save changes' : 'Create department'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? colors.ink : '#fff', borderWidth: 1, borderColor: active ? colors.ink : colors.cardEdge }}>
      <Text style={{ color: active ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
