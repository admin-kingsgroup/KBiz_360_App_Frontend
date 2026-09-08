import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ClipboardCheck, X } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useUiStore } from '../../src/store/uiStore';
import { ApiError } from '../../src/api/client';
import { getPendingRegularizations, decideRegularization, type Regularization } from '../../src/api/hr';

// SUPER-ADMIN queue: attendance-correction requests waiting for a decision. Approve corrects the
// day through the same evidence-preserving path as the super admin's own time editor (the server
// does it); Reject requires a note that goes back to the requester. Server-gated to super_admin
// (owner rule 2026-09-08 — nobody else may change a recorded time), so this screen only assumes
// the caller reached it through the super-admin entry points.

const fmtT = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'open');
const fmtD = (key: string): string => new Date(key + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export default function RegularizationsScreen() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [rows, setRows] = useState<Regularization[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Regularization | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback((): void => {
    getPendingRegularizations().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = useCallback((r: Regularization, action: 'approve' | 'reject', decisionNote?: string): void => {
    setBusyId(r.id);
    decideRegularization(r.id, action, decisionNote)
      .then(() => {
        showToast(action === 'approve' ? 'Approved — the day was corrected' : 'Rejected — the requester was told');
        setRejecting(null); setNote('');
        load();
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not record the decision'))
      .finally(() => setBusyId(null));
  }, [load, showToast]);

  const confirmApprove = useCallback((r: Regularization): void => {
    Alert.alert('Approve this correction?', `${r.name ?? 'This person'} · ${fmtD(r.date)}\nIn ${fmtT(r.checkInAt)} · Out ${fmtT(r.checkOutAt)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => decide(r, 'approve') },
    ]);
  }, [decide]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Time corrections</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Staff requests — only you can apply them</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {rows === null ? (
          <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
        ) : rows.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 56 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><ClipboardCheck size={36} color={colors.primary} /></View>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>All caught up</Text>
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 4 }}>No regularisation requests are waiting.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((r) => (
              <RequestCard key={r.id} r={r} busy={busyId === r.id} onApprove={confirmApprove} onReject={(x) => { setRejecting(x); setNote(''); }} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Reject-with-note dialog (the note is required — it goes back to the requester). */}
      <Modal visible={!!rejecting} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRejecting(null)}>
        <Pressable onPress={() => setRejecting(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 6 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Reject request</Text>
              <Pressable onPress={() => setRejecting(null)} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={16} color={colors.coolText} /></Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 10 }}>
              {rejecting?.name ?? 'Requester'} · {rejecting ? fmtD(rejecting.date) : ''} — the note goes back to them.
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Why is this refused?"
              placeholderTextColor={colors.coolText3}
              multiline
              maxLength={300}
              autoFocus
              style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, textAlignVertical: 'top', marginBottom: 12 }}
            />
            <Pressable
              disabled={!note.trim() || busyId === rejecting?.id}
              onPress={() => rejecting && decide(rejecting, 'reject', note.trim())}
              style={{ height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: note.trim() ? colors.danger : colors.coolMuted }}>
              <Text style={{ color: note.trim() ? '#fff' : colors.coolText3, fontSize: 14, fontWeight: '700' }}>{busyId === rejecting?.id ? 'Rejecting…' : 'Reject with note'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const RequestCard = memo(function RequestCard({ r, busy, onApprove, onReject }: { r: Regularization; busy: boolean; onApprove: (r: Regularization) => void; onReject: (r: Regularization) => void }) {
  return (
    <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '700' }}>{r.name ?? 'Unknown'}{r.branch ? ` · ${r.branch}` : ''}</Text>
        <Text style={{ color: colors.coolText, fontSize: 11.5 }}>{new Date(r.appliedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</Text>
      </View>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600', marginTop: 4 }}>{fmtD(r.date)} · In {fmtT(r.checkInAt)} · Out {fmtT(r.checkOutAt)}</Text>
      <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 3 }}>{r.reason}</Text>
      <View className="flex-row gap-2" style={{ marginTop: 10 }}>
        <Pressable disabled={busy} onPress={() => onApprove(r)} style={{ flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: busy ? colors.coolMuted : colors.primary }}>
          <Text style={{ color: busy ? colors.coolText3 : '#fff', fontSize: 13, fontWeight: '700' }}>{busy ? 'Working…' : 'Approve'}</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => onReject(r)} style={{ flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.danger + '55', backgroundColor: colors.danger + '0D' }}>
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Reject</Text>
        </Pressable>
      </View>
    </View>
  );
});
