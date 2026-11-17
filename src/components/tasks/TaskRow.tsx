import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Building2, CalendarDays, Repeat } from 'lucide-react-native';
import type { Task } from '../../api/tasks';
import { colors } from '../../theme';
import { counterpart, dueLabel, isOverdue } from '../../logic/taskRules';
import { OverdueFlag, PriorityPill, StatusPill, TaskChatBadge, UnreadBadge } from './TaskPills';

// One task in a list: title, who it is to/from, business, due, priority pill, status pill, a red
// overdue flag, the unread count of its chat and the chat badge: red until the chat is started,
// green after (spec section 7; badge 2026-11-17). Tapping the badge goes straight to the task's chat
// (onChatPress, Afshin 2026-11-17); the rest of the card opens the task.
export const TaskRow = memo(function TaskRow({ task, meId, onPress, onChatPress, last }: { task: Task; meId: string; onPress: (id: string) => void; onChatPress?: (task: Task) => void; last?: boolean }) {
  const overdue = task.overdue || isOverdue(task);
  const who = counterpart(task, meId);
  const biz = [task.companyName, task.branchName].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => onPress(task.id)} android_ripple={{ color: colors.coolMuted }}
      style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.coolDivider, backgroundColor: overdue ? '#FFF8F8' : colors.card }}>
      <View style={{ width: 4, borderRadius: 2, backgroundColor: overdue ? colors.danger : task.priority === 'urgent' ? colors.danger : task.priority === 'high' ? colors.orange : 'transparent' }} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text numberOfLines={2} style={{ flex: 1, color: colors.ink, fontSize: 14.5, fontWeight: '700', lineHeight: 19 }}>{task.title}</Text>
          <UnreadBadge count={task.unread} />
          <TaskChatBadge task={task} onPress={onChatPress ? () => onChatPress(task) : undefined} />
        </View>
        <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{who.label} <Text style={{ color: colors.ink, fontWeight: '600' }}>{who.name}</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <CalendarDays size={12} color={overdue ? colors.danger : colors.coolText} />
            <Text style={{ color: overdue ? colors.danger : colors.coolText, fontSize: 12, fontWeight: overdue ? '700' : '500' }}>{dueLabel(task)}</Text>
          </View>
          {biz ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
              <Building2 size={12} color={colors.coolText} />
              <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, flexShrink: 1 }}>{biz}</Text>
            </View>
          ) : null}
          {task.repeat && task.repeat.kind !== 'none' ? <Repeat size={12} color={colors.coolText} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {overdue ? <OverdueFlag /> : null}
          <PriorityPill priority={task.priority} />
          <StatusPill status={task.status} />
        </View>
      </View>
    </Pressable>
  );
});
