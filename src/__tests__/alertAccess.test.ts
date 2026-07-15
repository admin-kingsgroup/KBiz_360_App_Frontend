import { makeAccessFilters } from '../logic/accessFilters';
import { attendanceAlertChannels, pulseChannels, branchOf } from '../data/pulse';
import type { AccessControl } from '../types';

const restricted = (alerts: string[], branches: string[] = []): AccessControl => ({
  isSuper: false, role: 'EMPLOYEE', name: 'Test', bizIds: ['tk'], branches, groups: [], depts: [], alerts, canManage: false,
});

describe('system-alert access — attendance channels', () => {
  it('defines the two branch attendance channels with matching grants', () => {
    const ids = attendanceAlertChannels.map((c) => c.id);
    expect(ids).toEqual(['tk_att_bom', 'tk_att_amd']);
    expect(pulseChannels.filter((c) => c.branch).map((c) => `${c.branch}-${c.module}`)).toEqual(['BOM-hr', 'AMD-hr']);
  });

  it('super admin sees every channel', () => {
    const f = makeAccessFilters(null);
    for (const ch of attendanceAlertChannels) expect(f.alertOK(ch.branch ?? null, ch.module)).toBe(true);
  });

  it('a BOM-hr grant shows only the BOM attendance channel', () => {
    const f = makeAccessFilters(restricted(['BOM-hr']));
    expect(f.alertOK('BOM', 'hr')).toBe(true);
    expect(f.alertOK('AMD', 'hr')).toBe(false);
    expect(f.alertOK(null, 'hr')).toBe(false); // no module-wide grant
  });

  it('alertBrOK surfaces a branch section from an alert grant alone', () => {
    const f = makeAccessFilters(restricted(['BOM-hr']));
    expect(f.alertBrOK('BOM')).toBe(true); // grant implies the section, even without the branch itself
    expect(f.alertBrOK('AMD')).toBe(false);
    const withBranch = makeAccessFilters(restricted([], ['AMD']));
    expect(withBranch.alertBrOK('AMD')).toBe(true); // plain branch access still works
  });

  it('attendance event contexts bucket into the right branch section', () => {
    const ev = { id: 'x', channelId: 'tk_att_bom', source: 'Attendance System', title: 't', body: 'b', context: 'TK BOM · Attendance', time: 1, read: false };
    expect(branchOf(ev)).toBe('bom');
  });
});
