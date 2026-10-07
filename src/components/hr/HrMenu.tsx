import { memo, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Menu, LayoutGrid, Clock, Palmtree, CalendarDays, ReceiptIndianRupee, Check, type LucideIcon } from 'lucide-react-native';
import { colors } from '../../theme';

export type HrPage = 'home' | 'attendance' | 'leave' | 'month' | 'payslip';

interface HrMenuItem { key: HrPage; label: string; sub: string; Icon: LucideIcon; tint: string; href: Href }

// One list for the HR home tiles AND the header menu, so the two can never disagree.
export const HR_PAGES: HrMenuItem[] = [
  { key: 'attendance', label: 'Attendance', sub: 'Check in/out & team status', Icon: Clock, tint: colors.primary, href: '/attendance' },
  { key: 'leave', label: 'Paid leave', sub: 'Balance & leave applications', Icon: Palmtree, tint: colors.teal, href: '/hr/leave' },
  { key: 'month', label: 'My Attendance', sub: 'Month calendar & holiday list', Icon: CalendarDays, tint: colors.blue, href: '/hr/month' },
  { key: 'payslip', label: 'My Payslip', sub: 'Monthly earnings & deductions', Icon: ReceiptIndianRupee, tint: colors.purple, href: '/hr/payslip' },
];

const HOME: HrMenuItem = { key: 'home', label: 'HR home', sub: 'Today at a glance', Icon: LayoutGrid, tint: colors.coolText, href: '/hr' };

// Header menu button shared by every HR screen. Navigation rules:
//  - from HR home, a page is PUSHED, so Back returns to HR home;
//  - from one HR page to another, the page is REPLACED, so the stack stays Profile → HR → page
//    instead of growing with every menu hop;
//  - "HR home" goes back to the HR home already in the stack, or replaces this page with it when
//    the page was opened directly (e.g. from a Profile quick action).
export const HrMenuButton = memo(function HrMenuButton({ current }: { current: HrPage }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const go = (item: HrMenuItem): void => {
    setOpen(false);
    if (item.key === current) return;
    if (item.key === 'home') router.dismissTo('/hr');
    else if (current === 'home') router.push(item.href);
    else router.replace(item.href);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Open HR menu"
        style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}>
        <Menu size={22} color={colors.ink} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} accessibilityLabel="Close menu" style={{ flex: 1, backgroundColor: 'rgba(12,14,20,0.35)' }}>
          <Pressable onPress={() => undefined} style={{ position: 'absolute', top: insets.top + 64, right: 10, width: 280, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.coolDivider, padding: 6, elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}>
            <Text style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>HR MENU</Text>
            <MenuRow item={HOME} active={current === 'home'} onPress={go} />
            <View style={{ height: 1, backgroundColor: colors.coolDivider, marginHorizontal: 12, marginVertical: 4 }} />
            {HR_PAGES.map((it) => <MenuRow key={it.key} item={it} active={current === it.key} onPress={go} />)}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

function MenuRow({ item, active, onPress }: { item: HrMenuItem; active: boolean; onPress: (i: HrMenuItem) => void }) {
  return (
    <Pressable onPress={() => onPress(item)} android_ripple={{ color: colors.coolMuted }} accessibilityRole="menuitem" accessibilityState={{ selected: active }}
      className="flex-row items-center gap-3" style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minHeight: 44, backgroundColor: active ? colors.primarySoft : 'transparent' }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: item.key === 'home' ? colors.coolMuted : `${item.tint}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <item.Icon size={18} color={item.tint} />
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{item.label}</Text>
        <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{item.sub}</Text>
      </View>
      {active ? <Check size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}
