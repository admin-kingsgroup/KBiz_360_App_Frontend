import { HOME_TITLE, homeMine, homeRowLabel, homeRows, splitHome } from '../logic/erpApprovalHome';

// Owner, 2026-11-19: "a lot of extra stuff". Approvals opens on ONE list of the ERP's sections — the branch chips, the tab
// strip and the "Waiting on me" doors said the same thing three times. The sections and their order stay the ERP's.
const none = { approver: false, entries: 0, margin: 0, edits: 0, entryRequests: 0, payRequests: 0, hrRequests: 0, setupRequests: 0, credit: 0, leave: 0, close: 0, move: 0, review: 0 };

describe('the Approvals home lists the ERP sections once', () => {
  it('keeps the ERP order, without a Waiting on me row', () => {
    expect(homeRows({ mine: {}, waiting: {}, owner: false }).map((r) => r.title)).toEqual(['Entries', 'Pay & Credit', 'HR & Payroll', 'Setup', 'Close', 'Status', 'Raise & Resolve']);
  });
  it('adds Review for the Owner, and App requests last while one is waiting', () => {
    expect(homeRows({ mine: { app: 2 }, waiting: {}, owner: true, app: true }).map((r) => r.key).slice(-2)).toEqual(['review', 'app']);
    expect(homeRows({ mine: { app: 2 }, waiting: {}, owner: false, app: true }).map((r) => r.key)).not.toContain('review');
    expect(HOME_TITLE.app).toBe('App requests');
  });
  it('has no App requests row when none is waiting, or when the screen does not offer them', () => {
    expect(homeRows({ mine: {}, waiting: {}, owner: true, app: true }).map((r) => r.key)).not.toContain('app');
    expect(homeRows({ mine: { app: 0 }, waiting: { app: 0 }, owner: true, app: true }).map((r) => r.key)).not.toContain('app');
    expect(homeRows({ mine: { app: 3 }, waiting: {}, owner: true }).map((r) => r.key)).not.toContain('app');
  });
  it('gives every row a short line saying what is inside', () => {
    for (const r of homeRows({ mine: { app: 1 }, waiting: {}, owner: true, app: true })) {
      expect(r.hint.length).toBeGreaterThan(5);
      expect(r.hint.length).toBeLessThanOrEqual(36);
    }
  });
  it('a section whose read failed carries no figure, never a 0', () => {
    const close = homeRows({ mine: {}, waiting: { close: null, entries: 0 }, owner: false }).find((r) => r.key === 'close');
    expect(close?.waiting).toBeNull();
  });
});

describe('what needs me', () => {
  it('counts the entries queue only for someone who approves entries', () => {
    expect(homeMine({ ...none, approver: true, entries: 30, margin: 4, edits: 3 }).entries).toBe(37);
    expect(homeMine({ ...none, approver: false, entries: 30, margin: 4, edits: 3 }).entries).toBe(0);
  });
  it('adds the requests at my step to the section that lists them', () => {
    const m = homeMine({ ...none, approver: true, entries: 2, entryRequests: 1, payRequests: 2, credit: 1, hrRequests: 1, leave: 16, setupRequests: 3, close: 4, move: 2, review: 5 });
    expect(m).toMatchObject({ entries: 3, pay: 3, hr: 17, setup: 3, close: 4, status: 0, rr: 2, review: 5, app: 0 });
  });
  it('splits the rows into what needs me and the rest, each row once', () => {
    const rows = homeRows({ mine: { entries: 37, hr: 16, close: 4 }, waiting: { entries: 38, status: 25 }, owner: false });
    const { needsMe, rest } = splitHome(rows);
    expect(needsMe.map((r) => r.key)).toEqual(['entries', 'hr', 'close']);
    expect(rest.map((r) => r.key)).toEqual(['pay', 'setup', 'status', 'rr']);
    expect(needsMe.length + rest.length).toBe(rows.length);
  });
  it('reads a row out with its number and what the number means', () => {
    const [entries, pay, , setup] = homeRows({ mine: { entries: 37 }, waiting: { entries: 38, pay: 2, setup: 0 }, owner: false });
    expect(homeRowLabel(entries)).toBe('Entries, 37 need you');
    expect(homeRowLabel({ ...entries, mine: 1 })).toBe('Entries, 1 needs you');
    expect(homeRowLabel(pay)).toBe('Pay & Credit, 2 waiting on others');
    expect(homeRowLabel(setup)).toBe('Setup, nothing waiting');
  });
});
