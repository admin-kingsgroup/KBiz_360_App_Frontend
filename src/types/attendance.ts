export type PunchMethod = 'Wi-Fi' | 'Geofence' | 'Face' | 'Auto' | 'Manual'; // Manual = admin correction

export interface AttendanceRecord {
  inTime: Date | null;
  outTime: Date | null;
  via: PunchMethod | null;
}

export interface OfficeGeo {
  lat: number;
  lng: number;
  radius: number;
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface OfficePresence {
  distance: number | null;
  inside: boolean;
  wifiOn: boolean; // device is on this office's configured Wi-Fi
  wifiConfigured: boolean; // office has a Wi-Fi SSID configured (the strict Wi-Fi+geofence rule applies)
  present: boolean;
  viaNow: '' | 'Wi-Fi' | 'Geofence';
}

export interface TeamAttendanceEntry {
  id: string;
  name: string;
  initials: string;
  color: string;
  branch: string;
  branchId: string;          // WORKING branch id: explicit assignment → first CRM access branch
  workBranchId?: string | null; // explicit working-branch assignment (null = derived from access)
  position?: string | null;  // job title (kb360_app), shown under the name
  office: string | null;     // resolved office name the person reports at
  officeId: string | null;   // explicit assignment id (null = on the branch default)
  in: string | null;
  out: string | null;
  via?: PunchMethod;
}
