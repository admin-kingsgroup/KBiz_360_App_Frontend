import { Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import type { TaskPriority, TaskStatus } from '../../api/tasks';
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from '../../logic/taskRules';

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
