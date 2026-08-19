export type ModuleKey =
  | 'crm' | 'accounts' | 'pl' | 'hr' | 'payables' | 'receivables' | 'inventory';
  // ('bankcash', 'acct', 'sales' and 'bookings' lived here for the alert channels of the same
  // names, all retired 2026-08-19 when those reports moved into the branch group chats.
  // 'payables'/'receivables' stay — they are ordinary business modules, older than the alert
  // families that borrowed their names.)

export type BizStatus = 'active' | 'setup';

export interface ModuleDef {
  key: ModuleKey;
  name: string;
  icon: string;
  color: string;
  tint: string;
  description: string;
}

export interface Group {
  id: string;
  name: string;
  icon: string;
  color: string;
  preview?: string;
  unread?: number;
}

export interface Branch {
  id: string;
  companyId?: string;    // owning business id (real CRM data); mock branches set it too
  code: string;          // e.g. 'AMD'
  city: string;
  country: string;
  flag: string;
  tz: string;            // IANA
  lat: number;
  lng: number;
  radius: number;        // geofence radius in metres
  wifi: string;          // office SSID
  color: string;
  groupCount?: number;
  memberCount?: number;
  unread?: number;
  groups: Group[];
}

export interface Department {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Business {
  id: string;            // e.g. 'tk'
  code: string;          // e.g. 'TK'
  name: string;
  industry?: string;
  shortInd?: string;
  color: string;
  tint?: string;
  branches: number;
  users?: number;
  status: BizStatus;
  unread?: number;
  active?: boolean;
}

export interface SystemAlertChannel {
  id: string;            // `${bizId}_${module}`
  bizId: string;
  module: ModuleKey;
}
