import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ClipboardCheck, ChevronDown, CheckCircle2, ChevronRight, Plus, Search, X, XCircle } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { useAccessStore } from '../../store/accessStore';
import { useUiStore } from '../../store/uiStore';
import { decideRegularization, getPendingRegularizations } from '../../api/hr';
import type { Approval, ApprovalHierarchyResponse, ApprovalStatus, ApprovalStep, ApprovalStepStatus, ApprovalStepKey } from '../../api/approvals';
import { getApprovalHierarchy, listApprovals, submitApprovalRequest, updateApprovalDecision } from '../../api/approvals';

type SelectorKey = 'branch_manager' | 'company_manager' | 'business_owner';
type SelectorValues = Record<SelectorKey, string>;

const selectorLabels: Record<SelectorKey, string> = {
  branch_manager: 'Branch manager',
  company_manager: 'Company manager',
  business_owner: 'Business owner',
};

const fmtDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const DEMO_APPROVALS: Approval[] = [
  {
    id: 'demo-1',
    title: 'Salary release approval',
    details: 'Requesting approval to release the September salary payment for the Ahmedabad team.',
    category: 'Salary',
    status: 'pending',
    submittedAt: '2026-09-17T09:30:00Z',
    decidedAt: null,
    requester: { id: 'u1', name: 'Rohan Mehta', initials: 'RM', color: '#37B6A4', avatar: null, position: 'Finance Officer' },
    totalSteps: 3,
    currentStep: 1,
    currentApprover: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' },
    steps: [
      { order: 1, key: 'branch_manager', label: 'Branch manager', approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }, status: 'pending', isCurrent: true, decidedAt: null, note: '' },
      { order: 2, key: 'company_manager', label: 'Company manager', approver: { id: 'u3', name: 'Pravesh', initials: 'PR', color: '#9A6CF0', avatar: null, position: 'Company Manager' }, status: 'waiting', isCurrent: false, decidedAt: null, note: '' },
      { order: 3, key: 'business_owner', label: 'Business owner', approver: { id: 'u4', name: 'Afshin Dhanani', initials: 'AD', color: '#0C0E14', avatar: null, position: 'Business Owner' }, status: 'waiting', isCurrent: false, decidedAt: null, note: '' },
    ],
    isMine: true,
    canAct: true,
    canCancel: true,
    myDecision: null,
  },
  {
    id: 'demo-2',
    title: 'Today holiday approval',
    details: 'Request to mark today as a branch holiday due to the local public holiday.',
    category: 'Holiday',
    status: 'approved',
    submittedAt: '2026-09-16T12:15:00Z',
    decidedAt: '2026-09-16T12:35:00Z',
    requester: { id: 'u5', name: 'Nandni Shah', initials: 'NS', color: '#E8A13A', avatar: null, position: 'Executive' },
    totalSteps: 3,
    currentStep: null,
    currentApprover: null,
    steps: [
      { order: 1, key: 'branch_manager', label: 'Branch manager', approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-16T12:18:00Z', note: 'Approved for the Ahmedabad branch.' },
      { order: 2, key: 'company_manager', label: 'Company manager', approver: { id: 'u3', name: 'Pravesh', initials: 'PR', color: '#9A6CF0', avatar: null, position: 'Company Manager' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-16T12:20:00Z', note: 'Looks good.' },
      { order: 3, key: 'business_owner', label: 'Business owner', approver: { id: 'u4', name: 'Afshin Dhanani', initials: 'AD', color: '#0C0E14', avatar: null, position: 'Business Owner' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-16T12:35:00Z', note: 'Approved.' },
    ],
    isMine: false,
    canAct: false,
    canCancel: false,
    myDecision: 'approved',
  },
  {
    id: 'demo-3',
    title: 'Client visit expense approval',
    details: 'Approval needed for the client visit travel and meal expenses.',
    category: 'Expense',
    status: 'rejected',
    submittedAt: '2026-09-15T15:45:00Z',
    decidedAt: '2026-09-15T16:20:00Z',
    requester: { id: 'u6', name: 'Nurul Khan', initials: 'NK', color: '#E3674E', avatar: null, position: 'Account Executive' },
    totalSteps: 3,
    currentStep: null,
    currentApprover: null,
    steps: [
      { order: 1, key: 'branch_manager', label: 'Branch manager', approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }, status: 'rejected', isCurrent: false, decidedAt: '2026-09-15T16:05:00Z', note: 'Please clarify the client purpose.' },
      { order: 2, key: 'company_manager', label: 'Company manager', approver: { id: 'u3', name: 'Pravesh', initials: 'PR', color: '#9A6CF0', avatar: null, position: 'Company Manager' }, status: 'skipped', isCurrent: false, decidedAt: null, note: '' },
      { order: 3, key: 'business_owner', label: 'Business owner', approver: { id: 'u4', name: 'Afshin Dhanani', initials: 'AD', color: '#0C0E14', avatar: null, position: 'Business Owner' }, status: 'skipped', isCurrent: false, decidedAt: null, note: '' },
    ],
    isMine: false,
    canAct: false,
    canCancel: false,
    myDecision: 'rejected',
  },
  {
    id: 'demo-4',
    title: 'Work from home request',
    details: 'Requesting work from home for two working days due to a family commitment.',
    category: 'HR',
    status: 'approved',
    submittedAt: '2026-09-14T08:10:00Z',
    decidedAt: '2026-09-14T09:00:00Z',
    requester: { id: 'u7', name: 'Harshit Jain', initials: 'HJ', color: '#37B6A4', avatar: null, position: 'Operations Lead' },
    totalSteps: 3,
    currentStep: null,
    currentApprover: null,
    steps: [
      { order: 1, key: 'branch_manager', label: 'Branch manager', approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-14T08:32:00Z', note: 'Approved.' },
      { order: 2, key: 'company_manager', label: 'Company manager', approver: { id: 'u3', name: 'Pravesh', initials: 'PR', color: '#9A6CF0', avatar: null, position: 'Company Manager' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-14T08:41:00Z', note: 'Looks good.' },
      { order: 3, key: 'business_owner', label: 'Business owner', approver: { id: 'u4', name: 'Afshin Dhanani', initials: 'AD', color: '#0C0E14', avatar: null, position: 'Business Owner' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-14T09:00:00Z', note: 'Approved.' },
    ],
    isMine: true,
    canAct: false,
    canCancel: false,
    myDecision: 'approved',
  },
];

function Selector({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.id === value);
  const matchingOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? options.filter((option) => option.name.toLowerCase().includes(normalized)) : options;
  }, [options, query]);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => { setQuery(''); setOpen(true); }} style={styles.select} accessibilityRole="button" accessibilityLabel={`Select ${label}`}>
        <Text style={[styles.selectText, !selected && styles.placeholder]} numberOfLines={1}>{selected?.name ?? `Select ${label.toLowerCase()}`}</Text>
        <ChevronDown size={18} color={colors.coolText} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.optionSheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.coolText} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search by name" placeholderTextColor={colors.coolText3} autoFocus style={styles.searchInput} />
            </View>
            <ScrollView style={{ maxHeight: 280 }}>
              {matchingOptions.length ? matchingOptions.map((option) => (
                <Pressable key={option.id} onPress={() => { onChange(option.id); setOpen(false); }} style={styles.option}>
                  <Text style={styles.optionText}>{option.name}</Text>
                  {option.id === value ? <CheckCircle2 size={18} color={colors.primary} /> : null}
                </Pressable>
              )) : <Text style={styles.emptyOption}>No matching authorized users found</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RequestSummaryCard({ title, detail, accent }: { title: string; detail: string; accent: string }) {
  return (
    <View style={[styles.summaryCard, { borderColor: accent + '33' }]}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryDetail}>{detail}</Text>
    </View>
  );
}

function AvatarBadge({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <View style={[styles.avatarBadge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(9, size * 0.3) }]}>{initials}</Text>
    </View>
  );
}

export function RequestForm() {
  const users = useAccessStore((state) => state.users);
  const showToast = useUiStore((state) => state.showToast);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [values, setValues] = useState<SelectorValues>({ branch_manager: '', company_manager: '', business_owner: '' });
  const [hierarchy, setHierarchy] = useState<ApprovalHierarchyResponse | null>(null);
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);

  useEffect(() => {
    let active = true;
    getApprovalHierarchy().then((data) => {
      if (!active) return;
      setHierarchy(data);
      setValues((current) => ({
        branch_manager: current.branch_manager || data.steps.find((step) => step.key === 'branch_manager')?.defaultApproverId || '',
        company_manager: current.company_manager || data.steps.find((step) => step.key === 'company_manager')?.defaultApproverId || '',
        business_owner: current.business_owner || data.steps.find((step) => step.key === 'business_owner')?.defaultApproverId || '',
      }));
    }).catch(() => setHierarchy({ totalSteps: 0, steps: [], categories: [], limits: { title: 120, details: 2000, note: 500 } })).finally(() => {
      if (active) setLoadingHierarchy(false);
    });
    return () => { active = false; };
  }, []);

  const stepOptions = useMemo(() => {
    const map: Partial<Record<SelectorKey, { id: string; name: string }[]>> = {};
    if (!hierarchy) return map;
    for (const step of hierarchy.steps) {
      map[step.key] = step.candidates.map((person) => ({ id: person.id, name: person.name }));
    }
    return map;
  }, [hierarchy]);

  const submit = () => {
    if (!title.trim() || !details.trim() || !hierarchy || hierarchy.steps.length === 0) {
      showToast('Complete the approval request and hierarchy');
      return;
    }

    const missing = hierarchy.steps.some((step) => !values[step.key]);
    if (missing) {
      showToast('Pick an approver for each step');
      return;
    }

    submitApprovalRequest({
      title: title.trim(),
      details: details.trim(),
      approvers: hierarchy.steps.map((step) => ({ step: step.key, userId: values[step.key] })),
    }).then(() => {
      showToast('Approval request submitted');
      setTitle('');
      setDetails('');
      setValues({ branch_manager: '', company_manager: '', business_owner: '' });
    }).catch((error: Error & { message?: string }) => showToast(error.message || 'Could not submit approval request'));
  };

  if (loadingHierarchy) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* <View style={styles.summaryWrap}>
        <RequestSummaryCard title="Approval flow" detail={`${hierarchy?.totalSteps ?? 0} step chain`} accent={colors.primary} />
        <RequestSummaryCard title="Status" detail={hierarchy && hierarchy.steps.length > 0 ? 'Ready for review' : 'Waiting for approvers'} accent={colors.primary} />
      </View>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Request details</Text>
        <Text style={styles.sectionHint}>Tell the approvers what you need and why.</Text>
      </View> */}
      <View style={styles.sectionCard}>
        <Text style={styles.label}>Title <Text style={styles.required}>*</Text></Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Salary release approval" placeholderTextColor={colors.coolText3} style={styles.input} maxLength={hierarchy?.limits.title ?? 120} />
        <Text style={styles.label}>Details <Text style={styles.required}>*</Text></Text>
        <TextInput value={details} onChangeText={setDetails} placeholder="Explain what needs approval" placeholderTextColor={colors.coolText3} style={[styles.input, styles.multiline]} multiline textAlignVertical="top" maxLength={hierarchy?.limits.details ?? 2000} />
      </View>
      <View style={styles.hierarchyHeading}>
        <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Approval hierarchy</Text><Text style={styles.sectionHint}>Your request will be reviewed in this order.</Text></View>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{hierarchy && hierarchy.totalSteps > 0 ? `${hierarchy.totalSteps} steps` : 'No steps'}</Text></View>
      </View>
      <View style={styles.sectionCard}>
        {hierarchy && hierarchy.steps.length > 0 ? hierarchy.steps.map((step) => (
          <Selector key={step.key} label={step.label} value={values[step.key]} options={stepOptions[step.key] ?? []} onChange={(id) => setValues((current) => ({ ...current, [step.key]: id }))} />
        )) : (
          <Text style={styles.emptyOption}>No approvers are available for this account.</Text>
        )}
      </View>
      <Pressable onPress={submit} disabled={!hierarchy || hierarchy.steps.length === 0} style={[styles.primaryButton, (!hierarchy || hierarchy.steps.length === 0) && styles.primaryButtonDisabled]}><ClipboardCheck size={18} color="#fff" strokeWidth={2.5} /><Text style={styles.primaryButtonText}>Submit request</Text></Pressable>
      <Text style={styles.footerHint}>All selected approvers will be notified when this request is submitted.</Text>
    </ScrollView>
  );
}

function statusMeta(status: ApprovalStatus): { label: string; color: string; background: string } {
  if (status === 'approved') return { label: 'Approved', color: colors.primary, background: colors.primarySoft };
  if (status === 'rejected') return { label: 'Rejected', color: colors.danger, background: colors.danger + '12' };
  return { label: 'Pending', color: colors.orange, background: colors.orange + '18' };
}

function stepStatusMeta(status: ApprovalStepStatus): { label: string; color: string } {
  if (status === 'approved') return { label: 'Approved', color: colors.primary };
  if (status === 'rejected') return { label: 'Rejected', color: colors.danger };
  if (status === 'pending') return { label: 'Pending', color: colors.orange };
  if (status === 'waiting') return { label: 'Waiting', color: colors.coolText };
  return { label: 'Skipped', color: colors.coolText3 };
}

function ApprovalRow({ record, onPress }: { record: Approval; onPress: () => void }) {
  const meta = statusMeta(record.status);
  return <Pressable onPress={onPress} style={styles.approvalRow} accessibilityRole="button" accessibilityLabel={`View ${record.title}`}>
    <AvatarBadge name={record.requester.name} size={36} />
    <View style={styles.rowBody}>
      <View style={styles.cardTop}><Text style={styles.cardTitle} numberOfLines={1}>{record.title}</Text><Text style={styles.cardDate}>{fmtDate(record.submittedAt)}</Text></View>
      <Text style={styles.rowMeta} numberOfLines={1}>{record.requester.name} · {record.category}</Text>
      <Text style={styles.rowMetaMuted} numberOfLines={1}>{record.currentApprover ? `Current step: ${record.currentApprover.name}` : 'Final decision captured'}</Text>
    </View>
    <View style={styles.rowRight}><View style={[styles.statusPill, { backgroundColor: meta.background }]}><Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text></View><ChevronRight size={17} color={colors.coolText3} /></View>
  </Pressable>;
}

function ApprovalDetail({ record, visible, busy, onClose, onDecision }: { record: Approval | null; visible: boolean; busy: boolean; onClose: () => void; onDecision: (action: 'approve' | 'reject') => void }) {
  if (!record) return null;
  const meta = statusMeta(record.status);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.detailBackdrop}>
      <View style={styles.detailSheet}>
        <View style={styles.detailHandle} />
        <View style={styles.detailHeader}>
          <View style={styles.detailHeaderInfo}>
            <Text style={styles.detailTitle}>{record.title}</Text>
            <Text style={styles.detailSubtitle}>{record.requester.name} · {record.category}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close approval details"><X size={18} color={colors.coolText} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={styles.detailSummaryCard}>
            <View style={styles.detailSummaryRow}>
              <View style={styles.detailSummaryItem}><Text style={styles.summaryLabel}>Status</Text><View style={[styles.statusPill, { backgroundColor: meta.background }]}><Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text></View></View>
              <View style={styles.detailSummaryItem}><Text style={styles.summaryLabel}>Submitted</Text><Text style={styles.summaryValue}>{fmtDate(record.submittedAt)}</Text></View>
            </View>
          </View>
          <Text style={styles.detailSectionTitle}>Request details</Text>
          <Text style={styles.detailText}>{record.details}</Text>
          <Text style={styles.detailSectionTitle}>Approval hierarchy</Text>
          {record.steps.map((step) => {
            const stepMeta = stepStatusMeta(step.status);
            return <View key={step.order} style={styles.hierarchyRow}>
              <View style={[styles.hierarchyDot, { backgroundColor: step.status === 'approved' ? colors.primarySoft : step.status === 'rejected' ? colors.danger + '12' : colors.coolMuted }]}><CheckCircle2 size={14} color={step.status === 'rejected' ? colors.danger : step.status === 'approved' ? colors.primary : colors.coolText3} /></View>
              <Text style={styles.hierarchyLabel}>{step.label}</Text>
              <Text style={styles.hierarchyValue} numberOfLines={1}>{step.approver.name}</Text>
              <View style={[styles.inlineStatus, { backgroundColor: step.status === 'approved' ? colors.primarySoft : step.status === 'rejected' ? colors.danger + '12' : step.status === 'pending' ? colors.orange + '18' : colors.coolMuted }]}><Text style={[styles.inlineStatusText, { color: stepMeta.color }]}>{stepMeta.label}</Text></View>
            </View>;
          })}
          {record.steps.some((step) => step.note) ? <View style={styles.noteBox}><Text style={styles.noteLabel}>Decision note</Text>{record.steps.filter((step) => step.note).map((step) => <Text key={step.order} style={styles.detailText}>• {step.label}: {step.note}</Text>)}</View> : null}
          {record.canAct ? <View style={styles.detailActions}><Pressable disabled={busy} onPress={() => onDecision('approve')} style={[styles.detailAction, { backgroundColor: busy ? colors.coolMuted : colors.primary }]}><CheckCircle2 size={17} color={busy ? colors.coolText3 : '#fff'} /><Text style={[styles.detailActionText, { color: busy ? colors.coolText3 : '#fff' }]}>Approve</Text></Pressable><Pressable disabled={busy} onPress={() => onDecision('reject')} style={[styles.detailAction, styles.detailReject]}><XCircle size={17} color={colors.danger} /><Text style={[styles.detailActionText, { color: colors.danger }]}>Reject</Text></Pressable></View> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function Inbox() {
  const showToast = useUiStore((state) => state.showToast);
  const [rows, setRows] = useState<Approval[] | null>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('all');
  const [selected, setSelected] = useState<Approval | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    listApprovals('all').then((response) => {
      setRows(response.items ?? []);
      setLoadError(false);
    }).catch(() => {
      setRows([]);
      setLoadError(true);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));
  const filteredRows = rows?.filter((row) => filter === 'all' || row.status === filter) ?? [];

  const decide = (record: Approval, action: 'approve' | 'reject') => {
    const message = action === 'approve' ? 'Approve this request?' : 'Reject this request?';
    Alert.alert(message, record.title, [{ text: 'Cancel', style: 'cancel' }, { text: action === 'approve' ? 'Approve' : 'Reject', style: action === 'reject' ? 'destructive' : 'default', onPress: () => submitDecision(record, action) }]);
  };

  const submitDecision = (record: Approval, action: 'approve' | 'reject') => {
    setBusyId(record.id);
    updateApprovalDecision(record.id, action).then((updated) => {
      setRows((current) => current ? current.map((item) => item.id === updated.id ? updated : item) : current);
      setSelected((current) => (current && current.id === updated.id ? updated : current));
      showToast(action === 'approve' ? 'Approval recorded' : 'Request rejected');
    }).catch(() => showToast('Could not record the decision')).finally(() => setBusyId(null));
  };

  if (rows === null) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  return <>
    <ScrollView contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((key) => <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipActive]}><Text style={[styles.filterChipText, filter === key && styles.filterChipTextActive]}>{key === 'all' ? 'All requests' : statusMeta(key).label}</Text></Pressable>)}
      </ScrollView>
      {filteredRows.length ? filteredRows.map((record) => <ApprovalRow key={record.id} record={record} onPress={() => setSelected(record)} />) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><CheckCircle2 size={34} color={colors.primary} /></View>
          <Text style={styles.heading}>{loadError ? 'Something went wrong' : 'No approval requests'}</Text>
          <Text style={styles.subheading}>{loadError ? 'We could not load your approvals right now. Please try again.' : filter === 'all' ? 'There are currently no approval requests assigned to you.' : `There are no ${statusMeta(filter).label.toLowerCase()} approval requests at the moment.`}</Text>
        </View>
      )}
    </ScrollView>
    <ApprovalDetail record={selected} visible={!!selected} busy={busyId === selected?.id} onClose={() => setSelected(null)} onDecision={(action) => selected && decide(selected, action)} />
  </>;
}

