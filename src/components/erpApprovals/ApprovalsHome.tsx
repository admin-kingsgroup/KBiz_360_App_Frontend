import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Eye, FileText, Flag, Inbox, Info, LayoutList, MapPin, Settings2, Users, Wallet } from 'lucide-react-native';
import { AnchoredMenu, MenuHeading, anchorOfPress, type AnchorRect } from '../ui/AnchoredMenu';
import { PickChip, PickRow, PickTile } from '../home/PickMenu';
import { ALL_BRANCHES } from '../../logic/erpApprovals';
import { homeRowLabel, splitHome, type HomeKey, type HomeRow } from '../../logic/erpApprovalHome';
import { colors, type ChatListPalette } from '../../theme';
import { textStyles } from '../../theme/typography';

// The Approvals home and the frame around a section (owner, 2026-11-19: "a lot of extra stuff"). One list of the ERP's
// sections replaces the branch chips, the tab strip and the "Waiting on me" doors; a section opens with a back button; the
// branch is one dropdown, as on the Groups view (PickMenu); the ERP's rule text sits behind "How approval works here".

// The Groups view's dropdown parts, in this screen's plain colours.
const PAL: ChatListPalette = {
  dark: false, bar: colors.card, line: colors.coolDivider, text: colors.ink, mute: colors.coolText, field: colors.coolMuted, list: colors.card, rowUnread: colors.card,
  selected: colors.primarySoft, divider: colors.coolDivider, unreadTime: colors.primary, accent: colors.primary, onAccent: '#fff',
};
const ICON: Record<HomeKey, ComponentType<{ size?: number; color?: string }>> = {
  entries: FileText, pay: Wallet, hr: Users, setup: Settings2, close: CalendarCheck, status: LayoutList, rr: Flag, review: Eye, app: Inbox,
};

/** The screen's top row: its name — or, inside a section, a back button and the section's name — and the branch dropdown. */
export function ApprovalsHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  // A pressed flag, not a style function: this app's Pressable drops style functions. Back removes the button before its
  // release is reported, so the press itself clears the flag — or the next section would open with the button still grey.
  const [down, setDown] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, paddingLeft: onBack ? 4 : 16, paddingRight: 16, paddingTop: 8, paddingBottom: 4, backgroundColor: colors.card }}>
      {onBack ? (
        <Pressable onPress={() => { setDown(false); onBack(); }} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} accessibilityRole="button" accessibilityLabel="Back to Approvals"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: down ? colors.coolMuted : 'transparent' }}>
          <ChevronLeft size={26} color={colors.primary} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: colors.ink, ...textStyles.title2, fontWeight: '800' }}>{title}</Text>
      {right}
    </View>
  );
}

/** Which branch's approvals show: one dropdown instead of a row of chips. Each choice says how much waits there. */
export function BranchPicker({ options, value, counts, onPick }: { options: string[]; value: string; counts: Record<string, number> | null; onPick: (branch: string) => void }) {
  const [at, setAt] = useState<AnchorRect | null>(null);
  if (options.length < 2) return null;
  const name = (b: string) => (b === ALL_BRANCHES ? 'All branches' : b);
  const n = (b: string) => counts?.[b] ?? 0;
  const waits = (b: string) => (counts ? (n(b) ? `${n(b)} waiting` : 'Nothing waiting') : '');
  // A dot when a single branch is picked and another one has work: narrowing the list never hides it.
  const elsewhere = value !== ALL_BRANCHES && options.some((b) => b !== value && b !== ALL_BRANCHES && n(b) > 0);
  return (
    <>
      <PickChip pal={PAL} Icon={MapPin} label={name(value)} dot={elsewhere} a11y={`Branch: ${name(value)}${elsewhere ? ', more waiting in other branches' : ''}. Change branch`}
        onPress={(e) => { void anchorOfPress(e).then(setAt); }} />
      <AnchoredMenu anchor={at} onClose={() => setAt(null)} width={300} background={colors.card} border={colors.coolDivider} label="Show approvals from">
        <MenuHeading color={colors.coolText}>Show approvals from</MenuHeading>
        <ScrollView style={{ flexGrow: 0 }} bounces={false}>
          {options.map((b, i) => (
            <PickRow key={b} pal={PAL} index={i} animate={!!at} on={b === value} tile={b === ALL_BRANCHES ? <PickTile pal={PAL} /> : <PickTile pal={PAL} code={b} />}
              title={name(b)} sub={waits(b)} unread={0} a11y={[name(b), waits(b)].filter(Boolean).join(', ')} onPress={() => { onPick(b); setAt(null); }} />
          ))}
        </ScrollView>
      </AnchoredMenu>
    </>
  );
}

