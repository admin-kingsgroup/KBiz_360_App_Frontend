import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronRight, Clock, Lock, Building2 } from 'lucide-react-native';
import { colors, shadow } from '../../theme';
import { businesses as mockBusinesses, branches as mockBranches, businessDepts as mockDepts } from '../../data/businesses';
import { DEPT_DESCRIPTIONS } from '../../constants/departments';
import { makeAccessFilters } from '../../logic/accessFilters';
import { tzTime } from '../../utils/time';
import type { AccessControl, Business, Branch, Department } from '../../types';

interface DItem { _key: string; name: string; icon: string; color: string; desc: string; bizId: string; branchCode?: string; _unread: number; }
interface Section { id: string; label: string; color: string; ctx: string; time?: string; flag?: string; items: DItem[]; }

// Departments segment. Data comes via props (real CRM directory) and falls back to the mock org data.
// A business with branches → per-branch sections; otherwise per-business. `serverFiltered` skips the
// client access filters because the backend already scoped the rows. View-As-aware otherwise.
export function DepartmentsList({
  activeBizId, access, onOpenDept,
  businesses = mockBusinesses, branches = mockBranches, businessDepts = mockDepts, serverFiltered = false,
}: {
  activeBizId: string; access: AccessControl | null; onOpenDept: (d: DItem) => void;
  businesses?: Business[]; branches?: Branch[]; businessDepts?: Record<string, Department[]>; serverFiltered?: boolean;
}) {
  const f = makeAccessFilters(access);
  const isSuper = f.isSuper;
  const yes = () => true; // permissive filter when the server already scoped the rows
  const bizOK: typeof f.bizOK = serverFiltered ? yes : f.bizOK;
  const brOK: typeof f.brOK = serverFiltered ? yes : f.brOK;
  const deptOK: typeof f.deptOK = serverFiltered ? yes : f.deptOK;
  const branchesForBiz = (bizId: string): Branch[] => branches.filter((br) => (br.companyId ?? 'tk') === bizId);
  // Per-branch view when a single business that actually has branches is selected.
  const branchMode = activeBizId !== 'all' && branchesForBiz(activeBizId).length > 0;

  const deptUnread = (deptName: string, branchId: string | null) => {
    let total = 0;
    branches.forEach((br) => { if (branchId && br.id !== branchId) return; br.groups.forEach((g) => { if (g.name === deptName) total += g.unread || 0; }); });
    return total;
  };

  let sections: Section[] = [];
  if (branchMode) {
    const depts = businessDepts[activeBizId] || [];
    sections = branchesForBiz(activeBizId).filter((br) => brOK(br.code)).map((br) => ({
      id: br.id, label: `${br.code} · ${br.city}`, color: br.color, ctx: br.code, time: tzTime(br.tz), flag: br.flag,
      items: depts.filter((d) => deptOK(br.code, d.name)).map((d) => ({ _key: `${br.id}-${d.id}`, name: d.name, icon: d.icon, color: d.color, desc: DEPT_DESCRIPTIONS[d.name] || 'Department group', bizId: activeBizId, branchCode: br.code, _unread: deptUnread(d.name, br.id) })),
    }));
  } else {
    const bizList = (activeBizId === 'all' ? businesses : businesses.filter((b) => b.id === activeBizId)).filter((b) => bizOK(b.id));
    sections = bizList.map((b) => ({
      id: b.id, label: b.name, color: b.color, ctx: b.code,
      items: (businessDepts[b.id] || []).filter((d) => deptOK(b.code, d.name)).map((d) => ({ _key: `${b.id}-${d.id}`, name: d.name, icon: d.icon, color: d.color, desc: DEPT_DESCRIPTIONS[d.name] || 'Department group', bizId: b.id, _unread: branchesForBiz(b.id).length ? deptUnread(d.name, null) : 0 })),
    }));
  }
  const allItems = sections.flatMap((s) => s.items);
  const unread = allItems.filter((d) => d._unread > 0);

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<Building2 size={32} color={colors.textMuted2} />} title="No departments yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={30} color={colors.textMuted2} />} title="No departments in your access" sub="Ask your admin to grant the departments you need." />;
  }

  const DeptCard = (d: DItem) => (
    <Pressable key={d._key} onPress={() => onOpenDept(d)} className="flex-row items-center gap-3 p-2.5"
      style={[{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16 }, shadow]}>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: d.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{d.icon}</Text></View>
      <View className="flex-1">
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 14, fontWeight: '600' }}>{d.name}</Text>
        <Text numberOfLines={1} style={{ color: colors.warmMute, fontSize: 11, marginTop: 2 }}>{d.desc}</Text>
      </View>
      {d._unread > 0 ? <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{d._unread}</Text></View> : null}
      <ChevronRight size={14} color={colors.textMuted2} />
    </Pressable>
  );

  return (
    <View className="px-4 pt-3 pb-6" style={{ gap: 12 }}>
      {unread.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View className="flex-row items-center gap-1.5 px-1">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral }} />
            <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13, fontWeight: '600' }}>Unread</Text>
            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {unread.length}</Text>
          </View>
          {sections.map((s) => {
            const u = s.items.filter((d) => d._unread > 0);
            if (u.length === 0) return null;
            return (
              <View key={`u-${s.id}`} style={{ gap: 6 }}>
                <View className="flex-row items-center gap-1.5 px-1 pl-3">
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                  <Text style={{ color: colors.warmMute, fontSize: 11, fontWeight: '700' }}>{s.label} · {u.length}</Text>
                </View>
                {u.map(DeptCard)}
              </View>
            );
          })}
        </View>
      ) : null}
      {sections.map((s) => {
        const readItems = s.items.filter((d) => !d._unread);
        if (readItems.length === 0) return null;
        return (
          <View key={s.id} style={{ gap: 6 }}>
            <View className="flex-row items-center gap-1.5 px-1 mt-1">
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13, fontWeight: '600' }}>{s.label}</Text>
              <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '700' }}>· {readItems.length} departments</Text>
              {s.time ? (
                <View className="flex-row items-center gap-1 ml-auto" style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.teal + '14' }}>
                  <Clock size={9} color={colors.teal} /><Text style={{ color: colors.teal, fontSize: 9.5, fontWeight: '700' }}>{s.flag} {s.time}</Text>
                </View>
              ) : null}
            </View>
            {readItems.map(DeptCard)}
          </View>
        );
      })}
    </View>
  );
}

function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <View className="items-center px-6" style={{ paddingVertical: 64 }}>
      <View className="mb-3">{icon}</View>
      <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
