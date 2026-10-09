import { useCallback, useEffect, useRef, useState } from 'react';
import { RegularizeSheet } from './RegularizeSheet';
import type { DayTimesTarget } from './DayTimesSheet';
import { DaySheet } from '../forms/DaySheet';
import { getAttendanceHistory, type AttendanceHistoryEntry } from '../../api/attendance';
import { requestRegularization } from '../../api/hr';
import { ApiError } from '../../api/client';
import { localDayKey } from '../../logic/attendanceEdit';
import { shiftDay } from '../../logic/leave';
import { useUiStore } from '../../store/uiStore';

// The server takes a correction for today and up to this many days back (regularization.service
// REGULARIZE_BACK_DAYS); the picker offers the same window so a choice can never bounce.
const BACK_DAYS = 62;

const dateLabel = (key: string): string => {
  const d = new Date(key + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

// "Time correction" from anywhere (the Profile quick action): the same request sheet the
// Attendance history uses, plus a DATE field, so the person picks the day in the sheet instead of
// hunting for it in a list. The times start from what is recorded for that day, when anything is.
export function TimeCorrectionSheet({ visible, onClose, onSent }: { visible: boolean; onClose: () => void; onSent?: () => void }) {
  const showToast = useUiStore((s) => s.showToast);
  const [target, setTarget] = useState<DayTimesTarget | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const history = useRef<AttendanceHistoryEntry[]>([]);

  const targetFor = useCallback((date: string): DayTimesTarget => {
    const e = history.current.find((h) => h.date === date);
    return e ? { date, inTime: e.inTime, outTime: e.outTime, via: e.via } : { date, inTime: null, outTime: null };
  }, []);

  // Open on today; fetch the recorded days so a picked day starts from its real punches.
  useEffect(() => {
    if (!visible) { setTarget(null); setPicking(false); return; }
    const today = localDayKey(new Date());
    setTarget(targetFor(today));
    let active = true;
    getAttendanceHistory(BACK_DAYS + 1)
      .then((h) => {
        if (!active) return;
        history.current = h;
        // Re-seed the open day only if it now has a record (keeps the default times otherwise).
        setTarget((t) => (t && h.some((x) => x.date === t.date) ? targetFor(t.date) : t));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [visible, targetFor]);

  const send = (body: { checkInAt: string; checkOutAt: string; reason: string }): void => {
    if (!target) return;
    setSaving(true);
    requestRegularization({ date: target.date, ...body })
      .then(() => {
        showToast('Request sent — it is on the ERP (Approvals ▸ Leave) and with the Super Admin');
        onClose();
        onSent?.();
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not send the request'))
      .finally(() => setSaving(false));
  };

  const today = localDayKey(new Date());
  // The day picker is a CHILD of the sheet so its Modal opens on top of the sheet's (Android).
  return (
    <RegularizeSheet
      target={visible ? target : null}
      dateLabel={target ? dateLabel(target.date) : ''}
      saving={saving}
      onClose={onClose}
      onSave={send}
      onChangeDate={() => setPicking(true)}
    >
      <DaySheet
        visible={visible && picking}
        title="Which day needs a correction?"
        initial={target?.date ?? today}
        minDay={shiftDay(today, -BACK_DAYS)}
        maxDay={today}
        onClose={() => setPicking(false)}
        onConfirm={(day) => { setPicking(false); setTarget(targetFor(day)); }}
      />
    </RegularizeSheet>
  );
}
