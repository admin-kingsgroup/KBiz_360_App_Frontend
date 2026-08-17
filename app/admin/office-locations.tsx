import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ChevronLeft, MapPin, Crosshair, Check, ChevronDown, Search, Star, Trash2, Users, X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import {
  getAdminOffices, getOfficeAssignments, createOffice, updateOffice, deleteOffice, setDefaultOffice, assignUserOffice,
  type AdminBranchOffices, type AdminOfficeEntry,
} from '../../src/api/attendance';
import { refreshDirectoryUsers } from '../../src/store/directoryStore';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { syncAttendanceGeofencing } from '../../src/services/backgroundAttendance';
import { ApiError } from '../../src/api/client';

type Form = { officeId: string | null; branchId: string; label: string; lat: string; lng: string; radius: string; address: string; wifiSsid: string };

// Admin → Office locations. Each branch can hold MULTIPLE offices (e.g. Bombay HQ + Operational). One
// office is the branch DEFAULT (unassigned staff report there); specific people can be LOCKED to a
// particular office via "Assign staff". Stored in kb360_app (CRM is read-only). Manager-only.
export default function OfficeLocations() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const users = useAccessStore((s) => s.users);
  const [rows, setRows] = useState<AdminBranchOffices[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // userId → officeId
  const [loading, setLoading] = useState(true);
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [assignFor, setAssignFor] = useState<{ office: AdminOfficeEntry; branchId: string } | null>(null);
  const [assignQuery, setAssignQuery] = useState('');

  const load = (): void => {
    Promise.all([getAdminOffices().then(setRows), getOfficeAssignments().then(setAssignments)])
      .catch(() => undefined).finally(() => setLoading(false));
  };
  // Reload on every focus (not just mount), and keep the shared user directory fresh for the
  // "Assign staff" picker (new / renamed users show without an app restart).
  useRefreshOnFocus(() => { load(); void refreshDirectoryUsers(); });

  const startNew = (branchId: string): void => setForm({ officeId: null, branchId, label: '', lat: '', lng: '', radius: '100', address: '', wifiSsid: '' });
  const startEdit = (o: AdminOfficeEntry, branchId: string): void =>
    setForm({ officeId: o.id, branchId, label: o.label ?? '', lat: String(o.lat), lng: String(o.lng), radius: String(o.radius ?? 100), address: o.address ?? '', wifiSsid: o.wifiSsid ?? '' });

  const geocode = async (): Promise<void> => {
    if (!form) return;
    const q = form.address.trim();
    if (!q) { showToast('Type an address first'); return; }
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(q);
      if (!results.length) { showToast('Address not found — add city / country and retry'); return; }
      const { latitude, longitude } = results[0];
      setForm((f) => (f ? { ...f, lat: latitude.toFixed(6), lng: longitude.toFixed(6) } : f));
      showToast('Coordinates filled from address');
    } catch { showToast('Could not look up that address'); } finally { setGeocoding(false); }
  };

  const useMyLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { showToast('Location permission denied'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setForm((f) => (f ? { ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) } : f));
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        if (place) {
          const line = [place.name, place.street, place.city, place.region, place.country].filter(Boolean).join(', ');
          if (line) setForm((f) => (f && !f.address.trim() ? { ...f, address: line } : f));
        }
      } catch { /* reverse geocode optional */ }
      showToast('Filled in your current location');
    } catch { showToast('Could not get current location'); } finally { setLocating(false); }
  };

  const saveForm = async (): Promise<void> => {
    if (!form) return;
    const lat = Number(form.lat), lng = Number(form.lng), radius = Number(form.radius);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) { showToast('Set a valid location (use Find or current location)'); return; }
    if (!Number.isFinite(radius) || radius < 20) { showToast('Radius must be at least 20 m'); return; }
    setSaving(true);
    try {
      const label = form.label.trim() || null;
      const address = form.address.trim() || null;
      const wifiSsid = form.wifiSsid.trim() || null;
      if (form.officeId) await updateOffice(form.officeId, { lat, lng, radius, label, address, wifiSsid });
      else await createOffice({ branchId: form.branchId, lat, lng, radius, label, address, wifiSsid });
      showToast('Office saved');
      startNew(form.branchId); // form stays available for the next office (no add button anymore)
      load();
      void syncAttendanceGeofencing();
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not save'); } finally { setSaving(false); }
  };

  const makeDefault = async (officeId: string): Promise<void> => {
    try { await setDefaultOffice(officeId); showToast('Set as branch default'); load(); }
    catch { showToast('Could not set default'); }
  };

  const removeOffice = (o: AdminOfficeEntry): void => Alert.alert('Delete office', `Delete "${o.label || 'this office'}"? Staff assigned to it will fall back to the branch default.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void deleteOffice(o.id).then(() => { showToast('Office deleted'); load(); void syncAttendanceGeofencing(); }).catch(() => showToast('Could not delete')); } },
  ]);

  // Lock / unlock a user to the office being assigned.
  const toggleAssign = (userId: string): void => {
    if (!assignFor) return;
    const officeId = assignFor.office.id;
    const isOn = assignments[userId] === officeId;
    const next = isOn ? null : officeId;
    setAssignments((a) => { const n = { ...a }; if (next) n[userId] = next; else delete n[userId]; return n; });
    assignUserOffice(userId, next)
      .then(() => { void syncAttendanceGeofencing(); getOfficeAssignments().then(setAssignments).catch(() => undefined); }) // re-sync from the server
      .catch(() => { showToast('Could not update'); load(); });
  };

  const assignCandidates = assignFor
    ? users.filter((u) => (u.branches ?? []).includes(assignFor.branchId) && u.name.toLowerCase().includes(assignQuery.trim().toLowerCase()))
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      {/* Standard white header */}
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Office locations</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{loading ? 'Loading…' : `${rows.length} branches`}</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, padding: 14, gap: 10 }}>
          <Text style={{ color: colors.coolText, fontSize: 12.5, lineHeight: 18, marginBottom: 2, paddingHorizontal: 2 }}>
            A branch can have several offices (e.g. HQ + Operational). Mark one as ★ default — staff with no specific office report there. Use “Assign staff” to lock specific people to an office.
          </Text>
          {rows.map((b) => {
            const isOpen = openBranch === b.branchId;
            return (
              <View key={b.branchId} style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: isOpen ? colors.primary + '55' : colors.coolDivider, overflow: 'hidden' }}>
                <Pressable onPress={() => { if (isOpen) { setOpenBranch(null); setForm(null); } else { setOpenBranch(b.branchId); startNew(b.branchId); } }} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3">
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: b.offices.length ? colors.primarySoft : colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={20} color={b.offices.length ? colors.primary : colors.coolText} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{b.code || b.name || 'Branch'}</Text>
                    <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>
                      {b.offices.length ? `${b.offices.length} office${b.offices.length > 1 ? 's' : ''}` : 'No office set'}{b.city ? ` · ${b.city}` : ''}
                    </Text>
                  </View>
                  <ChevronDown size={18} color={colors.coolText3} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                </Pressable>

                {isOpen ? (
                  <View className="px-3 pb-3" style={{ borderTopColor: colors.coolDivider, borderTopWidth: 1, paddingTop: 10, gap: 8 }}>
                    {/* Existing offices */}
                    {b.offices.map((o) => (
                      <View key={o.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, padding: 10, backgroundColor: colors.coolBg }}>
                        <View className="flex-row items-center gap-2">
                          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                            {o.label || 'Office'}{o.isDefault ? '  ★' : ''}
                          </Text>
                          <Pressable onPress={() => setAssignFor({ office: o, branchId: b.branchId })} hitSlop={6} style={{ padding: 4 }}><Users size={18} color={colors.primary} /></Pressable>
                          {!o.isDefault ? <Pressable onPress={() => makeDefault(o.id)} hitSlop={6} style={{ padding: 4 }}><Star size={17} color={colors.coolText3} /></Pressable> : null}
                          <Pressable onPress={() => removeOffice(o)} hitSlop={6} style={{ padding: 4 }}><Trash2 size={16} color={colors.danger} /></Pressable>
                        </View>
                        <Pressable onPress={() => startEdit(o, b.branchId)}>
                          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>
                            {(o.address || `${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}`)} · {o.radius} m{o.wifiSsid ? ` · Wi-Fi: ${o.wifiSsid}` : ''} · tap to edit
                          </Text>
                        </Pressable>
                      </View>
                    ))}

                    {/* Add / edit form */}
                    {form && form.branchId === b.branchId ? (
                      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.primary + '40', padding: 10, gap: 8 }}>
                        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{form.officeId ? 'Edit office' : 'New office'}</Text>
                        <TextInput value={form.label} onChangeText={(t) => setForm((f) => (f ? { ...f, label: t } : f))} placeholder="Office name (e.g. Head Quarter / Operational)" placeholderTextColor={colors.coolText3}
                          style={inp} />
                        <View className="flex-row gap-2">
                          <TextInput value={form.address} onChangeText={(t) => setForm((f) => (f ? { ...f, address: t } : f))} placeholder="Street address, city, country" placeholderTextColor={colors.coolText3}
                            onSubmitEditing={geocode} returnKeyType="search"
                            style={[inp, { flex: 1 }]} />
                          <Pressable onPress={geocode} disabled={geocoding} className="flex-row items-center justify-center gap-1.5" style={{ paddingHorizontal: 16, borderRadius: 12, backgroundColor: geocoding ? colors.primaryDark : colors.primary }}>
                            <Search size={15} color="#fff" /><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{geocoding ? '…' : 'Find'}</Text>
                          </Pressable>
                        </View>
                        <Pressable onPress={useMyLocation} disabled={locating} className="flex-row items-center justify-center gap-2" style={{ paddingVertical: 11, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary }}>
                          <Crosshair size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{locating ? 'Getting location…' : 'Use my current location'}</Text>
                        </Pressable>
                        <View className="flex-row gap-2">
                          <Field label="Latitude" value={form.lat} onChange={(t) => setForm((f) => (f ? { ...f, lat: t } : f))} placeholder="19.0760" />
                          <Field label="Longitude" value={form.lng} onChange={(t) => setForm((f) => (f ? { ...f, lng: t } : f))} placeholder="72.8777" />
                          <Field label="Radius (m)" value={form.radius} onChange={(t) => setForm((f) => (f ? { ...f, radius: t } : f))} placeholder="100" />
                        </View>
                        <TextInput value={form.wifiSsid} onChangeText={(t) => setForm((f) => (f ? { ...f, wifiSsid: t } : f))} placeholder="Office Wi-Fi name (SSID) — exact, optional" placeholderTextColor={colors.coolText3}
                          autoCapitalize="none" autoCorrect={false}
                          style={inp} />
                        <Text style={{ color: colors.coolText, fontSize: 11, marginTop: -4 }}>Staff on this Wi-Fi network count as present even if GPS is off by a few meters.</Text>
                        <View className="flex-row gap-2">
                          <Pressable onPress={() => startNew(b.branchId)} className="flex-1 items-center" style={{ paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.coolDivider }}>
                            <Text style={{ color: colors.coolText, fontSize: 13.5, fontWeight: '700' }}>{form.officeId ? 'Cancel' : 'Clear'}</Text>
                          </Pressable>
                          <Pressable onPress={saveForm} disabled={saving} className="flex-row flex-1 items-center justify-center gap-1.5" style={{ paddingVertical: 12, borderRadius: 999, backgroundColor: colors.primary }}>
                            <Check size={16} color="#fff" /><Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save office'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {rows.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.coolText, fontSize: 14 }}>No branches in your scope</Text></View>
          ) : null}
        </ScrollView>
      )}

      {/* Assign staff to an office */}
      <Modal visible={!!assignFor} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setAssignFor(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setAssignFor(null)} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, height: '80%', paddingBottom: 12 }}>
            <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Assign to {assignFor?.office.label || 'office'}</Text>
                <Text style={{ color: colors.coolText, fontSize: 12 }}>Tap to lock a person to this office</Text>
              </View>
              <Pressable onPress={() => setAssignFor(null)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <View className="flex-row items-center gap-2 mx-4 my-2" style={{ backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
              <Search size={17} color={colors.coolText3} />
              <TextInput value={assignQuery} onChangeText={setAssignQuery} placeholder="Search people in this branch" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: colors.ink }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {assignCandidates.length === 0 ? (
                <Text style={{ color: colors.coolText, fontSize: 13, padding: 16, textAlign: 'center' }}>No people in this branch</Text>
              ) : null}
              {assignCandidates.map((u) => {
                const here = assignments[u.id] === assignFor?.office.id;
                const elsewhere = !here && !!assignments[u.id];
                return (
                  <Pressable key={u.id} onPress={() => toggleAssign(u.id)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-2 py-2.5" style={{ borderRadius: 12, backgroundColor: here ? colors.primarySoft : 'transparent' }}>
                    <Avatar initials={u.initials} color={u.color} size={40} />
                    <View className="flex-1">
                      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{u.name}</Text>
                      {elsewhere ? <Text style={{ color: colors.coolText, fontSize: 11 }}>Assigned to another office</Text> : null}
                    </View>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: here ? colors.primary : colors.coolDivider, backgroundColor: here ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {here ? <Check size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const inp = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink } as const;

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (t: string) => void; placeholder: string }) {
  return (
    <View className="flex-1">
      <Text style={{ color: colors.coolText, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>{label.toUpperCase()}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.coolText3}
        keyboardType="numbers-and-punctuation"
        style={inp} />
    </View>
  );
}
