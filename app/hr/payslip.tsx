import { memo, useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, ReceiptIndianRupee } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { HrMenuButton } from '../../src/components/hr/HrMenu';
import { getPayslips, getPayslipLink, type PayslipMonth } from '../../src/api/hr';
import {
  PAYSLIP_EMPTY_TEXT, PAYSLIP_SUBTITLE, paidOnLine, payslipErrorText, payslipNet, payslipTitle, sortPayslipMonths,
} from '../../src/logic/payslip';

// My Payslip (owner, 2026-10-12): "show the SAME payslip as the ERP in the app — and until the
// salary is released don't share that month's payslip". The list is the person's RELEASED months
// (salary paid in full on the ERP), newest first. Tapping one asks for a 15-minute signed link and
// opens Books' own payslip page (the Salary Register's print) in payslip-view. Nothing here prices a
// month — no indicative figures, no month navigator.

export default function PayslipScreen() {
  const router = useRouter();
  const [months, setMonths] = useState<PayslipMonth[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null); // the month whose link is on its way
  const [openError, setOpenError] = useState<{ month: string; text: string } | null>(null);
  const openingRef = useRef(false);

  const load = useCallback((): Promise<void> =>
    getPayslips()
      .then((d) => { setMonths(sortPayslipMonths(d?.months)); setLoadError(null); })
      .catch((e) => setLoadError(payslipErrorText(e))), []);
  // Refetch on focus: a salary paid on the ERP meanwhile shows up when the person comes back.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = useCallback((): void => {
    setRefreshing(true);
    setOpenError(null);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const open = useCallback((m: PayslipMonth): void => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(m.month);
    setOpenError(null);
    getPayslipLink(m.month)
      .then((link) => {
        router.push({
          pathname: '/hr/payslip-view',
          params: { month: m.month, label: payslipTitle({ month: m.month, label: link.label || m.label }), url: link.url, expiresAt: link.expiresAt },
        });
      })
      .catch((e: unknown) => {
        setOpenError({ month: m.month, text: payslipErrorText(e) });
        // Not released (any more) — a payment reversed on the ERP: let the list catch up.
        if ((e as { status?: number })?.status === 403) void load();
      })
      .finally(() => { openingRef.current = false; setOpening(null); });
  }, [router, load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>My Payslip</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{PAYSLIP_SUBTITLE}</Text>
        </View>
        <HrMenuButton current="payslip" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        {months === null ? (
          <View className="items-center" style={{ paddingVertical: 56, paddingHorizontal: 24 }}>
            {loadError ? (
              <>
                <Text style={{ color: colors.coolText, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{loadError}</Text>
                <Pressable onPress={() => { setLoadError(null); void load(); }} accessibilityRole="button"
                  style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text>
                </Pressable>
              </>
            ) : <ActivityIndicator color={colors.primary} />}
          </View>
        ) : months.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 48, paddingHorizontal: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <ReceiptIndianRupee size={36} color={colors.primary} />
            </View>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>No payslip yet</Text>
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{PAYSLIP_EMPTY_TEXT}</Text>
            {loadError ? <Text style={{ color: colors.coral, fontSize: 12, marginTop: 12, textAlign: 'center' }}>{loadError}</Text> : null}
          </View>
        ) : (
          <>
            {loadError ? (
              <Text style={{ color: colors.coral, fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{loadError}</Text>
            ) : null}
            <View style={{ gap: 8 }}>
              {months.map((m) => (
                <MonthRow key={m.month} m={m} opening={opening === m.month} busy={opening !== null}
                  error={openError?.month === m.month ? openError.text : ''} onOpen={open} />
              ))}
            </View>
            <Text style={{ color: colors.coolText, fontSize: 11.5, textAlign: 'center', marginTop: 14, paddingHorizontal: 16 }}>
              Tap a month to open the payslip HR issued. A month appears once its salary is paid.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const MonthRow = memo(function MonthRow({ m, opening, busy, error, onOpen }: {
  m: PayslipMonth; opening: boolean; busy: boolean; error: string; onOpen: (m: PayslipMonth) => void;
}) {
  const title = payslipTitle(m);
  const net = payslipNet(m.net, m.currency);
  return (
    <Pressable onPress={() => onOpen(m)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${title} payslip, net ${net}`}
      android_ripple={{ color: colors.coolMuted }}
      style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: error ? colors.coral + '66' : colors.coolDivider, opacity: busy && !opening ? 0.6 : 1 }}>
      <View className="flex-row items-center gap-3">
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.purple + '1A', alignItems: 'center', justifyContent: 'center' }}>
          <ReceiptIndianRupee size={20} color={colors.purple} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{paidOnLine(m.paidOn)}</Text>
          {m.vno ? <Text numberOfLines={1} style={{ color: colors.coolText3, fontSize: 10.5, marginTop: 1 }}>{m.vno}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.coolText3, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 }}>NET PAY</Text>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{net}</Text>
        </View>
        <View style={{ width: 20, alignItems: 'center' }}>
          {opening ? <ActivityIndicator size="small" color={colors.primary} /> : <ChevronRight size={18} color={colors.coolText3} />}
        </View>
      </View>
      {error ? <Text style={{ color: colors.coral, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
    </Pressable>
  );
});
