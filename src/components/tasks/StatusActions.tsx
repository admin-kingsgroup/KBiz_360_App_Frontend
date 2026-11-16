import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Clock, X } from 'lucide-react-native';
import { changeTaskStatus, type Task, type TaskStatus } from '../../api/tasks';
import { ApiError } from '../../api/client';
import { DaySheet, TimeSheet } from '../forms';
import { colors } from '../../theme';
import { actionLabel, commentPrompt, commentRequired, dayKeyOf, DEFAULT_DUE_TIME, hhmmOf, isDangerAction, primaryAction } from '../../logic/taskRules';
import { formatTimeOfDay, type TimeOfDay } from '../../logic/reminderTime';
import { useUiStore } from '../../store/uiStore';
import { useTasksStore } from '../../store/tasksStore';

// The status buttons a person may press on a task (the server's `actions` list), and the sheet each
// one opens: every status change takes a comment — optional, except for a date change request,
// waiting on someone, reopen and cancel (spec section 4). The comment lands in the task's chat and
// history. A date change request also asks for the new date; the assigner approving one may keep the
// asked-for date or set another.

const dayLabel = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export function StatusActions({ task, onChanged, compact = false }: { task: Task; onChanged?: (t: Task) => void; compact?: boolean }) {
  const [sheetFor, setSheetFor] = useState<TaskStatus | null>(null);
  if (!task.actions.length) return null;
  const main = primaryAction(task.actions);
  const ordered = [...task.actions].sort((a, b) => (a === main ? -1 : b === main ? 1 : isDangerAction(a) ? 1 : isDangerAction(b) ? -1 : 0));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {ordered.map((to) => {
        const filled = to === main;
        const danger = isDangerAction(to);
        return (
          <Pressable key={to} accessibilityRole="button" onPress={() => setSheetFor(to)}
            style={{ height: compact ? 32 : 38, paddingHorizontal: compact ? 12 : 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
              backgroundColor: filled ? colors.primary : '#fff', borderWidth: filled ? 0 : 1, borderColor: danger ? colors.dangerEdge : colors.borderStrong }}>
            <Text style={{ color: filled ? '#fff' : danger ? colors.dangerText : colors.ink, fontSize: compact ? 12.5 : 13.5, fontWeight: '700' }}>{actionLabel(to, task)}</Text>
          </Pressable>
        );
      })}
      <StatusSheet task={task} to={sheetFor} onClose={() => setSheetFor(null)} onDone={(t) => { setSheetFor(null); useTasksStore.getState().upsert(t); onChanged?.(t); }} />
    </View>
  );
}

function StatusSheet({ task, to, onClose, onDone }: { task: Task; to: TaskStatus | null; onClose: () => void; onDone: (t: Task) => void }) {
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const [comment, setComment] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<TimeOfDay | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [seededFor, setSeededFor] = useState<TaskStatus | null>(null);

  const asksDate = to === 'date_change_requested';
  const approvesDate = to === 'accepted' && task.status === 'date_change_requested';
  const needsComment = !!to && commentRequired(to);

  // Re-seed each time the sheet opens for a status: a date approval starts on the date asked for.
  if (to !== seededFor) {
    setSeededFor(to);
    setComment('');
    setError('');
    setTime(null);
    const asked = approvesDate && task.requestedDueAt ? new Date(task.requestedDueAt) : null;
    setDay(asked && !Number.isNaN(asked.getTime()) ? dayKeyOf(asked) : null);
    if (asked && !Number.isNaN(asked.getTime())) setTime({ hour: asked.getHours(), minute: asked.getMinutes() });
  }
  if (!to) return null;

  const submit = async (): Promise<void> => {
    if (needsComment && !comment.trim()) { setError('A reason is needed for this one.'); return; }
    if (asksDate && !day) { setError('Pick the date you need.'); return; }
    const t = time ?? DEFAULT_DUE_TIME;
    let due: { dueDate?: string; dueTime?: string } = {};
    if (day && (asksDate || approvesDate)) {
      const [y, m, d] = day.split('-').map(Number);
      const local = new Date(y, m - 1, d, t.hour, t.minute);
      if (local.getTime() <= Date.now()) { setError('That date and time has already gone by.'); return; }
      due = { dueDate: day, dueTime: hhmmOf(t) };
    }
    setSaving(true);
    try {
      const updated = await changeTaskStatus(task.id, { to, ...(comment.trim() ? { comment: comment.trim() } : {}), ...due });
      onDone(updated);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '';
      setError(msg || 'Could not update the task. Check your connection and try again.');
      if (!msg) showToast('Could not update the task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(24, insets.bottom + 12), maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <View style={{ alignItems: 'center', paddingBottom: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700', flex: 1 }}>{actionLabel(to, task)}</Text>
                <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
              </View>
              <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 2 }}>{task.title}</Text>

              {asksDate || approvesDate ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{asksDate ? 'NEW DUE DATE' : 'DUE DATE'}{asksDate ? <Text style={{ color: colors.danger }}> *</Text> : null}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => setDayOpen(true)} style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                      <CalendarDays size={16} color={colors.primary} />
                      <Text numberOfLines={1} style={{ color: day ? colors.ink : colors.coolText, fontSize: 13.5, fontWeight: '600' }}>{day ? dayLabel(day) : 'Choose date'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setTimeOpen(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                      <Clock size={16} color={colors.primary} />
                      <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{formatTimeOfDay(time ?? DEFAULT_DUE_TIME)}</Text>
                    </Pressable>
                  </View>
                  {approvesDate ? <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 4 }}>The date {task.assignedTo.name.split(' ')[0]} asked for — change it to set another.</Text> : null}
                </View>
              ) : null}

              <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 }}>
                {needsComment ? 'REASON' : 'COMMENT'}{needsComment ? <Text style={{ color: colors.danger }}> *</Text> : <Text style={{ color: colors.coolText3, fontWeight: '600' }}> (optional)</Text>}
              </Text>
              <TextInput value={comment} onChangeText={(v) => { setComment(v); if (error) setError(''); }} placeholder={commentPrompt(to)} placeholderTextColor={colors.coolText3}
                multiline maxLength={2000}
                style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 84, fontSize: 14.5, color: colors.ink, textAlignVertical: 'top' }} />
              <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 4 }}>Saved in the task's history, and posted in its chat if one was started.</Text>
              {error ? <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '600', marginTop: 8 }}>{error}</Text> : null}

              <Pressable onPress={() => void submit()} disabled={saving}
                style={{ marginTop: 16, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isDangerAction(to) ? colors.danger : colors.primary, opacity: saving ? 0.7 : 1 }}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>{actionLabel(to, task)}</Text>}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <DaySheet visible={dayOpen} title={asksDate ? 'New due date' : 'Due date'} initial={day} minDay={dayKeyOf(new Date())}
        maxDay={dayKeyOf(new Date(new Date().getFullYear() + 2, 11, 31))}
        onClose={() => setDayOpen(false)} onConfirm={(d) => { setDay(d); setDayOpen(false); if (error) setError(''); }} />
      <TimeSheet visible={timeOpen} day={day} initial={time ?? DEFAULT_DUE_TIME} onClose={() => setTimeOpen(false)} onConfirm={(t) => { setTime(t); setTimeOpen(false); }} />
    </Modal>
  );
}
