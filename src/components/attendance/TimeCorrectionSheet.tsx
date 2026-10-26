import { useCallback, useEffect, useRef, useState } from 'react';
import { RegularizeSheet } from './RegularizeSheet';
import type { DayTimesTarget } from './DayTimesSheet';
import { DaySheet } from '../forms/DaySheet';
import { getAttendanceHistory, type AttendanceHistoryEntry } from '../../api/attendance';
import { requestRegularization } from '../../api/hr';
import { ApiError } from '../../api/client';
import { localDayKey } from '../../logic/attendanceEdit';
import { spanCount } from '../../logic/leave';
import { useUiStore } from '../../store/uiStore';

// A correction may be asked for any past day — no look-back limit (owner 2026-10-12). The picker
// still needs a floor; this one is only there to stop the month arrows.
const EARLIEST_DAY = '2000-01-01';
// Punches loaded when the sheet opens; a day picked further back loads its own reach.
const PRELOAD_DAYS = 63;

const dateLabel = (key: string): string => {
  const d = new Date(key + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
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
    getAttendanceHistory(PRELOAD_DAYS)
      .then((h) => {
        if (!active) return;
        history.current = h;
        // Re-seed the open day only if it now has a record (keeps the default times otherwise).
        setTarget((t) => (t && h.some((x) => x.date === t.date) ? targetFor(t.date) : t));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [visible, targetFor]);

  const send = (body: { checkInAt: string; checkOutAt: string | null; reason: string }): void => {
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

  // A picked day older than what is loaded: load back to it, so it too starts from its real punches.
  const pickDay = (day: string): void => {
    setPicking(false);
    setTarget(targetFor(day));
    const loaded = history.current;
    if (!loaded.length || day >= loaded[loaded.length - 1].date) return;
    getAttendanceHistory(spanCount(day, localDayKey(new Date())))
      .then((h) => {
        history.current = h;
        setTarget((t) => (t && t.date === day && h.some((x) => x.date === day) ? targetFor(day) : t));
      })
      .catch(() => undefined);
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
        minDay={EARLIEST_DAY}
        maxDay={today}
        onClose={() => setPicking(false)}
        onConfirm={pickDay}
      />
    </RegularizeSheet>
  );
}
