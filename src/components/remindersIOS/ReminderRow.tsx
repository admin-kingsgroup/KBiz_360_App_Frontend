import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { AlertCircle, ArrowRight, CalendarDays, Flag } from 'lucide-react-native';
import { dueChipLabel } from '../../logic/quickAdd';
import { splitMentions } from '../../logic/mentions';
import { branchIdentity, T, SMART_TINT, type BranchPaletteEntry } from './tokens';
import type { IOSReminder } from '../../data/remindersIOS';

// One reminder row: completion circle (with the iOS pop), priority marks, meta lines,
// branch badge + tag chips, subtasks, and swipe-left Flag/Delete actions (66px each).

interface ReminderRowProps {
  r: IOSReminder;
  bizCode: string;
  branchColors?: BranchPaletteEntry;
  /** Every assignable person's name — lets the row paint "@Name" the way the composer does. */
  mentionNames?: string[];
  isLast: boolean;
  onToggleDone: (id: string) => void;
  onToggleSub: (rid: string, sid: number) => void;
  onFlag: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (m: SwipeableMethods | null) => void;
  onRowPress: () => void;
}

const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// A late row sits on a wash of the overdue red, so lateness is visible before it is read.
const OVERDUE_BG = '#FDF0F0';

// Done-circle inner dot — pops in at scale 0.4 → 1.18 → 1 over ~250ms (handoff spec).
function PopDot() {
  const scale = useSharedValue(0.4);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    scale.value = withSequence(withTiming(1.18, { duration: 175 }), withTiming(1, { duration: 75 }));
  }, [scale]);
  return <Animated.View style={[{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: T.accent }, style]} />;
}

// One side of the "creator → assignee" line: initials chip + name, accented when it is the viewer.
function Party({ name, isMe }: { name: string; isMe: boolean }) {
  return (
    <>
      <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: isMe ? SMART_TINT.today.bg : T.fill }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: isMe ? SMART_TINT.today.fg : T.sub }}>{isMe ? 'ME' : initialsOf(name)}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 13, flexShrink: 1, color: isMe ? SMART_TINT.today.fg : T.sub, fontWeight: isMe ? '600' : '400' }}>
        {isMe ? 'you' : name}
      </Text>
    </>
  );
}

export function ReminderRow({ r, bizCode, branchColors, mentionNames, isLast, onToggleDone, onToggleSub, onFlag, onDelete, onOpen, onRowPress }: ReminderRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  // Overdue is a state the CARD should carry, not just a line of red text — an item four days late
  // and one due next week were previously the same white row.
  const overdue = r.day < 0 && !r.done;
  const dateLabel = dueChipLabel(r.day);
  // A reminder you set for yourself has no direction worth drawing.
  const selfSet = r.forIsMe && r.byIsMe;
  const branch = r.branch ? branchIdentity(r.branch) : null;
  const titleParts = mentionNames?.length ? splitMentions(r.title, mentionNames) : [{ text: r.title, mention: false }];

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row', width: 132 }}>
      <Pressable
        onPress={() => { swipeRef.current?.close(); onFlag(r.id); }}
        style={{ width: 66, backgroundColor: T.flag, alignItems: 'center', justifyContent: 'center', gap: 3 }}
      >
        <Flag size={15} color="#fff" fill="#fff" />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>Flag</Text>
      </Pressable>
      <Pressable
        onPress={() => { swipeRef.current?.close(); onDelete(r.id); }}
        style={{ width: 66, backgroundColor: T.overdue, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1}
      rightThreshold={66}
      overshootRight={false}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => onOpen(swipeRef.current)}
    >
      <Pressable onPress={onRowPress} style={{ backgroundColor: overdue ? OVERDUE_BG : T.card }}>
        <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 15, alignItems: 'flex-start' }}>
          {/* Completion circle — the ring turns red while the item is late. */}
          <Pressable
            onPress={() => onToggleDone(r.id)}
            hitSlop={8}
            style={{
              width: 22, height: 22, borderRadius: 11, marginTop: 2, flexShrink: 0,
              borderWidth: 1.7, borderColor: r.done ? T.accent : overdue ? T.overdue : T.ring,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {r.done ? <PopDot /> : null}
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 17, letterSpacing: -0.3, lineHeight: 22 }}>
              {r.prio > 0 ? <Text style={{ color: T.accent, fontWeight: '600' }}>{'!'.repeat(r.prio)} </Text> : null}
              {/* "@Name" is painted the way the composer paints it, so the assignee reads as a person
                  rather than as part of the sentence. */}
              {titleParts.map((seg, i) => (
                <Text key={i} style={{ color: r.done ? T.sub : seg.mention ? T.accent : T.ink, fontWeight: seg.mention ? '600' : '400', textDecorationLine: r.done ? 'line-through' : 'none' }}>{seg.text}</Text>
              ))}
            </Text>
            {r.notes ? <Text style={{ fontSize: 14, color: T.sub, marginTop: 1 }}>{r.notes}</Text> : null}
            {/* Due as chips: how late / when, then the clock time in a quieter one. */}
            {dateLabel || r.time ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 7 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: overdue ? SMART_TINT.scheduled.bg : SMART_TINT.today.bg }}>
                  {overdue
                    ? <AlertCircle size={12} color={SMART_TINT.scheduled.fg} strokeWidth={2.4} />
                    : <CalendarDays size={12} color={SMART_TINT.today.fg} strokeWidth={2.4} />}
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: overdue ? SMART_TINT.scheduled.fg : SMART_TINT.today.fg }}>{dateLabel}</Text>
                </View>
                {r.time ? (
                  <View style={{ borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: T.fill }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.sub }}>{r.time}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {/* Creator → assignee. Both sides always shown, so the row says who owes it, not only
                who asked. Self-set reminders have no direction worth drawing. */}
            {!selfSet && (r.byName || r.forName) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <Party name={r.byName} isMe={r.byIsMe} />
                <ArrowRight size={13} color={T.placeholder} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                <Party name={r.forName} isMe={r.forIsMe} />
              </View>
            ) : null}
            {r.branch || r.tags.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                {r.branch ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: branchColors?.bg ?? branch?.bg ?? T.fill, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
                    {branch ? <branch.Icon size={12} color={branchColors?.fg ?? branch.fg} strokeWidth={2.4} /> : null}
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: branchColors?.fg ?? T.sub }}>
                      {bizCode ? `${bizCode}-${r.branch}` : r.branch}
                    </Text>
                  </View>
                ) : null}
                {r.tags.map((tag) => (
                  <View key={tag} style={{ backgroundColor: T.fill, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: T.accent }}>#{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {r.flag ? <Flag size={15} color={T.flag} fill={T.flag} style={{ marginTop: 4, flexShrink: 0 }} /> : null}
        </View>

        {/* Subtasks — indented under the completion circle */}
        {r.subs.length > 0 ? (
          <View style={{ paddingLeft: 50, paddingRight: 16, paddingBottom: 10, gap: 8 }}>
            {r.subs.map((sb) => (
              <Pressable key={sb.id} onPress={() => onToggleSub(r.id, sb.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                    borderWidth: 1.6, borderColor: sb.done ? T.accent : T.ring,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {sb.done ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent }} /> : null}
                </View>
                <Text style={{ fontSize: 15, lineHeight: 19, color: sb.done ? T.sub : T.ink, textDecorationLine: sb.done ? 'line-through' : 'none' }}>
                  {sb.t}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!isLast ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: T.sep, marginLeft: 50 }} /> : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}
