import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, ReceiptIndianRupee } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getMyPayslip, type Payslip } from '../../src/api/hr';

// My Payslip — the person's OWN month, priced with the ERP salary register's exact arithmetic
// (served by the backend): pro-rated earnings for the payable days, PT by the state slab,
// TDS as keyed, staff-loan instalments off the schedule. INDICATIVE until HR pays it — the
// register on the ERP stays the payroll truth.

const rupees = (n: number): string => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const monthLabel = (m: string): string => new Date(`${m}-01T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });
const thisMonth = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (m: string, n: number): string => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function PayslipScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(thisMonth());
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback((m: string): void => {
    setSlip(null); setFailed(false);
    getMyPayslip(m).then(setSlip).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  const canGoNext = month < thisMonth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>My Payslip</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Indicative — HR’s salary register is final</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Month navigator */}
        <View className="flex-row items-center justify-between mb-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 4 }}>
          <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{monthLabel(month)}</Text>
          <Pressable onPress={() => canGoNext && setMonth((m) => shiftMonth(m, 1))} disabled={!canGoNext} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canGoNext ? 1 : 0.25 }}>
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        {failed ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <Text style={{ color: colors.coolText, fontSize: 13, marginBottom: 12 }}>Couldn’t reach the server.</Text>
            <Pressable onPress={() => load(month)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary }}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text></Pressable>
          </View>
        ) : slip === null ? (
          <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.primary} /></View>
        ) : !slip.hasRecord || !slip.structured ? (
          <View className="items-center" style={{ paddingVertical: 48, paddingHorizontal: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><ReceiptIndianRupee size={36} color={colors.primary} /></View>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
              {slip.hasRecord ? 'No salary structure keyed yet' : 'No HR record linked to your login'}
            </Text>
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
              Ask HR to complete your record on the Employee Master — the payslip appears here once the salary is keyed.
            </Text>
          </View>
        ) : (
          <>
            {/* Net pay hero */}
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.primary, marginBottom: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>NET PAY · {monthLabel(slip.month).toUpperCase()}</Text>
              <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 2 }}>{rupees(slip.netPay)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2 }}>
                {slip.employee.name}{slip.employee.empCode ? ` · ${slip.employee.empCode}` : ''} · {slip.employee.branch}{slip.payMode ? ` · paid by ${slip.payMode}` : ''}
              </Text>
            </View>

            {/* Days */}
            <View className="flex-row gap-2 mb-3">
              <Tile n={slip.days.payableDays} label="Payable" color={colors.primary} />
              <Tile n={slip.days.presentDays} label="Present" color={colors.ink} />
              <Tile n={slip.days.leaveDays} label="Paid leave" color={colors.teal} />
              <Tile n={slip.days.lopDays} label="LOP" color={colors.danger} />
            </View>

            {/* Earnings */}
            <Card title="EARNINGS">
              <Row label="Basic + DA" structure={slip.salary.basic} earned={slip.earned.basic} />
              <Row label="HRA" structure={slip.salary.hra} earned={slip.earned.hra} />
              <Row label="Other allowance" structure={slip.salary.otherAllowance} earned={slip.earned.otherAllowance} />
              <Total label="Earned salary" amount={slip.earned.total} note={slip.lopAmount > 0 ? `${rupees(slip.lopAmount)} lost to ${slip.days.lopDays} absent day${slip.days.lopDays === 1 ? '' : 's'}` : 'full month — the structure earned exactly'} />
            </Card>

            {/* Deductions */}
            <Card title="DEDUCTIONS">
              <Row label="Professional Tax" earned={slip.deductions.pt} sub={slip.deductions.ptNote} />
              <Row label="TDS" earned={slip.deductions.tds} />
              {slip.deductions.loanRecovered > 0 || slip.deductions.loanLines.length > 0 ? (
                <Row
                  label="Staff loan recovery"
                  earned={slip.deductions.loanRecovered}
                  sub={slip.deductions.loanLines.map((l) => `${l.reference || l.kind} · instalment ${l.instalmentNo}${l.willClose ? ' (last)' : ''} · ${rupees(l.closing)} left after`).join('\n') || undefined}
                />
              ) : null}
              {slip.deductions.loanShortfall > 0 ? (
                <Text style={{ color: colors.orange, fontSize: 11.5, fontWeight: '600', marginTop: 2 }}>
                  {rupees(slip.deductions.loanShortfall)} of the loan instalment didn’t fit this month — HR will re-phase it.
                </Text>
              ) : null}
              <Total label="Total deductions" amount={slip.deductions.total} />
            </Card>

            {slip.leaveBalance ? (
              <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                Leave balance at month end: {slip.leaveBalance.balance}d
              </Text>
            ) : null}
            <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}>
              Same arithmetic as HR’s salary register, shown for your own record. The register is what actually pays.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Tile = memo(function Tile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 14, alignItems: 'center', backgroundColor: color + '12' }}>
      <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
    </View>
  );
});

const Card = memo(function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 12 }}>
      <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
});

const Row = memo(function Row({ label, structure, earned, sub }: { label: string; structure?: number; earned: number; sub?: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.ink, fontSize: 13.5 }}>{label}{structure != null && structure !== earned ? <Text style={{ color: colors.coolText3, fontSize: 11.5 }}>  (of {rupees(structure)})</Text> : null}</Text>
        <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{rupees(earned)}</Text>
      </View>
      {sub ? <Text style={{ color: colors.coolText, fontSize: 11, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
});

const Total = memo(function Total({ label, amount, note }: { label: string; amount: number; note?: string }) {
  return (
    <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.coolDivider }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{rupees(amount)}</Text>
      </View>
      {note ? <Text style={{ color: colors.coolText, fontSize: 11, marginTop: 1 }}>{note}</Text> : null}
    </View>
  );
});
