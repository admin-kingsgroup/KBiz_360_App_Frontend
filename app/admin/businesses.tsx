import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { listCompanies, listBranches, type DirectoryCompany, type DirectoryBranch } from '../../src/api/directory';

const PALETTE = ['#9A6CF0', '#4F8BFF', '#37B6A4', '#E8A13A', '#E3674E', '#2FB36B', '#DB2777'];

// Derive a short code from the company name, skipping small words ("Travkings Tours and Travels" → TTT).
function codeOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => !/^(and|of|the|&|private|limited|ltd)$/i.test(w));
  return (words.slice(0, 3).map((w) => w[0]).join('') || name.slice(0, 2)).toUpperCase();
}

// Companies (real CRM, read-only). One row per company → drills into business/[id].
export default function Businesses() {
  const router = useRouter();
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([listCompanies(), listBranches()])
      .then(([c, b]) => { if (active) { setCompanies(c); setBranches(b); } })
      .catch(() => { /* offline / unreachable */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const branchCount = (companyId: string) => branches.filter((b) => b.companyId === companyId).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Businesses</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{loading ? 'Loading…' : `${companies.length} shown`}</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}>
          <ActivityIndicator color={colors.ink} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Loading businesses…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          {companies.map((c, i) => {
            const color = PALETTE[i % PALETTE.length];
            const n = branchCount(c.id);
            return (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/business/[id]', params: { id: c.id } })} className="flex-row items-center gap-3 p-3" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{codeOf(c.name)}</Text></View>
                <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{c.name}</Text><Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{n} branch{n === 1 ? '' : 'es'}{c.status ? ` · ${c.status}` : ''}</Text></View>
                <ChevronRight size={14} color={colors.textMuted} />
              </Pressable>
            );
          })}
          {companies.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.textMuted, fontSize: 13 }}>No businesses in your scope</Text></View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
