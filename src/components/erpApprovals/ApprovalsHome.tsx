import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { CalendarCheck, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Eye, FileText, Flag, Inbox, Info, LayoutGrid, LayoutList, MapPin, Settings2, Users, Wallet } from 'lucide-react-native';
import { ALL_BRANCHES } from '../../logic/erpApprovals';
import { homeRowLabel, splitHome, type HomeKey, type HomeRow } from '../../logic/erpApprovalHome';
import { tintForCode } from '../../logic/chatTile';
import { colors } from '../../theme';

// The Approvals home and the frame around a section (owner, 2026-11-19: "a lot of extra stuff"). One list of the ERP's
// sections replaces the branch chips, the tab strip and the "Waiting on me" doors; a section opens with a back button; the
// branch is one dropdown; the ERP's rule text sits behind "How approval works here".
//
// 1.1.0 LINE: the 1.2.0 app builds this from the Groups view's PickMenu, AnchoredMenu and textStyles, which this line does
// not have. Same layout and sizes here, with a plain react-native Modal for the branch menu.

// Apple's text sizes, as textStyles holds them on the 1.2.0 line.
const T = {
  title2: { fontSize: 21, lineHeight: 26 }, headline: { fontSize: 16, lineHeight: 21, fontWeight: '600' as const },
  subheadline: { fontSize: 14, lineHeight: 19 }, footnote: { fontSize: 12, lineHeight: 16 }, caption: { fontSize: 11, lineHeight: 13 },
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
      <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: colors.ink, ...T.title2, fontWeight: '800' }}>{title}</Text>
      {right}
    </View>
  );
}

function BranchTile({ code }: { code?: string }) {
  const tint = code ? tintForCode(code) : null;
  return (
    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tint ? tint.bg : colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}>
      {tint && code
        ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ paddingHorizontal: 3, color: tint.fg, ...T.caption, fontWeight: '700' }}>{code.slice(0, 4)}</Text>
        : <LayoutGrid size={17} color={colors.ink} />}
    </View>
  );
}

/** Which branch's approvals show: one dropdown instead of a row of chips. Each choice says how much waits there. */
export function BranchPicker({ options, value, counts, onPick }: { options: string[]; value: string; counts: Record<string, number> | null; onPick: (branch: string) => void }) {
  const chip = useRef<View>(null);
  const { width: winW } = useWindowDimensions();
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  if (options.length < 2) return null;
  const name = (b: string) => (b === ALL_BRANCHES ? 'All branches' : b);
  const n = (b: string) => counts?.[b] ?? 0;
  const waits = (b: string) => (counts ? (n(b) ? `${n(b)} waiting` : 'Nothing waiting') : '');
  // A dot when a single branch is picked and another one has work: narrowing the list never hides it.
  const elsewhere = value !== ALL_BRANCHES && options.some((b) => b !== value && b !== ALL_BRANCHES && n(b) > 0);
  const open = () => chip.current?.measureInWindow((x, y, w, h) => setAt({ top: y + h + 6, right: Math.max(12, winW - (x + w)) }));
  return (
    <>
      <Pressable ref={chip} onPress={open} hitSlop={{ top: 5, bottom: 5 }} accessibilityRole="button"
        accessibilityLabel={`Branch: ${name(value)}${elsewhere ? ', more waiting in other branches' : ''}. Change branch`}
        style={{ flexShrink: 1, minWidth: 0, height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, paddingRight: 8, borderRadius: 17, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.card }}>
        <MapPin size={14} color={colors.ink} />
        <Text numberOfLines={1} style={{ flexShrink: 1, maxWidth: 140, color: colors.ink, ...T.footnote, fontWeight: '700' }}>{name(value)}</Text>
        <ChevronDown size={14} color={colors.primary} />
        {elsewhere ? <View style={{ position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.primary }} /> : null}
      </Pressable>
      <Modal visible={!!at} transparent animationType="fade" onRequestClose={() => setAt(null)}>
        {/* A tap outside closes it; no dimmed backdrop, as on the 1.2.0 line. */}
        <Pressable onPress={() => setAt(null)} accessible={false} style={{ flex: 1 }}>
          <View accessibilityRole="menu" accessibilityLabel="Show approvals from" onStartShouldSetResponder={() => true}
            style={{ position: 'absolute', top: at?.top ?? 0, right: at?.right ?? 12, width: Math.min(300, winW - 24), maxHeight: '75%', backgroundColor: colors.card, borderRadius: 18, borderWidth: 0.5, borderColor: colors.coolDivider, overflow: 'hidden',
              shadowColor: '#0B1220', shadowOpacity: 0.2, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 }}>
            <Text numberOfLines={1} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, color: colors.coolText, ...T.footnote, fontWeight: '600' }}>Show approvals from</Text>
            <ScrollView style={{ flexGrow: 0 }} bounces={false}>
              {options.map((b) => {
                const on = b === value;
                return (
                  <Pressable key={b} onPress={() => { onPick(b); setAt(null); }} accessibilityRole="menuitem" accessibilityState={{ selected: on }} accessibilityLabel={[name(b), waits(b)].filter(Boolean).join(', ')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 6, marginBottom: 2, borderRadius: 12, backgroundColor: on ? colors.coolMuted : 'transparent' }}>
                    <BranchTile code={b === ALL_BRANCHES ? undefined : b} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: on ? '600' : '500' }}>{name(b)}</Text>
                      {waits(b) ? <Text numberOfLines={1} style={{ color: colors.coolText, ...T.footnote }}>{waits(b)}</Text> : null}
                    </View>
                    <View style={{ width: 22, alignItems: 'center' }}>{on ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}</View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
          <Text numberOfLines={1} style={{ color: colors.ink, ...T.headline }}>{row.title}</Text>
          <Text numberOfLines={1} style={{ color: colors.coolText, ...T.footnote, marginTop: 1 }}>{row.hint}</Text>
        </View>
        {forMe ? (
          <View style={{ minWidth: 28, minHeight: 24, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', ...T.footnote, fontWeight: '700' }}>{row.mine > 99 ? '99+' : row.mine}</Text>
          </View>
        ) : row.waiting ? (
          <Text style={{ color: colors.coolText, ...T.subheadline, fontWeight: '600' }}>{row.waiting > 99 ? '99+' : row.waiting}</Text>
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
          <Text accessibilityRole="header" style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 8, color: colors.ink, ...T.headline, fontWeight: '700' }}>Needs you</Text>
          <Group rows={needsMe} onOpen={onOpen} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: colors.primarySoft }}>
          <CircleCheck size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, ...T.headline }}>You are all caught up</Text>
            <Text style={{ color: colors.coolText, ...T.footnote, marginTop: 1 }}>Nothing is waiting at your step.</Text>
          </View>
        </View>
      )}
      {rest.length ? (
        <>
          <Text accessibilityRole="header" style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8, color: colors.coolText, ...T.subheadline, fontWeight: '600' }}>{needsMe.length ? 'Everything else' : 'All sections'}</Text>
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
        <Text style={{ color: colors.coolText, ...T.footnote, fontWeight: '600' }}>{label}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><ChevronDown size={14} color={colors.coolText} /></View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
