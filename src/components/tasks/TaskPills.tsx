import { Pressable, Text, View } from 'react-native';
import { AlertTriangle, MessageSquare } from 'lucide-react-native';
import type { Task, TaskPriority, TaskStatus } from '../../api/tasks';
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, TASK_CHAT_COLORS, taskChatStarted } from '../../logic/taskRules';

// Small coloured labels used by the task rows, the detail screen and the chat card.
function Chip({ label, color, strong }: { label: string; color: string; strong?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5, backgroundColor: strong ? color : `${color}1F` }}>
      <Text numberOfLines={1} style={{ color: strong ? '#fff' : color, fontSize: 10.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return <Chip label={STATUS_LABEL[status] ?? status} color={STATUS_COLOR[status] ?? '#5B6472'} />;
}

// Normal is the quiet default — only Urgent and High draw attention.
export function PriorityPill({ priority, showNormal = false }: { priority: TaskPriority; showNormal?: boolean }) {
  if (priority === 'normal' && !showNormal) return null;
  return <Chip label={PRIORITY_LABEL[priority] ?? priority} color={PRIORITY_COLOR[priority] ?? '#5B6472'} strong={priority === 'urgent'} />;
}

export function OverdueFlag() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5, backgroundColor: '#FEE2E2' }}>
      <AlertTriangle size={10} color="#DC2626" />
      <Text style={{ color: '#DC2626', fontSize: 10.5, fontWeight: '800' }}>Overdue</Text>
    </View>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D366' }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

// The task's chat at a glance: red while it has none, green once it is started (see taskChatStarted).
// With onPress it is a button: a list's chat icon goes straight to the task's chat (Afshin,
// 2026-11-17), the rest of the card still opens the task. hitSlop makes the 28-pt dot a 44-pt target.
export function TaskChatBadge({ task, size = 28, onPress }: { task: Pick<Task, 'chatId'>; size?: number; onPress?: () => void }) {
  const started = taskChatStarted(task);
  const c = started ? TASK_CHAT_COLORS.started : TASK_CHAT_COLORS.none;
  const dot = (
    <View testID={started ? 'task-chat-started' : 'task-chat-none'} accessibilityLabel={onPress ? undefined : started ? 'Chat started' : 'Chat not started'}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <MessageSquare size={Math.round(size * 0.52)} color={c.fg} strokeWidth={2.2} />
    </View>
  );
  if (!onPress) return dot;
  const pad = Math.max(0, Math.ceil((44 - size) / 2));
  return (
    <Pressable onPress={onPress} hitSlop={pad} testID="task-chat-button" accessibilityRole="button"
      accessibilityLabel={started ? 'Open the task chat' : 'Start the task chat'}>
      {dot}
    </Pressable>
  );
}
