import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../ui/Modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, X } from 'lucide-react-native';
import type { TaskPriority, TaskStatus } from '../../api/tasks';
import { colors } from '../../theme';
import { ALL_STATUSES, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, dayKeyOf } from '../../logic/taskRules';
import type { TaskFilters } from '../../logic/taskGroups';
import { DaySheet } from '../forms';
import { PeopleSheet } from './PeopleSheet';
import { BranchSheet, branchLabel } from './BranchSheet';
import { useAccessStore } from '../../store/accessStore';
import { useDirectoryStore } from '../../store/directoryStore';

// List filters (spec section 7): person, business or branch, priority, status, due date range.

const dayText = (day: string | null | undefined): string => {
  if (!day) return 'Any';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, height: 32, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? colors.primary : '#fff', borderWidth: on ? 0 : 1, borderColor: colors.borderStrong }}>
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{value}</Text>
        <ChevronDown size={17} color={colors.coolText} />
      </Pressable>
    </View>
  );
}

export function FilterSheet({ visible, value, meId, onChange, onClose }: { visible: boolean; value: TaskFilters; meId: string; onChange: (f: TaskFilters) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const users = useAccessStore((s) => s.users);
  const businesses = useDirectoryStore((s) => s.businesses);
  const branches = useDirectoryStore((s) => s.branches);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState<'from' | 'to' | null>(null);
  const set = (patch: Partial<TaskFilters>): void => onChange({ ...value, ...patch });
  const personName = value.personId ? (value.personId === meId ? 'Me' : users.find((u) => u.id === value.personId)?.name ?? 'Someone') : 'Anyone';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(24, insets.bottom + 12), maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10 }}>
            <View style={{ alignItems: 'center', paddingBottom: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Filter tasks</Text>
              <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
            </View>

            <Field label="PERSON" value={personName} onPress={() => setPeopleOpen(true)} />
            <Field label="BUSINESS OR BRANCH" value={branchLabel(value.branchId, { businesses, branches }) || 'Any'} onPress={() => setBranchOpen(true)} />

            <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 }}>PRIORITY</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip label="Any" on={!value.priority} onPress={() => set({ priority: null })} />
              {PRIORITIES.map((p: TaskPriority) => <Chip key={p} label={PRIORITY_LABEL[p]} on={value.priority === p} onPress={() => set({ priority: p })} />)}
            </View>

            <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 }}>STATUS</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip label="Any" on={!value.status} onPress={() => set({ status: null })} />
              {ALL_STATUSES.map((s: TaskStatus) => <Chip key={s} label={STATUS_LABEL[s]} on={value.status === s} onPress={() => set({ status: s })} />)}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="DUE FROM" value={dayText(value.dueFrom)} onPress={() => setRangeOpen('from')} /></View>
              <View style={{ flex: 1 }}><Field label="DUE TO" value={dayText(value.dueTo)} onPress={() => setRangeOpen('to')} /></View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable onPress={() => onChange({ q: value.q })} style={{ flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Clear all</Text>
              </Pressable>
              <Pressable onPress={onClose} style={{ flex: 1.4, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Show tasks</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      <PeopleSheet visible={peopleOpen} title="Person" subtitle="Tasks they gave or were given" meId={meId} myself
        onPick={(id) => { set({ personId: id }); setPeopleOpen(false); }} onClose={() => setPeopleOpen(false)} />
      <BranchSheet visible={branchOpen} selected={value.branchId ?? null} allowAny allowBusiness
        onPick={(p) => { set({ branchId: p ? p.branchId : null }); setBranchOpen(false); }} onClose={() => setBranchOpen(false)} />
      <DaySheet visible={rangeOpen !== null} title={rangeOpen === 'from' ? 'Due from' : 'Due to'}
        initial={(rangeOpen === 'from' ? value.dueFrom : value.dueTo) ?? null}
        minDay="2024-01-01" maxDay={dayKeyOf(new Date(new Date().getFullYear() + 2, 11, 31))}
        onClose={() => setRangeOpen(null)} onConfirm={(d) => { set(rangeOpen === 'from' ? { dueFrom: d } : { dueTo: d }); setRangeOpen(null); }} />
    </Modal>
  );
}
