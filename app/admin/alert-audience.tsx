import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { groupById, groupForChannel } from '../../src/data/pulse';
import { adminApi } from '../../src/api';
import type { AlertAudience, AlertAudienceRow } from '../../src/api/admin';
import { ApiError } from '../../src/api/client';
import { humanizeRole } from '../../src/api/directory';
import { useUiStore } from '../../src/store/uiStore';

// "Who sees this" (super-admin) — opened from an alert group's screen. One branch's channel at a
// time (chips switch branch): everyone in that branch or hub who can sign in, and a switch where a
// switch decides it. The same stored grant as Team & Users 🔔, seen from the alert's side (owner,
// 2026-09-28: "give an option so that I can decide which alert is visible to which user").
export default function AlertAudienceScreen() {
  const router = useRouter();
  const { group: groupId, pick } = useLocalSearchParams<{ group: string; pick?: string }>();
  const group = groupById(groupId ?? '') ?? groupForChannel(groupId ?? '');
  const channels = group?.channels ?? [];
  const [channelId, setChannelId] = useState<string>(channels.some((c) => c.id === pick) ? (pick as string) : (channels[0]?.id ?? ''));
  const [data, setData] = useState<AlertAudience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const showToast = useUiStore((s) => s.showToast);
  // The branch last asked for — a slower answer for a chip tapped earlier must not overwrite it.
  const wanted = useRef('');

  const load = useCallback((id: string) => {
    if (!id) return;
    wanted.current = id;
    setLoading(true);
    setError('');
    adminApi.getAlertAudience(id)
      .then((d) => { if (wanted.current === id) setData(d); })
      .catch((e) => { if (wanted.current === id) setError(e instanceof ApiError ? e.message : 'Could not load who sees this alert'); })
      .finally(() => { if (wanted.current === id) setLoading(false); });
  }, []);
  useEffect(() => { load(channelId); }, [channelId, load]);

  // Optimistic flip; the server's refusal (not in the branch / no ERP access) reverts it.
  const toggle = (row: AlertAudienceRow, on: boolean): void => {
    const set = (why: AlertAudienceRow['why']) =>
      setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, why } : r)) } : d));
    set(on ? 'on' : 'off');
    adminApi.setAlertAudience(channelId, row.id, on)
      .then(() => showToast(on ? `${row.name} will get these alerts` : `${row.name} won't get these alerts`))
      .catch((e) => { set(row.why); showToast(e instanceof ApiError ? e.message : 'Could not update'); });
  };

  const rows = data?.rows ?? [];
  const supers = rows.filter((r) => r.why === 'super');
  const people = rows.filter((r) => r.why !== 'super' && r.why !== 'no-erp');
  const noErp = rows.filter((r) => r.why === 'no-erp');
  const ch = data?.channel;
  const onCount = people.filter((r) => r.why === 'on' || r.why === 'branch').length;
  const rule = !ch ? '' : ch.branchWide
    ? `Everyone in ${ch.branchCode} gets these alerts — there is nothing to switch.`
    : ch.needsErp
      ? `Only people with access to ${ch.branchCode} and ERP access can get these. Switch on who should.`
      : `Only people with access to ${ch.branchCode} can get these. Switch on who should.`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Who sees this</Text>
          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{ch?.name ?? group?.name ?? 'Alert'}</Text>
        </View>
      </View>

      {channels.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}
          contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }}>
          {channels.map((c) => {
            const on = c.id === channelId;
            return (
              <Pressable key={c.id} onPress={() => setChannelId(c.id)}
                style={{ height: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider }}>
                <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{c.branch || c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loading && !data ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: colors.coolText, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={() => load(channelId)} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 14 }} style={{ opacity: loading ? 0.6 : 1 }}>
          <Text style={{ color: colors.coolText, fontSize: 13 }}>{rule}</Text>

          <Section title={`IN ${ch?.branchCode ?? ''} · ${onCount} OF ${people.length} GET THEM`}>
            {people.length === 0 ? <Empty text="Nobody in this branch can sign in to the app." /> : null}
            {people.map((r, i) => (
              <Row key={r.id} row={r} first={i === 0}
                right={r.canToggle
                  ? <Switch value={r.why === 'on'} disabled={loading} onValueChange={(v) => toggle(r, v)} trackColor={{ true: colors.primary, false: colors.coolDivider }} />
                  : <Tag text="Branch" />} />
            ))}
          </Section>

          {noErp.length ? (
            <Section title={`NO ERP ACCESS · ${noErp.length}`}>
              <Text style={{ color: colors.coolText3, fontSize: 12, paddingHorizontal: 14, paddingTop: 10 }}>
                They never get ERP alerts. Give them ERP access in KBiz Books (Settings → Users &amp; Roles → App Access) first.
              </Text>
              {noErp.map((r, i) => <Row key={r.id} row={r} first={i === 0} dim right={<Tag text="No ERP" />} />)}
            </Section>
          ) : null}

          <Section title={`SUPER-ADMINS · ALWAYS SEE EVERY ALERT · ${supers.length}`}>
            {supers.map((r, i) => <Row key={r.id} row={r} first={i === 0} right={<Tag text="Always" />} />)}
          </Section>

          <Text style={{ color: colors.coolText3, fontSize: 11 }}>
            Only people who can sign in to the app are listed. Changes apply instantly on their phone.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={{ color: colors.coolText3, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1, paddingHorizontal: 4, paddingBottom: 6 }}>{title}</Text>
      <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Row({ row, first, right, dim }: { row: AlertAudienceRow; first: boolean; right: ReactNode; dim?: boolean }) {
  return (
    <View className="flex-row items-center gap-3"
      style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.coolDivider, opacity: dim ? 0.55 : 1 }}>
      <View className="flex-1">
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{row.name}</Text>
        <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>{humanizeRole(row.role)} · {row.email}</Text>
      </View>
      {right}
    </View>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.coolMuted }}>
      <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={{ color: colors.coolText3, fontSize: 13, padding: 14 }}>{text}</Text>;
}
