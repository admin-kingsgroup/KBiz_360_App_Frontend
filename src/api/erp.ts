import { apiFetch } from './client';

// ERP approvals in the app (owner, 2026-10-07). Every call goes to THIS app's backend under
// /api/erp, which forwards it to the ERP's app door as the signed-in user — the phone never holds
// an ERP login, and the laptop ERP session is never touched. The ERP answers {success, data}.

type Envelope<T> = { success?: boolean; data: T };
const unwrap = <T>(p: Promise<Envelope<T>>): Promise<T> => p.then((r) => (r && 'data' in r ? r.data : (r as unknown as T)));
const qs = (params: Record<string, string | undefined>): string => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${new URLSearchParams(pairs as Array<[string, string]>).toString()}` : '';
};

/** The person as the ERP sees them (role and branch scope come from their Books grant). */
export interface ErpMe { id: string; email: string; name?: string; role: string; branches: string[]; allBranches: boolean; viewOnly: boolean }

export type ErpStage = 'check' | 'verify' | 'director' | 'owner' | 'approve' | '';

/** One waiting entry from the ERP's Pending Work feed (vouchers and SO/PO/GP folders alike). */
export interface ErpPendingEntry {
  id: string; ref: string; title: string; sub?: string; amount?: number; currency?: string; days?: number;
  stage: ErpStage; kind: 'voucher' | 'file'; type: string; branch: string; actionBranch: string;
  pipeline?: string; due?: string; dueStatus?: string;
}
export interface ErpApprovalsItem { key: string; n: number; stages?: { check?: number; verify?: number; approve?: number }; entries?: ErpPendingEntry[]; entriesTotal?: number }
export interface ErpPendingWork {
  asOf?: string;
  branches: Array<{ branch: string; currency?: string; cards: Array<{ key: string; items?: ErpApprovalsItem[] }> }>;
}

/** What opening an entry shows: the stamps that decide the button, and the would-be journal. */
export interface ErpEntryDetail {
  id: string; number: string; type: string; branch: string; date?: string; party?: string; narration?: string;
  reviewStage: ErpStage; actionBranch?: string; approvalBranch?: string;
  submittedBy?: string; checkedBy?: string; checkedAt?: string; verifiedBy?: string; verifiedAt?: string;
  status?: string; approvalNeedsFx?: boolean;
}
export interface ErpJournal {
  postings: Array<{ ledger: string; debit?: number; credit?: number; narration?: string }>;
  totalDebit?: number; totalCredit?: number; balanced?: boolean;
}

export interface ErpChangeRequest {
  _id: string; type: string; branch: string; status: string; createdAt?: string;
  maker?: { userId?: string; name?: string; role?: string };
  payload?: { before?: unknown; after?: unknown; summary?: string; reason?: string; [k: string]: unknown };
  chain?: Array<{ order?: number; role: string; label?: string }>;
  approvals?: Array<{ role: string; by?: string; at?: string; skipped?: boolean }>;
}
export interface ErpLeaveApplication {
  id: string; name: string; branch?: string; from: string; to: string; days?: number; dayType?: string;
  reason?: string; kind?: string; waitingOn?: string; checkIn?: string; checkOut?: string;
  turn?: { allowed?: boolean; why?: string; past?: string[] }; canReject?: boolean;
}
export interface ErpCreditRequest {
  id: string; status: string; op?: string; kind?: string; branch?: string; name?: string; counterparty?: string;
  currency?: string; limit?: number; creditDays?: number; maker?: { name?: string } | string; waitingFor?: string; yourTurn?: boolean;
}
export interface ErpCloseRow { branch: string; label?: string; from?: string; upTo?: string; status: string; months?: number }

export const erpApi = {
  status: (): Promise<{ configured: boolean }> => apiFetch('/api/erp/status'),
  me: (): Promise<ErpMe> => unwrap(apiFetch('/api/erp/auth/whoami')),
  /** An app-config list ("approval.verifyEmails" …); an unset key reads as []. */
  configList: (key: string): Promise<string[]> =>
    apiFetch<{ success?: boolean; data?: { value?: unknown } }>(`/api/erp/app-config/${key}`)
      .then((r) => (Array.isArray(r?.data?.value) ? (r.data!.value as unknown[]).map((x) => String(x).toLowerCase().trim()) : []))
      .catch(() => []),
  pendingWork: (branch?: string): Promise<ErpPendingWork> => unwrap(apiFetch(`/api/erp/pending-work/approvals${qs({ branch })}`)),

  entry: (kind: 'voucher' | 'file', id: string): Promise<Record<string, unknown>> =>
    unwrap(apiFetch(`/api/erp/${kind === 'file' ? 'booking-orders' : 'vouchers'}/${id}`)),
  journal: (kind: 'voucher' | 'file', id: string): Promise<ErpJournal> =>
    unwrap(apiFetch(`/api/erp/${kind === 'file' ? 'booking-orders' : 'vouchers'}/${id}/journal`)),
  /** check / verify / director / owner — no books impact. `branch` = the entry's acting branch. */
  review: (kind: 'voucher' | 'file', id: string, action: string, branch?: string): Promise<unknown> =>
    unwrap(apiFetch(`/api/erp/${kind === 'file' ? 'booking-orders' : 'vouchers'}/${id}/review${qs({ branch })}`, { method: 'POST', body: { action } })),
  /** Final approve — posts the journal. */
  approve: (kind: 'voucher' | 'file', id: string, branch?: string): Promise<unknown> =>
    unwrap(apiFetch(`/api/erp/${kind === 'file' ? 'booking-orders' : 'vouchers'}/${id}/approve${qs({ branch })}`, { method: 'POST', body: {} })),
  reject: (kind: 'voucher' | 'file', id: string, reason: string, branch?: string): Promise<unknown> =>
    unwrap(apiFetch(`/api/erp/${kind === 'file' ? 'booking-orders' : 'vouchers'}/${id}/reject${qs({ branch })}`, { method: 'POST', body: { reason } })),

  changeRequests: (): Promise<ErpChangeRequest[]> =>
    unwrap(apiFetch<Envelope<ErpChangeRequest[] | { items?: ErpChangeRequest[] }>>('/api/erp/tk/change-requests?status=pending'))
      .then((d) => (Array.isArray(d) ? d : d?.items ?? [])),
  actChangeRequest: (id: string, action: 'approve' | 'reject' | 'send_back', reason: string, actingBranch: string): Promise<unknown> =>
    unwrap(apiFetch(`/api/erp/tk/change-requests/${id}/act`, { method: 'POST', body: { action, reason, actingBranch } })),

  leaveApplications: (branch?: string): Promise<ErpLeaveApplication[]> =>
    unwrap(apiFetch<Envelope<{ applications?: ErpLeaveApplication[] } | ErpLeaveApplication[]>>(`/api/erp/hr/employees/leave-applications${qs({ status: 'pending', branch })}`))
      .then((d) => (Array.isArray(d) ? d : d?.applications ?? [])),
  decideLeave: (id: string, decision: 'approve' | 'reject', note: string): Promise<unknown> =>
    unwrap(apiFetch(`/api/erp/hr/employees/leave-applications/${id}/${decision}`, { method: 'PUT', body: decision === 'approve' ? { note, reason: note } : { note } })),

  creditRequests: (branch?: string): Promise<ErpCreditRequest[]> =>
    unwrap(apiFetch<Envelope<ErpCreditRequest[] | { requests?: ErpCreditRequest[]; items?: ErpCreditRequest[] }>>(`/api/erp/credit-facilities/requests${qs({ status: 'pending', branch })}`))
      .then((d) => (Array.isArray(d) ? d : d?.requests ?? d?.items ?? [])),
  closeBoard: (): Promise<ErpCloseRow[]> =>
    unwrap(apiFetch<Envelope<ErpCloseRow[] | { rows?: ErpCloseRow[] }>>('/api/erp/reconciliation/close/board'))
      .then((d) => (Array.isArray(d) ? d : d?.rows ?? [])),
};
