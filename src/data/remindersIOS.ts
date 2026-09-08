// Row/list shapes for the iOS-style Reminders redesign. These are DISPLAY shapes: the screen maps
// real API reminders (src/api/reminders) + the real CRM directory (businesses/branches) into them.
// `day` is a due-date day-offset from today, derived from the reminder's dueAt.

export interface IOSSubtask {
  id: number;
  t: string;
  done: boolean;
}

export interface IOSReminder {
  id: string; // real reminder id
  list: string; // business (company) id
  branch: string; // branch CODE, '' = no branch
  title: string;
  notes: string;
  day: number; // due date as day-offset from today
  time: string; // '3:00 PM' | ''
  flag: boolean;
  prio: number; // 0–2 → '', '!', '!!'
  done: boolean;
  assignedTo?: string;
  assignedBy?: string;
  tags: string[];
  subs: IOSSubtask[];
}

export interface IOSBusiness {
  id: string;
  name: string;
  code: string;
  color: string;
  branches: string[]; // branch codes
}
