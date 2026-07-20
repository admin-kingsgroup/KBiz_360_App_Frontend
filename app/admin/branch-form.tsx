import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { FormField, SheetSave } from '../../src/components/forms';
import { useUiStore } from '../../src/store/uiStore';
import { listCompanies, createBranch, type DirectoryCompany } from '../../src/api/directory';
import { ApiError } from '../../src/api/client';

// Create a branch under a specific business (super-admin). Writes to the CRM branches collection so
// the new branch shows up everywhere branches are used (groups, users, attendance, alerts).
export default function BranchForm() {
  const router = useRouter();
  const { companyId: prefillCompany } = useLocalSearchParams<{ companyId?: string }>();
  const showToast = useUiStore((s) => s.showToast);

  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(prefillCompany ?? null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('India');
  const [isHO, setIsHO] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCompanies()
      .then((c) => { setCompanies(c); if (!prefillCompany && c.length === 1) setCompanyId(c[0].id); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A branch always belongs to a business — that's a hard requirement.
  const valid = !!companyId && name.trim().length > 0 && code.trim().length > 0;
  const missing = [!companyId && 'business', !name.trim() && 'branch name', !code.trim() && 'branch code'].filter(Boolean).join(' · ');

  const save = async (): Promise<void> => {
    if (!valid || !companyId) return;
    setSaving(true);
    try {
      await createBranch({ companyId, name: name.trim(), code: code.trim().toUpperCase(), city: city.trim() || undefined, country: country.trim() || undefined, isHO });
      showToast(`Branch ${code.trim().toUpperCase()} created`);
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
          {companies.length === 0 ? <ActivityIndicator color={colors.primary} /> : (
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
        <FormField label="Branch code" required hint="Short unique code, e.g. PNQ. Must not clash with an existing branch.">
          <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="e.g. PNQ" autoCapitalize="characters" autoCorrect={false} maxLength={20} placeholderTextColor={colors.coolText3} style={input} />
        </FormField>
        <FormField label="City">
          <TextInput value={city} onChangeText={setCity} placeholder="e.g. Pune" placeholderTextColor={colors.coolText3} style={input} />
        </FormField>
        <FormField label="Country">
          <TextInput value={country} onChangeText={setCountry} placeholder="e.g. India" placeholderTextColor={colors.coolText3} style={input} />
        </FormField>

        <FormField label="Head office">
          <Pressable onPress={() => setIsHO((v) => !v)} className="flex-row items-center justify-between px-3 py-3" style={{ borderWidth: 1, borderRadius: 12, borderColor: colors.coolDivider, backgroundColor: colors.card }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{isHO ? 'This branch is the head office' : 'Regular branch'}</Text>
            <View style={{ width: 46, height: 28, borderRadius: 999, backgroundColor: isHO ? colors.primary : colors.coolDivider, padding: 3, alignItems: isHO ? 'flex-end' : 'flex-start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
            </View>
          </Pressable>
        </FormField>

        {!valid ? <Text style={{ color: colors.danger, fontSize: 11.5, fontWeight: '600', marginBottom: 8 }}>Required: {missing}</Text> : null}
        <SheetSave label={saving ? 'Creating…' : 'Create branch'} disabled={!valid || saving} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontWeight: '500' as const, color: colors.ink };
