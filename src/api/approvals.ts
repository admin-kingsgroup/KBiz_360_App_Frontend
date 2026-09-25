import { apiFetch } from './client';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalStepStatus = 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped';
export type ApprovalStepKey = string | null;
export type ApprovalDecisionAction = 'approve' | 'reject';

export interface ApprovalPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
  avatar: string | null;
  position: string | null;
}

export interface ApproverCandidate extends ApprovalPerson {
  email: string | null;
  role: string | null;
  level: number;
  branches: string[];
}

export interface ApprovalApprover {
  approver: ApprovalPerson;
  status: ApprovalStepStatus;
  decidedAt: string | null;
  note: string;
}

export interface ApprovalLevel {
  order: number;
  key: string | null;
  label: string;
  mode: 'all' | 'any';
  status: ApprovalStepStatus;
  isCurrent: boolean;
  decidedAt: string | null;
  approvedCount: number;
  requiredCount: number;
  approvers: ApprovalApprover[];
}

export interface ApprovalStep {
  order: number;
  level?: number;
  key: string | null;
  label: string;
  approver: ApprovalPerson;
  status: ApprovalStepStatus;
  isCurrent: boolean;
  decidedAt: string | null;
  note: string;
}

export interface Approval {
  id: string;
  title: string;
  details: string;
  category: string;
  status: ApprovalStatus;
  submittedAt: string;
  decidedAt: string | null;
  requester: ApprovalPerson;
  totalLevels?: number;
  currentLevel?: number | null;
  currentApprovers?: ApprovalPerson[];
  levels?: ApprovalLevel[];
  // legacy fields
  totalSteps?: number;
  currentStep?: number | null;
  currentApprover?: ApprovalPerson | null;
  steps: ApprovalStep[];
  isMine: boolean;
  canAct: boolean;
  canCancel: boolean;
  myDecision: 'approved' | 'rejected' | null;
}

export interface ApprovalHierarchyCandidate extends ApprovalPerson {}

export interface ApprovalHierarchyStep {
  order: number;
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultApproverId?: string | null;
  candidates: ApprovalHierarchyCandidate[];
}

export interface ApprovalHierarchyResponse {
  levels?: {
    min: number;
    max: number;
    maxApproversPerLevel: number;
    labelMaxLength: number;
    modes: ('all' | 'any')[];
    defaultMode: 'all' | 'any';
  };
  approvers?: ApproverCandidate[];
  suggestedLevels?: Array<{
    order: number;
    label: string;
    mode: 'all' | 'any';
    approverIds: string[];
    candidateIds: string[];
  }>;
  totalSteps?: number;
  steps?: ApprovalHierarchyStep[];
  categories?: string[];
  limits?: {
    title: number;
    details: number;
    note: number;
    label?: number;
    levels?: number;
    approversPerLevel?: number;
  };
}

export interface ApprovalLevelInput {
  label?: string;
  mode?: 'all' | 'any';
  approverIds: string[];
}

export interface ApprovalCreateRequest {
  title: string;
  details: string;
  category?: string;
  levels?: ApprovalLevelInput[];
  approvers?: Array<{ step: string; userId: string }>;
}

export interface ApprovalListResponse {
  scope: 'all' | 'mine' | 'assigned' | 'actionable';
  status: ApprovalStatus | null;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  counts: Record<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'actionable', number>;
  items: Approval[];
}

export interface ApproverSearchResponse {
  total: number;
  items: ApproverCandidate[];
}

export const getApprovalHierarchy = (): Promise<ApprovalHierarchyResponse> =>
  apiFetch('/api/approvals/hierarchy');

export const getApprovalApprovers = (q?: string, limit: number = 200): Promise<ApproverSearchResponse> => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (limit) params.set('limit', String(limit));
  return apiFetch(`/api/approvals/approvers?${params.toString()}`);
};

export const submitApprovalRequest = (body: ApprovalCreateRequest): Promise<Approval> =>
  apiFetch('/api/approvals', { method: 'POST', body });

export const listApprovals = (scope: 'all' | 'mine' | 'assigned' | 'actionable' = 'all', status?: ApprovalStatus): Promise<ApprovalListResponse> => {
  const params = new URLSearchParams({ scope });
  if (status) params.set('status', status);
  return apiFetch(`/api/approvals?${params.toString()}`);
};

export const getApproval = (id: string): Promise<Approval> => apiFetch(`/api/approvals/${id}`);

export const updateApprovalDecision = (id: string, action: ApprovalDecisionAction, note?: string): Promise<Approval> =>
  apiFetch(`/api/approvals/${id}/decision`, { method: 'PUT', body: { action, ...(note ? { note } : {}) } });

export const cancelApproval = (id: string): Promise<Approval> =>
  apiFetch(`/api/approvals/${id}/cancel`, { method: 'PUT' });

export const getApprovalCounts = (): Promise<Record<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'actionable', number>> =>
  apiFetch('/api/approvals/counts');
