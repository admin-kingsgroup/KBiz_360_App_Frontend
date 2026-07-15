import { makeAccessFilters } from '../logic/accessFilters';
import { attendanceAlertChannels, financeAlertChannels, crmAlertChannels, pulseChannels, branchOf } from '../data/pulse';
import type { AccessControl } from '../types';

const restricted = (alerts: string[], branches: string[] = []): AccessControl => ({
  isSuper: false, role: 'EMPLOYEE', name: 'Test', bizIds: ['tk'], branches, groups: [], depts: [], alerts, canManage: false,
});

describe('system-alert access — branch channels', () => {
  it('defines the branch channels (attendance + finance + crm) with matching grants', () => {
    expect(attendanceAlertChannels.map((c) => c.id)).toEqual(['tk_att_bom', 'tk_att_amd']);
    expect(financeAlertChannels.map((c) => c.id)).toEqual(['tk_fin_bom', 'tk_fin_amd']);
    expect(crmAlertChannels.map((c) => c.id)).toEqual(['tk_crm_bom', 'tk_crm_amd']);
    expect(pulseChannels.filter((c) => c.branch).map((c) => `${c.branch}-${c.module}`)).toEqual([
      'BOM-crm', 'AMD-crm', 'BOM-accounts', 'AMD-accounts', 'BOM-hr', 'AMD-hr',
    ]);
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

  it('a BOM-accounts grant shows only the BOM finance channel; BOM-crm only CRM - BOM', () => {
    const fin = makeAccessFilters(restricted(['BOM-accounts']));
    expect(fin.alertOK('BOM', 'accounts')).toBe(true);
    expect(fin.alertOK('AMD', 'accounts')).toBe(false);
    expect(fin.alertOK('BOM', 'crm')).toBe(false);
    const crm = makeAccessFilters(restricted(['BOM-crm']));
    expect(crm.alertOK('BOM', 'crm')).toBe(true);
    expect(crm.alertOK('AMD', 'crm')).toBe(false);
  });

  it('attendance/finance/crm event contexts bucket into the right branch section', () => {
    const ev = { id: 'x', channelId: 'tk_att_bom', source: 'Attendance System', title: 't', body: 'b', context: 'TK BOM · Attendance', time: 1, read: false };
    expect(branchOf(ev)).toBe('bom');
    expect(branchOf({ ...ev, channelId: 'tk_fin_bom', context: 'TK BOM · Finance' })).toBe('bom');
    expect(branchOf({ ...ev, channelId: 'tk_crm_amd', context: 'TK AMD · CRM' })).toBe('amd');
  });
});
