import { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent, type AccessibilityActionEvent } from 'react-native';
import { colors } from '../../theme';
import { to12h, type Meridiem } from '../../logic/timeWheel';

// Alarm-style scroll-wheel time picker (pure JS — no native picker module, so it works in Expo Go
// and existing dev builds). Two snap-to-centre wheels (hour 1–12, minute 00–59) whose rows fade
// away from the centre line, flanked by AM/PM pills aligned with the selected row.
// Each control reports ONLY its own axis (hour wheel → onHour12, minute wheel → onMinute, pills →
// onMeridiem) so the parent can compose with functional setState — a composite (hour, minute)
// callback would let two same-frame commits resubmit each other's stale value.
const ITEM_H = 42;
const VISIBLE = 5; // odd: one centre row + two fading rows each side
const PAD = ((VISIBLE - 1) / 2) * ITEM_H; // inset so the first/last items can reach the centre
const WHEEL_H = ITEM_H * VISIBLE;
// Opacity by distance from the centre row — the fade IS the selection affordance.
const FADE = [1, 0.35, 0.14];

const HOUR_LABELS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTE_LABELS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

interface WheelProps {
  items: string[];
  index: number; // seeds the position on first content layout; the wheel is uncontrolled afterwards
  label: string; // screen-reader name ("Hour"/"Minute")
  onChange: (index: number) => void;
}

function Wheel({ items, index, label, onChange }: WheelProps) {
  const ref = useRef<ScrollView>(null);
  const seeded = useRef(false);
  const [centered, setCentered] = useState(index);
  const clamp = (i: number): number => Math.max(0, Math.min(items.length - 1, i));
  const indexAt = (e: NativeSyntheticEvent<NativeScrollEvent>): number => clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));

  const commit = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const i = indexAt(e);
    setCentered(i);
    onChange(i);
  };
  // Fling releases report a mid-flight offset at finger-lift — defer those to onMomentumScrollEnd
  // and commit drag-end only for stationary releases (which fire no momentum event on Android).
  const endDrag = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.1) commit(e);
  };
  const pick = (i: number): void => {
    ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
    setCentered(i);
    onChange(i);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[centered] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e: AccessibilityActionEvent) => pick(clamp(centered + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))}
    >
      <ScrollView
        ref={ref}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: WHEEL_H, width: 74 }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e) => { const i = indexAt(e); setCentered((c) => (c === i ? c : i)); }}
        onMomentumScrollEnd={commit}
        onScrollEndDrag={endDrag}
        // Seed once the content actually has layout — a mount-time rAF can beat layout on Android
        // and scrollTo would clamp to 0. Fires again per key remount, re-seeding on each sheet open.
        onContentSizeChange={() => {
          if (seeded.current) return;
          seeded.current = true;
          ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
        }}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {items.map((label2, i) => {
          const d = Math.abs(i - centered);
          return (
            <Pressable key={label2} onPress={() => pick(i)} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 30, fontWeight: d === 0 ? '800' : '600', color: colors.ink, opacity: FADE[d] ?? 0.07, fontVariant: ['tabular-nums'] }}>
                {label2}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MeridiemPill({ label, active, onPress }: { label: Meridiem; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, backgroundColor: active ? colors.ink : 'transparent' }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#fff' : colors.textMuted2 }}>{label}</Text>
    </Pressable>
  );
}

export interface TimeWheelProps {
  hour: number; // 0–23
  minute: number; // 0–59
  onHour12: (h12: number) => void; // clock-face hour (1–12) from the hour wheel
  onMinute: (minute: number) => void;
  onMeridiem: (m: Meridiem) => void;
}

// Remount (change the React key) to re-seed the wheels — they own their position after mount.
export function TimeWheel({ hour, minute, onHour12, onMinute, onMeridiem }: TimeWheelProps) {
  const { h12, meridiem } = to12h(hour);
  return (
    <View className="flex-row items-center justify-center" style={{ height: WHEEL_H, gap: 14 }}>
      <MeridiemPill label="AM" active={meridiem === 'AM'} onPress={() => onMeridiem('AM')} />
      <Wheel items={HOUR_LABELS} index={h12 - 1} label="Hour" onChange={(i) => onHour12(i + 1)} />
      <Wheel items={MINUTE_LABELS} index={minute} label="Minute" onChange={onMinute} />
      <MeridiemPill label="PM" active={meridiem === 'PM'} onPress={() => onMeridiem('PM')} />
    </View>
  );
}
