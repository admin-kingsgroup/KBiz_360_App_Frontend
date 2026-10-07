import { isWeekOffEntry } from '../logic/attendance';

// History rows: the backend's `weekOff` (HR policy) wins; without it, Sunday is the week off.
describe('isWeekOffEntry', () => {
  it('trusts the backend flag when present', () => {
    expect(isWeekOffEntry({ date: '2026-10-04', weekOff: false })).toBe(false); // Sunday, but HR says working
    expect(isWeekOffEntry({ date: '2026-10-03', weekOff: true })).toBe(true); // Saturday off under policy
  });
  it('falls back to Sunday when the backend does not send it', () => {
    expect(isWeekOffEntry({ date: '2026-10-04' })).toBe(true); // Sun
    expect(isWeekOffEntry({ date: '2026-10-02', weekOff: null })).toBe(false); // Fri
    expect(isWeekOffEntry({ date: '2026-10-05' })).toBe(false); // Mon
  });
});
