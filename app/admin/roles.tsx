import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shield, Check, ChevronLeft, X, Pencil } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { listRoles, listUsers, setRolePermissions, humanizeRole, type DirectoryRole } from '../../src/api/directory';
import { ApiError } from '../../src/api/client';

// Roles & Permissions — real CRM roles. Super-admins can edit a role's permission list (writes to the
// CRM). The permission catalog is the union of permissions already used across roles, so only real
// permission keys are offered. Changing permissions affects access — handle with care.
export default function Roles() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const [roles, setRoles] = useState<DirectoryRole[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({}); // roleId → user count
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DirectoryRole | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = (): void => {
    Promise.all([listRoles(), listUsers()])
      .then(([r, u]) => {
        setRoles(r);
        const c: Record<string, number> = {};
        u.forEach((usr) => { if (usr.roleId) c[usr.roleId] = (c[usr.roleId] ?? 0) + 1; });
        setCounts(c);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const catalog = useMemo(() => [...new Set(roles.flatMap((r) => r.permissions ?? []))].sort(), [roles]);
  const sorted = useMemo(() => [...roles].sort((a, b) => a.level - b.level), [roles]);

  const openEdit = (r: DirectoryRole): void => { setEditing(r); setSel(new Set(r.permissions ?? [])); };
  const toggle = (p: string): void => setSel((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const save = (): void => {
    if (!editing) return;
    setSaving(true);
    setRolePermissions(editing.id, [...sel])
      .then(() => { showToast('Permissions updated'); setEditing(null); load(); })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not save'))
      .finally(() => setSaving(false));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Roles & Permissions</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{loading ? 'Loading…' : `${roles.length} roles`}</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 8 }}>
          <View style={{ backgroundColor: '#FEF7E6', borderColor: '#F5E5BA', borderWidth: 1, borderRadius: 12, padding: 11 }}>
            <Text style={{ color: colors.ink, fontSize: 11, lineHeight: 16 }}>
              Each role defines a <Text style={{ fontWeight: '800' }}>scope of access</Text> (higher level = more access). {isSuper ? 'Tap a role to edit its permissions — changes affect everyone with that role.' : 'Read-only — only a super-admin can edit.'}
            </Text>
          </View>

          {sorted.map((r, idx) => (
            <Pressable key={r.id} disabled={!isSuper} onPress={() => openEdit(r)}
              className="flex-row items-center gap-3 px-3.5 py-3" style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}><Shield size={16} color="#fff" /></View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800' }}>{humanizeRole(r.name)}</Text>
                  <Text style={{ backgroundColor: '#F4F2EC', color: colors.textMuted, fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>TIER {idx + 1}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{(r.permissions ?? []).length} permissions · {counts[r.id] ?? 0} {counts[r.id] === 1 ? 'user' : 'users'}</Text>
              </View>
              {isSuper ? <Pencil size={15} color={colors.textMuted} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Permission editor */}
      <Modal visible={!!editing} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, height: '78%', paddingBottom: 12 }}>
            <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
              <View>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{editing ? humanizeRole(editing.name) : ''} · permissions</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{sel.size} selected</Text>
              </View>
              <Pressable onPress={() => setEditing(null)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 4 }}>
              {catalog.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, padding: 16, textAlign: 'center' }}>No permission keys defined in the CRM yet.</Text>
              ) : catalog.map((p) => {
                const on = sel.has(p);
                return (
                  <Pressable key={p} onPress={() => toggle(p)} className="flex-row items-center gap-3 px-3 py-2.5" style={{ borderRadius: 12, backgroundColor: on ? colors.ink + '0D' : 'transparent' }}>
                    <Text style={{ flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{p}</Text>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.ink : colors.cardEdge, backgroundColor: on ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Check size={13} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="px-4">
              <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{saving ? 'Saving…' : 'Save permissions'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
