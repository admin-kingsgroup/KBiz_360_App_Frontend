import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, ChevronUp, ListChecks } from 'lucide-react-native';
import { getTask, type Task } from '../../api/tasks';
import { colors } from '../../theme';
import { dueLabel, isOverdue } from '../../logic/taskRules';
import { useTasksStore } from '../../store/tasksStore';
import { OverdueFlag, PriorityPill, StatusPill } from './TaskPills';
import { StatusActions } from './StatusActions';

// The task card pinned at the top of a task's chat (spec section 5): title, business, due date,
// priority and status, a button to open the task, and the status buttons this person may press —
// so the assignee can move it on, and the assigner close or reopen it, without leaving the chat.
// It refetches whenever the chat gets a new message (`refreshKey`): every status change posts one.

export function TaskChatCard({ taskId, refreshKey, onOpenTask }: { taskId: string; refreshKey?: string | number | null; onOpenTask: (id: string) => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [open, setOpen] = useState(true);
  const touched = useTasksStore((s) => s.touched);

  const load = useCallback(() => {
    getTask(taskId).then((d) => { setTask(d.task); useTasksStore.getState().upsert(d.task); }).catch(() => undefined);
  }, [taskId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { if (touched.taskId === taskId && touched.at) load(); }, [touched, taskId, load]);

  if (!task) return null;
  const overdue = task.overdue || isOverdue(task);
  const biz = [task.companyName, task.branchName].filter(Boolean).join(' · ');

  return (
    <View style={{ backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 10, paddingBottom: open && task.actions.length ? 10 : 8, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: overdue ? colors.danger : colors.primary }} />
        <Pressable onPress={() => onOpenTask(task.id)} accessibilityLabel="Open task" style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <ListChecks size={12} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>TASK</Text>
          </View>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 1 }}>{task.title}</Text>
          <Text numberOfLines={1} style={{ color: overdue ? colors.danger : colors.coolText, fontSize: 12, marginTop: 1 }}>
            Due {dueLabel(task)}{biz ? ` · ${biz}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {overdue ? <OverdueFlag /> : null}
            <PriorityPill priority={task.priority} />
            <StatusPill status={task.status} />
          </View>
        </Pressable>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Pressable onPress={() => onOpenTask(task.id)} accessibilityLabel="Open task" hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.primarySoft }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Open</Text>
            <ChevronRight size={14} color={colors.primary} />
          </Pressable>
          {task.actions.length ? (
            <Pressable onPress={() => setOpen((v) => !v)} accessibilityLabel={open ? 'Hide task actions' : 'Show task actions'} hitSlop={8} style={{ padding: 4 }}>
              {open ? <ChevronUp size={16} color={colors.coolText} /> : <ChevronDown size={16} color={colors.coolText} />}
            </Pressable>
          ) : null}
        </View>
      </View>
      {open && task.actions.length ? (
        <View style={{ marginTop: 9, marginLeft: 13 }}>
          <StatusActions task={task} compact onChanged={(t) => setTask(t)} />
        </View>
      ) : null}
    </View>
  );
}