export default function ApprovalsScreen() {
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Approvals</Text>
        <Text style={styles.headerSubtitle}>Requests and pending decisions</Text>
      </View>
      <Pressable onPress={() => router.push('/approval/new')} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Create new approval request">
        <Plus size={19} color="#fff" strokeWidth={2.6} />
        <Text style={styles.addButtonText}>New request</Text>
      </Pressable>
    </View>
    <Inbox />
  </SafeAreaView>;
}

const styles = {
  screen: { flex: 1, backgroundColor: colors.coolBg },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, backgroundColor: colors.card },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 24, fontWeight: '800' as const },
  headerSubtitle: { color: colors.coolText, fontSize: 12.5, marginTop: 3 },
  addButton: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 40, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.primary },
  addButtonText: { color: '#fff', fontSize: 12.5, fontWeight: '800' as const },
  content: { padding: 16, paddingBottom: 36, gap: 14 },
  intro: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 4 },
  introIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primarySoft },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' as const },
  subheading: { color: colors.coolText, fontSize: 12.5, marginTop: 3 },
  summaryWrap: { flexDirection: 'row' as const, gap: 10 },
  summaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, padding: 12, gap: 4 },
  summaryTitle: { color: colors.coolText, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  summaryDetail: { color: colors.ink, fontSize: 15, fontWeight: '800' as const },
  sectionHeading: { gap: 3, paddingHorizontal: 2 },
  hierarchyHeading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 2 },
  sectionCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 18, padding: 16, gap: 10 },
  sectionHint: { color: colors.coolText, fontSize: 12, lineHeight: 17 },
  stepBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.primarySoft },
  stepBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' as const },
  label: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const, marginTop: 2 },
  required: { color: colors.danger },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 13, minHeight: 48, paddingHorizontal: 13, color: colors.ink, fontSize: 14 },
  multiline: { minHeight: 112, paddingTop: 12 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' as const, marginTop: 7 },
  select: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.card, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  selectText: { color: colors.ink, fontSize: 14, flex: 1, marginRight: 8 },
  placeholder: { color: colors.coolText3 },
  primaryButton: { height: 52, borderRadius: 15, flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primary, marginTop: 2, shadowColor: colors.primaryDark, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' as const },
  footerHint: { color: colors.coolText, fontSize: 11.5, lineHeight: 17, textAlign: 'center' as const, paddingHorizontal: 20 },
  filterBar: { gap: 8, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 13, height: 34, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.coolText, fontSize: 12, fontWeight: '700' as const },
  filterChipTextActive: { color: '#fff' },
  approvalRow: { minHeight: 78, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primarySoft },
  avatarBadge: { backgroundColor: colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: colors.primary, fontWeight: '800' as const },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowMeta: { color: colors.coolText, fontSize: 11.5 },
  rowMetaMuted: { color: colors.coolText3, fontSize: 10.5 },
  rowRight: { alignItems: 'flex-end' as const, gap: 5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10.5, fontWeight: '800' as const },
  emptyState: { alignItems: 'center' as const, paddingTop: 48 },
  detailBackdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(12,14,20,0.45)' },
  detailSheet: { maxHeight: '88%' as const, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
  detailHandle: { alignSelf: 'center' as const, width: 38, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider, marginBottom: 8 },
  detailHeader: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.coolDivider },
  detailHeaderInfo: { flex: 1, paddingRight: 8 },
  detailTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' as const },
  detailSubtitle: { color: colors.coolText, fontSize: 12.5, marginTop: 4 },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.coolMuted },
  detailContent: { padding: 18, gap: 13, paddingBottom: 30 },
  detailSummaryCard: { backgroundColor: colors.coolBg, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, padding: 10 },
  detailSummaryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  detailSummaryItem: { flex: 1, gap: 6 },
  summaryLabel: { color: colors.coolText, fontSize: 10.5, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  summaryValue: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const },
  detailStatus: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  detailDate: { color: colors.coolText, fontSize: 11.5 },
  detailSectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' as const, marginTop: 3 },
  detailText: { color: colors.coolText, fontSize: 13.5, lineHeight: 20 },
  hierarchyRow: { minHeight: 42, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.coolDivider },
  hierarchyDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primarySoft },
  hierarchyLabel: { color: colors.coolText, fontSize: 12, width: 104 },
  hierarchyValue: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const, flex: 1, textAlign: 'right' as const },
  inlineStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: 6 },
  inlineStatusText: { fontSize: 9.5, fontWeight: '800' as const },
  noteBox: { padding: 12, borderRadius: 13, backgroundColor: colors.coolBg, gap: 5 },
  noteLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' as const },
  detailActions: { flexDirection: 'row' as const, gap: 8, marginTop: 2 },
  detailAction: { flex: 1, height: 46, borderRadius: 13, flexDirection: 'row' as const, gap: 7, alignItems: 'center' as const, justifyContent: 'center' as const },
  detailReject: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '0D' },
  detailActionText: { fontSize: 13, fontWeight: '800' as const },
  primaryButtonDisabled: { opacity: 0.5 },
  requestCard: { backgroundColor: colors.card, borderRadius: 15, borderWidth: 1, borderColor: colors.coolDivider, padding: 14, gap: 7 },
  cardTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  cardTitle: { color: colors.ink, fontSize: 14.5, fontWeight: '800' as const },
  cardDate: { color: colors.coolText, fontSize: 11.5 },
  cardStrong: { color: colors.ink, fontSize: 13, fontWeight: '600' as const },
  cardReason: { color: colors.coolText, fontSize: 12.5 },
  actions: { flexDirection: 'row' as const, gap: 8, marginTop: 3 },
  actionButton: { flex: 1, height: 42, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const },
  rejectButton: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '0D' },
  actionText: { fontSize: 13, fontWeight: '800' as const },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primarySoft, marginBottom: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' as const, padding: 24 },
  optionSheet: { backgroundColor: colors.card, borderRadius: 20, padding: 18 },
  sheetTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' as const, marginBottom: 8 },
  searchBox: { minHeight: 42, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 12, marginBottom: 8, borderRadius: 12, backgroundColor: colors.coolMuted },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, paddingVertical: 9 },
  option: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderBottomWidth: 1, borderBottomColor: colors.coolDivider },
  optionText: { color: colors.ink, fontSize: 14 },
  emptyOption: { color: colors.coolText, paddingVertical: 18, textAlign: 'center' as const },
};
