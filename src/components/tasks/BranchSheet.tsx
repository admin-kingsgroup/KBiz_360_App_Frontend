import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../ui/Modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { useDirectoryStore } from '../../store/directoryStore';

// Business → branch picker (the CRM company and branch list). A task belongs to one branch; its
// business follows from the branch. `allowAny` adds an "Any business or branch" row for filters.

export interface BranchPick { branchId: string; companyId: string | null; label: string }

export function branchLabel(branchId: string | null | undefined, dir: { businesses: { id: string; name: string }[]; branches: { id: string; code: string; city: string; companyId?: string }[] }): string {
  if (!branchId) return '';
  const b = dir.branches.find((x) => x.id === branchId);
  if (!b) {
    const biz = dir.businesses.find((x) => x.id === branchId);
    return biz?.name ?? '';
  }
  const biz = dir.businesses.find((x) => x.id === b.companyId);
  return `${biz ? `${biz.name} · ` : ''}${b.code}${b.city && b.city.toUpperCase() !== b.code.toUpperCase() ? ` (${b.city})` : ''}`;
}

export function BranchSheet({ visible, selected, allowAny = false, allowBusiness = false, onPick, onClose }: {
  visible: boolean; selected: string | null; allowAny?: boolean; allowBusiness?: boolean;
  onPick: (pick: BranchPick | null) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const businesses = useDirectoryStore((s) => s.businesses);
  const branches = useDirectoryStore((s) => s.branches);
  useEffect(() => { if (visible) void useDirectoryStore.getState().load(); }, [visible]);

  const sections = useMemo(() => businesses
    .map((biz) => ({ biz, branches: branches.filter((b) => b.companyId === biz.id).sort((a, b) => a.code.localeCompare(b.code)) }))
    .filter((s) => s.branches.length > 0)
    .sort((a, b) => a.biz.name.localeCompare(b.biz.name)), [businesses, branches]);

  const row = (key: string, label: string, sub: string | null, on: boolean, press: () => void, indent = false) => (
    <Pressable key={key} onPress={press} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingLeft: indent ? 22 : 12, paddingRight: 12, borderRadius: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: indent ? '600' : '700' }}>{label}</Text>
        {sub ? <Text style={{ color: colors.coolText, fontSize: 12 }}>{sub}</Text> : null}
      </View>
      {on ? <Check size={18} color={colors.primary} strokeWidth={3} /> : null}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(24, insets.bottom + 12), maxHeight: '80%' }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 }}>
            <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Business / branch</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
            {allowAny ? row('any', 'Any business or branch', null, !selected, () => onPick(null)) : null}
            {sections.length === 0 ? <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>Loading businesses…</Text> : null}
            {sections.map(({ biz, branches: list }) => (
              <View key={biz.id} style={{ marginTop: 6 }}>
                {allowBusiness
                  ? row(biz.id, biz.name, 'All its branches', selected === biz.id, () => onPick({ branchId: biz.id, companyId: biz.id, label: biz.name }))
                  : <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 }}>{biz.name.toUpperCase()}</Text>}
                {list.map((b) => row(b.id, b.code, b.city && b.city.toUpperCase() !== b.code.toUpperCase() ? b.city : null, selected === b.id,
                  () => onPick({ branchId: b.id, companyId: b.companyId ?? null, label: `${biz.name} · ${b.code}` }), true))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