function Row({ row, last, onOpen }: { row: HomeRow; last: boolean; onOpen: () => void }) {
  const [down, setDown] = useState(false);
  const Icon = ICON[row.key];
  const forMe = row.mine > 0;
  return (
    <Pressable onPress={onOpen} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} accessibilityRole="button" accessibilityLabel={homeRowLabel(row)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingLeft: 12, backgroundColor: down ? colors.coolMuted : colors.card }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: forMe ? colors.primarySoft : colors.coolMuted }}>
        <Icon size={18} color={forMe ? colors.primary : colors.coolText} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingRight: 12, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.coolDivider }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, ...textStyles.headline }}>{row.title}</Text>
          <Text numberOfLines={1} style={{ color: colors.coolText, ...textStyles.footnote, marginTop: 1 }}>{row.hint}</Text>
        </View>
        {forMe ? (
          <View style={{ minWidth: 28, minHeight: 24, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', ...textStyles.footnote, fontWeight: '700' }}>{row.mine > 99 ? '99+' : row.mine}</Text>
          </View>
        ) : row.waiting ? (
          <Text style={{ color: colors.coolText, ...textStyles.subheadline, fontWeight: '600' }}>{row.waiting > 99 ? '99+' : row.waiting}</Text>
        ) : null}
        <ChevronRight size={18} color={colors.coolText3} />
      </View>
    </Pressable>
  );
}

function Group({ rows, onOpen }: { rows: HomeRow[]; onOpen: (key: HomeKey) => void }) {
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.card, overflow: 'hidden' }}>
      {rows.map((r, i) => <Row key={r.key} row={r} last={i === rows.length - 1} onOpen={() => onOpen(r.key)} />)}
    </View>
  );
}

/** The home list: the sections with something at this person's step, then the rest — every section once. */
export function HomeList({ rows, onOpen }: { rows: HomeRow[]; onOpen: (key: HomeKey) => void }) {
  const { needsMe, rest } = splitHome(rows);
  return (
    <>
      {needsMe.length ? (
        <>
          <Text accessibilityRole="header" style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 8, color: colors.ink, ...textStyles.headline, fontWeight: '700' }}>Needs you</Text>
          <Group rows={needsMe} onOpen={onOpen} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: colors.primarySoft }}>
          <CircleCheck size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, ...textStyles.headline }}>You are all caught up</Text>
            <Text style={{ color: colors.coolText, ...textStyles.footnote, marginTop: 1 }}>Nothing is waiting at your step.</Text>
          </View>
        </View>
      )}
      {rest.length ? (
        <>
          <Text accessibilityRole="header" style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8, color: colors.coolText, ...textStyles.subheadline, fontWeight: '600' }}>{needsMe.length ? 'Everything else' : 'All sections'}</Text>
          <Group rows={rest} onOpen={onOpen} />
        </>
      ) : null}
    </>
  );
}

/** The ERP's rule text for a list (who raises, who signs), one tap away instead of above every list. */
export function About({ label = 'How approval works here', children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 32, marginHorizontal: 16, marginTop: 6 }}>
        <Info size={14} color={colors.coolText} />
        <Text style={{ color: colors.coolText, ...textStyles.footnote, fontWeight: '600' }}>{label}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><ChevronDown size={14} color={colors.coolText} /></View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
