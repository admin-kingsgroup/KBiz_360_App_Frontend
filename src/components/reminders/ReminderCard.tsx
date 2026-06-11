import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Clock, Check, RotateCcw } from 'lucide-react-native';
import { colors, shadow } from '../../theme';
import type { Business } from '../../types';
import { type ReminderRecord } from '../../data/reminders';

// Status/affordances depend on for-me/by-me + state. `meId` is the signed-in user's real id.
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

  const accent = isPersonal ? '#D6336C' : (biz?.color || colors.warmMute);
  const cardBg = isPersonal ? '#FBEAF1' : (biz?.tint || colors.card);
  const cardEdge = isPersonal ? '#F0C2D6' : (biz ? biz.color + '40' : colors.cardEdge);

  return (
    <View style={{ backgroundColor: cardBg, borderColor: cardEdge, borderWidth: 1, borderRadius: 18, padding: 10, overflow: 'hidden', ...shadow }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />
      <View className="flex-row items-start gap-2.5">
        {forMe && r.state === 'pending' ? (
          <Pressable onPress={() => onComplete(r.id)} accessibilityLabel="Mark complete" style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#C8C5BB', marginTop: 1 }} />
        ) : isReview ? (
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>!</Text>
          </View>
        ) : showWaiting ? (
          <Clock size={14} color={colors.textMuted2} style={{ marginTop: 2 }} />
        ) : (
          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#C8C5BB', marginTop: 1 }} />
        )}

        <View className="flex-1">
          <Text numberOfLines={3} style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 13, fontWeight: '600', lineHeight: 17 }}>{r.text}</Text>
          <View className="flex-row items-center gap-1.5 mt-1.5">
            {r.when ? <Text style={{ color: r.overdue ? colors.danger : colors.warmMute, fontSize: 10, fontWeight: '700' }}>{r.when}</Text> : null}
            {r.when ? <Text style={{ color: '#cfc6b5', fontSize: 9 }}>•</Text> : null}
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: forMe ? (r.byColor || colors.ink) : (r.forColor || colors.ink), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{(forMe ? (r.byInitials || '') : (r.forInitials || '')).charAt(0)}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: accent, fontSize: 10, fontWeight: '600' }}>
              {isPersonal ? 'Personal' : forMe ? `From ${(r.byName || '').split(' ')[0]}` : `To ${(r.forName || '').split(' ')[0]}`}
            </Text>
          </View>
        </View>
      </View>

      {isReview ? (
        <View className="flex-row items-center justify-between gap-2 mt-2" style={{ marginLeft: 28, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.orange, fontSize: 10, fontWeight: '800', flex: 1 }}>
            ✓ Completed by {(r.forName || '').split(' ')[0]} · Review to {(r.byName || '').split(' ')[0]}
          </Text>
          {showReviewActions ? (
            <View className="flex-row gap-1.5">
              <Pressable onPress={() => onApprove(r.id)} className="flex-row items-center gap-1" style={{ backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                <Check size={11} color="#fff" strokeWidth={3} /><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>Approve</Text>
              </Pressable>
              <Pressable onPress={() => onReassign(r)} className="flex-row items-center gap-1" style={{ borderColor: colors.orange, borderWidth: 1, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                <RotateCcw size={11} color={colors.orange} strokeWidth={2.5} /><Text style={{ color: colors.orange, fontSize: 10, fontWeight: '800' }}>Re-assign</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const ReminderCard = memo(ReminderCardBase);
