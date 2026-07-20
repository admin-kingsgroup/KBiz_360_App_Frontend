import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, X, Building2 } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { ApiError } from '../../src/api/client';
import { listCompanies, listBranches, createCompany, type DirectoryCompany, type DirectoryBranch } from '../../src/api/directory';
import { codeFromName } from '../../src/logic/directory';

const PALETTE = ['#9A6CF0', '#4F8BFF', '#37B6A4', '#E8A13A', '#E3674E', '#2FB36B', '#DB2777'];

// Companies (real CRM). One row per company → drills into business/[id].
// Super admins can create a new business (written to the CRM companies collection).
export default function Businesses() {
  const router = useRouter();
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const showToast = useUiStore((s) => s.showToast);
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = (active = { current: true }) =>
    Promise.all([listCompanies(), listBranches()])
      .then(([c, b]) => { if (active.current) { setCompanies(c); setBranches(b); } })
      .catch(() => { /* offline / unreachable */ })
      .finally(() => { if (active.current) setLoading(false); });

  useEffect(() => {
    const active = { current: true };
    void load(active);
    return () => { active.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBusiness = () => {
    const name = nameInput.trim();
    if (!name) { showToast('Business name required'); return; }
    setSaving(true);
    createCompany(name)
      .then(() => { showToast('Business created'); setCreating(false); setNameInput(''); return load(); })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not create business'))
      .finally(() => setSaving(false));
  };

  const branchCount = (companyId: string) => branches.filter((b) => b.companyId === companyId).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      {/* Standard white header */}
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Businesses</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{loading ? 'Loading…' : `${companies.length} shown`}</Text>
        </View>
        {isSuper ? (
          <Pressable onPress={() => setCreating(true)} hitSlop={6} className="flex-row items-center gap-1" style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.primary, marginRight: 8 }}>
            <Plus size={15} color="#fff" /><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 10 }}>Loading businesses…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          {companies.map((c, i) => {
            const color = PALETTE[i % PALETTE.length];
            const n = branchCount(c.id);
            return (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/business/[id]', params: { id: c.id } })} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{codeFromName(c.name)}</Text></View>
                <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{c.name}</Text><Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{n} branch{n === 1 ? '' : 'es'}{c.status ? ` · ${c.status}` : ''}</Text></View>
                <ChevronRight size={18} color={colors.coolText3} />
              </Pressable>
            );
          })}
          {companies.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.coolText, fontSize: 14 }}>No businesses in your scope</Text></View>
          ) : null}
          {isSuper ? (
            <Pressable onPress={() => setCreating(true)} className="flex-row items-center justify-center gap-1.5 mt-1" style={{ height: 50, borderRadius: 999, backgroundColor: colors.primary }}>
              <Plus size={17} color="#fff" /><Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>New business</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {/* Create business */}
      <Modal visible={creating} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
              <View className="flex-row items-center gap-2"><Building2 size={18} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>New business</Text></View>
              <Pressable onPress={() => setCreating(false)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>BUSINESS NAME</Text>
            <TextInput value={nameInput} onChangeText={setNameInput} autoFocus placeholder="e.g. Travkings Logistics" placeholderTextColor={colors.coolText3}
              style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, fontWeight: '500' }} />
            <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 8 }}>The business is added to the company directory and the ERP. Branches can be attached from the ERP.</Text>
            <Pressable onPress={saveBusiness} disabled={saving} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{saving ? 'Creating…' : 'Create business'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
