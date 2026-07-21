import { makeAccessFilters } from '../logic/accessFilters';
import { attendanceAlertChannels, financeAlertChannels, crmAlertChannels, pulseChannels, pulseGroups, groupById, groupForChannel } from '../data/pulse';
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

});

// Home shows ONE card per module; the branch split moved to chips inside the detail screen.
// Grouping is presentation only — grants stay per branch, so a group must resolve to exactly the
// channels the viewer is granted, never to all of its branches.
describe('system-alert channel groups', () => {
  it('every branch channel belongs to exactly one group, and groups add none of their own', () => {
    const grouped = pulseGroups.flatMap((g) => g.channels.map((c) => c.id));
    expect([...grouped].sort()).toEqual(pulseChannels.filter((c) => c.branch).map((c) => c.id).sort());
    expect(new Set(grouped).size).toBe(grouped.length); // no channel in two groups
  });

  it('groups collapse the 6 branch channels into 3 cards', () => {
    expect(pulseGroups.map((g) => g.name)).toEqual(['CRM', 'Finance', 'Attendance']);
    expect(pulseGroups.map((g) => g.channels.length)).toEqual([2, 2, 2]);
  });

  it('group ids can never collide with a backend channel id', () => {
    const channelIds = new Set([...pulseChannels.map((c) => c.id), 'user_alerts']);
    for (const g of pulseGroups) expect(channelIds.has(g.id)).toBe(false);
  });

  it('groupForChannel resolves a push deep link back to its group', () => {
    expect(groupForChannel('tk_att_bom')?.id).toBe('grp_hr');
    expect(groupForChannel('tk_fin_amd')?.id).toBe('grp_accounts');
    expect(groupForChannel('tk_crm_bom')?.id).toBe('grp_crm');
    expect(groupForChannel('user_alerts')).toBeUndefined(); // personal channel — no group
    expect(groupForChannel('announcements')).toBeUndefined();
  });

  it('a BOM-hr grant opens the Attendance group as BOM ALONE (grouping never widens access)', () => {
    const f = makeAccessFilters(restricted(['BOM-hr']));
    const g = groupById('grp_hr');
    const mine = (g?.channels ?? []).filter((ch) => f.alertOK(ch.branch ?? null, ch.module));
    expect(mine.map((c) => c.id)).toEqual(['tk_att_bom']);
  });

  it('a super admin sees every branch of every group', () => {
    const f = makeAccessFilters(null);
    for (const g of pulseGroups) {
      expect(g.channels.filter((ch) => f.alertOK(ch.branch ?? null, ch.module))).toHaveLength(g.channels.length);
    }
  });
});
