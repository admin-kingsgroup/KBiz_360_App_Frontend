import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronRight, Clock, Lock, Building2 } from 'lucide-react-native';
import { colors } from '../../theme';
import { businesses as mockBusinesses, branches as mockBranches, businessDepts as mockDepts } from '../../data/businesses';
import { DEPT_DESCRIPTIONS } from '../../constants/departments';
import { makeAccessFilters } from '../../logic/accessFilters';
import type { AccessControl, Business, Branch, Department } from '../../types';

interface DItem { _key: string; name: string; icon: string; color: string; desc: string; bizId: string; branchCode?: string; _unread: number; }
interface Section { id: string; label: string; color: string; ctx: string; time?: string; flag?: string; items: DItem[]; }

// Departments segment. Data comes via props (real CRM directory) and falls back to the mock org data.
// Departments are listed ONCE per business (deduped by name — the same department existing in several
// branches is one card); the branch split lives inside the department detail, which shows that
// department's groups per branch. `serverFiltered` skips the client access filters because the
// backend already scoped the rows. View-As-aware otherwise.
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
    // ONE flat list: each department appears once (deduped by name across branches).
    // Visible if the user can see it in at least one branch they can access; unread
    // sums across all branches. Tapping opens the detail, which splits by branch.
    const depts = businessDepts[activeBizId] || [];
    const accessibleBranches = branchesForBiz(activeBizId).filter((br) => brOK(br.code));
    const seen = new Set<string>();
    const items = depts
      .filter((d) => {
        const key = (d.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        if (!accessibleBranches.some((br) => deptOK(br.code, d.name))) return false;
        seen.add(key);
        return true;
      })
      .map((d) => ({ _key: `${activeBizId}-${d.id}`, name: d.name, icon: d.icon, color: d.color, desc: DEPT_DESCRIPTIONS[d.name] || 'Department group', bizId: activeBizId, _unread: deptUnread(d.name, null) }));
    const biz = businesses.find((b) => b.id === activeBizId);
    sections = [{ id: activeBizId, label: biz?.name ?? 'Departments', color: biz?.color ?? colors.ink, ctx: biz?.code ?? '', items }];
  } else {
    const bizList = (activeBizId === 'all' ? businesses : businesses.filter((b) => b.id === activeBizId)).filter((b) => bizOK(b.id));
    sections = bizList.map((b) => {
      const seen = new Set<string>();
      return {
        id: b.id, label: b.name, color: b.color, ctx: b.code,
        items: (businessDepts[b.id] || [])
          .filter((d) => {
            const key = (d.name || '').trim().toLowerCase();
            if (!key || seen.has(key) || !deptOK(b.code, d.name)) return false;
            seen.add(key);
            return true;
          })
          .map((d) => ({ _key: `${b.id}-${d.id}`, name: d.name, icon: d.icon, color: d.color, desc: DEPT_DESCRIPTIONS[d.name] || 'Department group', bizId: b.id, _unread: branchesForBiz(b.id).length ? deptUnread(d.name, null) : 0 })),
      };
    });
  }
  const allItems = sections.flatMap((s) => s.items);
  const unread = allItems.filter((d) => d._unread > 0);

  if (allItems.length === 0) {
    return isSuper
      ? <Empty icon={<Building2 size={36} color={colors.coolText3} />} title="No departments yet" sub="Set up this business in Profile → Businesses" />
      : <Empty icon={<Lock size={34} color={colors.coolText3} />} title="No departments in your access" sub="Ask your admin to grant the departments you need." />;
  }

  const DeptCard = (d: DItem) => (
    <Pressable key={d._key} onPress={() => onOpenDept(d)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3"
      style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: d.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>{d.icon}</Text></View>
      <View className="flex-1">
        <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{d.name}</Text>
        <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 13, marginTop: 2 }}>{d.desc}</Text>
      </View>
      {d._unread > 0 ? <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{d._unread}</Text></View> : null}
      <ChevronRight size={18} color={colors.coolText3} />
    </Pressable>
  );

  return (
    <View className="px-4 pt-3 pb-6" style={{ gap: 12 }}>
      {unread.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View className="flex-row items-center gap-1.5 px-1">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Unread</Text>
            <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {unread.length}</Text>
          </View>
          {sections.map((s) => {
            const u = s.items.filter((d) => d._unread > 0);
            if (u.length === 0) return null;
            return (
              <View key={`u-${s.id}`} style={{ gap: 6 }}>
                <View className="flex-row items-center gap-1.5 px-1 pl-3">
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                  <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>{s.label} · {u.length}</Text>
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
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{s.label}</Text>
              <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600' }}>· {readItems.length} departments</Text>
              {s.time ? (
                <View className="flex-row items-center gap-1 ml-auto" style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.primarySoft }}>
                  <Clock size={11} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{s.flag} {s.time}</Text>
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
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}
