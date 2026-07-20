import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Clock, Check, RotateCcw } from 'lucide-react-native';
import { colors } from '../../theme';
import type { Business } from '../../types';
import { type ReminderRecord } from '../../data/reminders';

// Status/affordances depend on for-me/by-me + state. `meId` is the signed-in user's real id.
// White card on the cool canvas; the left stripe keeps the semantic accent (pink = personal,
// business color = that business, green = default).
function ReminderCardBase({ r, biz, meId, onComplete, onApprove, onReassign }: {
  r: ReminderRecord; biz: Business | null; meId: string;
  onComplete: (id: string) => void; onApprove: (id: string) => void; onReassign: (r: ReminderRecord) => void;
}) {
  const forMe = r.forId === meId;
  const byMe = r.byId === meId;
  const isPersonal = forMe && byMe;
  const isReview = r.state === 'review';
  const showReviewActions = isReview && byMe;
  const showWaiting = r.state === 'pending' && byMe && !forMe;

  const accent = isPersonal ? '#D6336C' : (biz?.color || colors.primary);

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, padding: 12, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent }} />
      <View className="flex-row items-start gap-3">
        {forMe && r.state === 'pending' ? (
          <Pressable onPress={() => onComplete(r.id)} accessibilityLabel="Mark complete" hitSlop={8} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.primary, marginTop: 1 }} />
        ) : isReview ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>!</Text>
          </View>
        ) : showWaiting ? (
          <Clock size={18} color={colors.coolText3} style={{ marginTop: 2 }} />
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.coolDivider, marginTop: 1 }} />
        )}

        <View className="flex-1">
          <Text numberOfLines={3} style={{ color: colors.ink, fontSize: 15, fontWeight: '500', lineHeight: 21 }}>{r.text}</Text>
          <View className="flex-row items-center gap-1.5" style={{ marginTop: 6 }}>
            {r.when ? <Text style={{ color: r.overdue ? colors.danger : colors.coolText, fontSize: 12, fontWeight: '600' }}>{r.when}</Text> : null}
            {r.when ? <Text style={{ color: colors.coolText3, fontSize: 11 }}>•</Text> : null}
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: forMe ? (r.byColor || colors.ink) : (r.forColor || colors.ink), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{(forMe ? (r.byInitials || '') : (r.forInitials || '')).charAt(0)}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: accent, fontSize: 12, fontWeight: '600' }}>
              {isPersonal ? 'Personal' : forMe ? `From ${(r.byName || '').split(' ')[0]}` : `To ${(r.forName || '').split(' ')[0]}`}
            </Text>
          </View>
        </View>
      </View>

      {isReview ? (
        <View className="flex-row items-center justify-between gap-2 mt-2.5" style={{ marginLeft: 34, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.orange, fontSize: 12, fontWeight: '700', flex: 1 }}>
            ✓ Completed by {(r.forName || '').split(' ')[0]} · Review to {(r.byName || '').split(' ')[0]}
          </Text>
          {showReviewActions ? (
            <View className="flex-row gap-2">
              <Pressable onPress={() => onApprove(r.id)} className="flex-row items-center gap-1" style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}>
                <Check size={13} color="#fff" strokeWidth={3} /><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Approve</Text>
              </Pressable>
              <Pressable onPress={() => onReassign(r)} className="flex-row items-center gap-1" style={{ borderColor: colors.orange, borderWidth: 1.5, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}>
                <RotateCcw size={13} color={colors.orange} strokeWidth={2.5} /><Text style={{ color: colors.orange, fontSize: 12, fontWeight: '700' }}>Re-assign</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const ReminderCard = memo(ReminderCardBase);
