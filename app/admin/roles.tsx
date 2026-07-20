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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Roles & Permissions</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{loading ? 'Loading…' : `${roles.length} roles`}</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 10 }}>
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18 }}>
              Each role defines a <Text style={{ fontWeight: '700' }}>scope of access</Text> (higher level = more access). {isSuper ? 'Tap a role to edit its permissions — changes affect everyone with that role.' : 'Read-only — only a super-admin can edit.'}
            </Text>
          </View>

          {sorted.map((r, idx) => (
            <Pressable key={r.id} disabled={!isSuper} onPress={() => openEdit(r)} android_ripple={{ color: colors.coolMuted }}
              className="flex-row items-center gap-3 px-3.5 py-3" style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16 }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}><Shield size={20} color="#fff" /></View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{humanizeRole(r.name)}</Text>
                  <Text style={{ backgroundColor: colors.coolMuted, color: colors.coolText, fontSize: 10, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>TIER {idx + 1}</Text>
                </View>
                <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>{(r.permissions ?? []).length} permissions · {counts[r.id] ?? 0} {counts[r.id] === 1 ? 'user' : 'users'}</Text>
              </View>
              {isSuper ? <Pencil size={17} color={colors.coolText3} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Permission editor */}
      <Modal visible={!!editing} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, height: '78%', paddingBottom: 12 }}>
            <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              <View>
                <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{editing ? humanizeRole(editing.name) : ''} · permissions</Text>
                <Text style={{ color: colors.coolText, fontSize: 12 }}>{sel.size} selected</Text>
              </View>
              <Pressable onPress={() => setEditing(null)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 4 }}>
              {catalog.length === 0 ? (
                <Text style={{ color: colors.coolText, fontSize: 13, padding: 16, textAlign: 'center' }}>No permission keys defined in the CRM yet.</Text>
              ) : catalog.map((p) => {
                const on = sel.has(p);
                return (
                  <Pressable key={p} onPress={() => toggle(p)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-3 py-3" style={{ borderRadius: 12, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
                    <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '500' }}>{p}</Text>
                    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Check size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="px-4">
              <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save permissions'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
