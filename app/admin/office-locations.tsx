import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ChevronLeft, MapPin, Crosshair, Check, ChevronDown, Search, Star, Trash2, Users, X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors, shadowSm } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import {
  getAdminOffices, getOfficeAssignments, createOffice, updateOffice, deleteOffice, setDefaultOffice, assignUserOffice,
  type AdminBranchOffices, type AdminOfficeEntry,
} from '../../src/api/attendance';
import { listUsers, toUser } from '../../src/api/directory';
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
  useEffect(() => {
    load();
    if (users.length === 0) listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = (branchId: string): void => setForm({ officeId: null, branchId, label: '', lat: '', lng: '', radius: '150', address: '', wifiSsid: '' });
  const startEdit = (o: AdminOfficeEntry, branchId: string): void =>
    setForm({ officeId: o.id, branchId, label: o.label ?? '', lat: String(o.lat), lng: String(o.lng), radius: String(o.radius ?? 150), address: o.address ?? '', wifiSsid: o.wifiSsid ?? '' });

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
    assignUserOffice(userId, next).then(() => void syncAttendanceGeofencing()).catch(() => { showToast('Could not update'); load(); });
  };

  const assignCandidates = assignFor
    ? users.filter((u) => (u.branches ?? []).includes(assignFor.branchId) && u.name.toLowerCase().includes(assignQuery.trim().toLowerCase()))
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Office locations</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{loading ? 'Loading…' : `${rows.length} branches`}</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          <Text style={{ color: colors.warmMute, fontSize: 11.5, lineHeight: 17, marginBottom: 2, paddingHorizontal: 2 }}>
            A branch can have several offices (e.g. HQ + Operational). Mark one as ★ default — staff with no specific office report there. Use “Assign staff” to lock specific people to an office.
          </Text>
          {rows.map((b) => {
            const isOpen = openBranch === b.branchId;
            return (
              <View key={b.branchId} style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: isOpen ? colors.ink + '55' : colors.cardEdge, ...shadowSm, overflow: 'hidden' }}>
                <Pressable onPress={() => { if (isOpen) { setOpenBranch(null); setForm(null); } else { setOpenBranch(b.branchId); startNew(b.branchId); } }} className="flex-row items-center gap-3 p-3">
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: (b.offices.length ? colors.success : colors.warmMute) + '1A', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={18} color={b.offices.length ? colors.success : colors.warmMute} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{b.code || b.name || 'Branch'}</Text>
                    <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>
                      {b.offices.length ? `${b.offices.length} office${b.offices.length > 1 ? 's' : ''}` : 'No office set'}{b.city ? ` · ${b.city}` : ''}
                    </Text>
                  </View>
                  <ChevronDown size={16} color={colors.textMuted} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                </Pressable>

                {isOpen ? (
                  <View className="px-3 pb-3" style={{ borderTopColor: colors.cardEdge, borderTopWidth: 1, paddingTop: 10, gap: 8 }}>
                    {/* Existing offices */}
                    {b.offices.map((o) => (
                      <View key={o.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.cardEdge, padding: 10, backgroundColor: '#fff' }}>
                        <View className="flex-row items-center gap-2">
                          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                            {o.label || 'Office'}{o.isDefault ? '  ★' : ''}
                          </Text>
                          <Pressable onPress={() => setAssignFor({ office: o, branchId: b.branchId })} hitSlop={6} style={{ padding: 4 }}><Users size={16} color={colors.blue} /></Pressable>
                          {!o.isDefault ? <Pressable onPress={() => makeDefault(o.id)} hitSlop={6} style={{ padding: 4 }}><Star size={16} color={colors.warmMute} /></Pressable> : null}
                          <Pressable onPress={() => removeOffice(o)} hitSlop={6} style={{ padding: 4 }}><Trash2 size={15} color={colors.danger} /></Pressable>
                        </View>
                        <Pressable onPress={() => startEdit(o, b.branchId)}>
                          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>
                            {(o.address || `${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}`)} · {o.radius} m{o.wifiSsid ? ` · Wi-Fi: ${o.wifiSsid}` : ''} · tap to edit
                          </Text>
                        </Pressable>
                      </View>
                    ))}

                    {/* Add / edit form */}
                    {form && form.branchId === b.branchId ? (
                      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.ink + '40', padding: 10, gap: 8 }}>
                        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>{form.officeId ? 'Edit office' : 'New office'}</Text>
                        <TextInput value={form.label} onChangeText={(t) => setForm((f) => (f ? { ...f, label: t } : f))} placeholder="Office name (e.g. Head Quarter / Operational)" placeholderTextColor={colors.textMuted2}
                          style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.ink, backgroundColor: '#fff' }} />
                        <View className="flex-row gap-2">
                          <TextInput value={form.address} onChangeText={(t) => setForm((f) => (f ? { ...f, address: t } : f))} placeholder="Street address, city, country" placeholderTextColor={colors.textMuted2}
                            onSubmitEditing={geocode} returnKeyType="search"
                            style={{ flex: 1, borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.ink, backgroundColor: '#fff' }} />
                          <Pressable onPress={geocode} disabled={geocoding} className="flex-row items-center justify-center gap-1.5" style={{ paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.success, backgroundColor: geocoding ? colors.success : '#fff' }}>
                            <Search size={14} color={geocoding ? '#fff' : colors.success} /><Text style={{ color: geocoding ? '#fff' : colors.success, fontSize: 12, fontWeight: '800' }}>{geocoding ? '…' : 'Find'}</Text>
                          </Pressable>
                        </View>
                        <Pressable onPress={useMyLocation} disabled={locating} className="flex-row items-center justify-center gap-2" style={{ paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.blue }}>
                          <Crosshair size={14} color={colors.blue} /><Text style={{ color: colors.blue, fontSize: 12, fontWeight: '800' }}>{locating ? 'Getting location…' : 'Use my current location'}</Text>
                        </Pressable>
                        <View className="flex-row gap-2">
                          <Field label="Latitude" value={form.lat} onChange={(t) => setForm((f) => (f ? { ...f, lat: t } : f))} placeholder="19.0760" />
                          <Field label="Longitude" value={form.lng} onChange={(t) => setForm((f) => (f ? { ...f, lng: t } : f))} placeholder="72.8777" />
                          <Field label="Radius (m)" value={form.radius} onChange={(t) => setForm((f) => (f ? { ...f, radius: t } : f))} placeholder="150" />
                        </View>
                        <TextInput value={form.wifiSsid} onChangeText={(t) => setForm((f) => (f ? { ...f, wifiSsid: t } : f))} placeholder="Office Wi-Fi name (SSID) — exact, optional" placeholderTextColor={colors.textMuted2}
                          autoCapitalize="none" autoCorrect={false}
                          style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.ink, backgroundColor: '#fff' }} />
                        <Text style={{ color: colors.warmMute, fontSize: 10, marginTop: -4 }}>Staff on this Wi-Fi network count as present even if GPS is off by a few meters.</Text>
                        <View className="flex-row gap-2">
                          <Pressable onPress={() => startNew(b.branchId)} className="flex-1 items-center" style={{ paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.cardEdge }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '800' }}>{form.officeId ? 'Cancel' : 'Clear'}</Text>
                          </Pressable>
                          <Pressable onPress={saveForm} disabled={saving} className="flex-row flex-1 items-center justify-center gap-1.5" style={{ paddingVertical: 11, borderRadius: 12, backgroundColor: colors.ink }}>
                            <Check size={15} color="#fff" /><Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>{saving ? 'Saving…' : 'Save office'}</Text>
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
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.textMuted, fontSize: 13 }}>No branches in your scope</Text></View>
          ) : null}
        </ScrollView>
      )}

      {/* Assign staff to an office */}
      <Modal visible={!!assignFor} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setAssignFor(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setAssignFor(null)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, height: '80%', paddingBottom: 12 }}>
            <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>Assign to {assignFor?.office.label || 'office'}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Tap to lock a person to this office</Text>
              </View>
              <Pressable onPress={() => setAssignFor(null)}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <View className="flex-row items-center gap-2 mx-4 my-2" style={{ backgroundColor: colors.canvas, borderRadius: 10, paddingHorizontal: 10 }}>
              <Search size={14} color={colors.textMuted} />
              <TextInput value={assignQuery} onChangeText={setAssignQuery} placeholder="Search people in this branch" placeholderTextColor={colors.textMuted} style={{ flex: 1, paddingVertical: 8, fontSize: 13, color: colors.ink }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {assignCandidates.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, padding: 16, textAlign: 'center' }}>No people in this branch</Text>
              ) : null}
              {assignCandidates.map((u) => {
                const here = assignments[u.id] === assignFor?.office.id;
                const elsewhere = !here && !!assignments[u.id];
                return (
                  <Pressable key={u.id} onPress={() => toggleAssign(u.id)} className="flex-row items-center gap-3 px-2 py-2.5" style={{ borderRadius: 12, backgroundColor: here ? colors.ink + '0D' : 'transparent' }}>
                    <Avatar initials={u.initials} color={u.color} size={34} />
                    <View className="flex-1">
                      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{u.name}</Text>
                      {elsewhere ? <Text style={{ color: colors.warmMute, fontSize: 10 }}>Assigned to another office</Text> : null}
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: here ? colors.ink : colors.cardEdge, backgroundColor: here ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {here ? <Check size={13} color="#fff" /> : null}
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (t: string) => void; placeholder: string }) {
  return (
    <View className="flex-1">
      <Text style={{ color: colors.warmMute, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>{label.toUpperCase()}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted2}
        keyboardType="numbers-and-punctuation"
        style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.ink, backgroundColor: '#fff' }} />
    </View>
  );
}
