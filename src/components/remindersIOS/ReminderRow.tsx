import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { Flag } from 'lucide-react-native';
import { whenLabel } from '../../logic/quickAdd';
import { T, type BranchPaletteEntry } from './tokens';
import type { IOSReminder } from '../../data/remindersIOS';

// One reminder row: completion circle (with the iOS pop), priority marks, meta lines,
// branch badge + tag chips, subtasks, and swipe-left Flag/Delete actions (66px each).

interface ReminderRowProps {
  r: IOSReminder;
  bizCode: string;
  branchColors?: BranchPaletteEntry;
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

// Done-circle inner dot — pops in at scale 0.4 → 1.18 → 1 over ~250ms (handoff spec).
function PopDot() {
  const scale = useSharedValue(0.4);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    scale.value = withSequence(withTiming(1.18, { duration: 175 }), withTiming(1, { duration: 75 }));
  }, [scale]);
  return <Animated.View style={[{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: T.accent }, style]} />;
}

export function ReminderRow({ r, bizCode, branchColors, isLast, onToggleDone, onToggleSub, onFlag, onDelete, onOpen, onRowPress }: ReminderRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const when = whenLabel(r.day, r.time);
  const who = (r.assignedTo ? `For ${r.assignedTo}` : '') + (r.assignedTo && r.assignedBy ? ' · ' : '') + (r.assignedBy ? `From ${r.assignedBy}` : '');

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
      <Pressable onPress={onRowPress} style={{ backgroundColor: T.card }}>
        <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'flex-start' }}>
          {/* Completion circle */}
          <Pressable
            onPress={() => onToggleDone(r.id)}
            hitSlop={8}
            style={{
              width: 22, height: 22, borderRadius: 11, marginTop: 2, flexShrink: 0,
              borderWidth: 1.7, borderColor: r.done ? T.accent : T.ring,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {r.done ? <PopDot /> : null}
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 17, letterSpacing: -0.3, lineHeight: 22 }}>
              {r.prio > 0 ? <Text style={{ color: T.accent, fontWeight: '600' }}>{'!'.repeat(r.prio)} </Text> : null}
              <Text style={{ color: r.done ? T.sub : T.ink, textDecorationLine: r.done ? 'line-through' : 'none' }}>{r.title}</Text>
            </Text>
            {r.notes ? <Text style={{ fontSize: 14, color: T.sub, marginTop: 1 }}>{r.notes}</Text> : null}
            {when ? <Text style={{ fontSize: 14, marginTop: 1, color: r.day < 0 && !r.done ? T.overdue : T.sub }}>{when}</Text> : null}
            {who ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: T.fill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ color: T.sub, fontSize: 9, fontWeight: '700' }}>{initialsOf(r.assignedTo ?? r.assignedBy ?? '')}</Text>
                </View>
                <Text style={{ fontSize: 13, color: T.sub }}>{who}</Text>
              </View>
            ) : null}
            {r.branch || r.tags.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                {r.branch ? (
                  <View style={{ backgroundColor: branchColors?.bg ?? T.fill, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 }}>
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
