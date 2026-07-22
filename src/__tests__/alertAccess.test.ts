import { makeAccessFilters } from '../logic/accessFilters';
import { attendanceAlertChannels, financeAlertChannels, crmAlertChannels, salesInvoiceAlertChannels, receivablesAlertChannels, payablesAlertChannels, bookingsAlertChannels, acctAlertChannels, pulseChannels, pulseGroups, groupById, groupForChannel } from '../data/pulse';
import type { AccessControl } from '../types';

const restricted = (alerts: string[], branches: string[] = []): AccessControl => ({
  isSuper: false, role: 'EMPLOYEE', name: 'Test', bizIds: ['tk'], branches, groups: [], depts: [], alerts, canManage: false,
});

describe('system-alert access — branch channels', () => {
  it('defines the branch channels (attendance + finance + crm + sales + AR + AP) with matching grants', () => {
    expect(attendanceAlertChannels.map((c) => c.id)).toEqual(['tk_att_bom', 'tk_att_amd']);
    expect(financeAlertChannels.map((c) => c.id)).toEqual(['tk_fin_bom', 'tk_fin_amd']);
    expect(crmAlertChannels.map((c) => c.id)).toEqual(['tk_crm_bom', 'tk_crm_amd']);
    expect(salesInvoiceAlertChannels.map((c) => c.id)).toEqual(['tk_si_bom', 'tk_si_amd', 'tk_si_nbo', 'tk_si_dar', 'tk_si_fbm']);
    expect(receivablesAlertChannels.map((c) => c.id)).toEqual(['tk_ar_bom', 'tk_ar_amd', 'tk_ar_nbo', 'tk_ar_dar', 'tk_ar_fbm']);
    expect(payablesAlertChannels.map((c) => c.id)).toEqual(['tk_ap_bom', 'tk_ap_amd', 'tk_ap_nbo', 'tk_ap_dar', 'tk_ap_fbm']);
    expect(bookingsAlertChannels.map((c) => c.id)).toEqual(['tk_bkg_bom', 'tk_bkg_amd', 'tk_bkg_nbo', 'tk_bkg_dar', 'tk_bkg_fbm']);
    expect(acctAlertChannels.map((c) => c.id)).toEqual(['tk_acc_bom', 'tk_acc_amd', 'tk_acc_nbo', 'tk_acc_dar', 'tk_acc_fbm']);
    expect(pulseChannels.filter((c) => c.branch).map((c) => `${c.branch}-${c.module}`)).toEqual([
      'BOM-crm', 'AMD-crm', 'BOM-accounts', 'AMD-accounts',
      'BOM-sales', 'AMD-sales', 'NBO-sales', 'DAR-sales', 'FBM-sales',
      'BOM-receivables', 'AMD-receivables', 'NBO-receivables', 'DAR-receivables', 'FBM-receivables',
      'BOM-payables', 'AMD-payables', 'NBO-payables', 'DAR-payables', 'FBM-payables',
      'BOM-bookings', 'AMD-bookings', 'NBO-bookings', 'DAR-bookings', 'FBM-bookings',
      'BOM-acct', 'AMD-acct', 'NBO-acct', 'DAR-acct', 'FBM-acct',
      'BOM-hr', 'AMD-hr',
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

  it('a NBO-sales grant shows only the NBO Sales Invoice channel (Africa branches exist here)', () => {
    const f = makeAccessFilters(restricted(['NBO-sales']));
    expect(f.alertOK('NBO', 'sales')).toBe(true);
    expect(f.alertOK('BOM', 'sales')).toBe(false);
    expect(f.alertOK('NBO', 'accounts')).toBe(false); // sales grant never opens Finance
  });

  it('AR and AP grants are independent of each other and of Finance', () => {
    const f = makeAccessFilters(restricted(['DAR-receivables']));
    expect(f.alertOK('DAR', 'receivables')).toBe(true);
    expect(f.alertOK('DAR', 'payables')).toBe(false);
    expect(f.alertOK('DAR', 'accounts')).toBe(false);
    expect(f.alertOK('BOM', 'receivables')).toBe(false);
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

  it('groups collapse the 31 branch channels into 8 cards (5-branch families + BOM/AMD pairs)', () => {
    expect(pulseGroups.map((g) => g.name)).toEqual([
      'CRM', 'Finance', 'Sales Invoice', 'Clients Receivables / Onboarding', 'Supplier Payables / Onboarding', 'SO/PO/GP / INB', 'Accounts', 'Attendance',
    ]);
    expect(pulseGroups.map((g) => g.channels.length)).toEqual([2, 2, 5, 5, 5, 5, 5, 2]);
    for (const gid of ['grp_sales', 'grp_receivables', 'grp_payables', 'grp_bookings', 'grp_acct']) {
      expect(groupById(gid)?.channels.map((c) => c.branch)).toEqual(['BOM', 'AMD', 'NBO', 'DAR', 'FBM']);
    }
  });

  it('group ids can never collide with a backend channel id', () => {
    const channelIds = new Set([...pulseChannels.map((c) => c.id), 'user_alerts']);
    for (const g of pulseGroups) expect(channelIds.has(g.id)).toBe(false);
  });

  it('groupForChannel resolves a push deep link back to its group', () => {
    expect(groupForChannel('tk_att_bom')?.id).toBe('grp_hr');
    expect(groupForChannel('tk_fin_amd')?.id).toBe('grp_accounts');
    expect(groupForChannel('tk_crm_bom')?.id).toBe('grp_crm');
    expect(groupForChannel('tk_si_dar')?.id).toBe('grp_sales');
    expect(groupForChannel('tk_ar_nbo')?.id).toBe('grp_receivables');
    expect(groupForChannel('tk_ap_fbm')?.id).toBe('grp_payables');
    expect(groupForChannel('tk_bkg_amd')?.id).toBe('grp_bookings');
    expect(groupForChannel('tk_acc_dar')?.id).toBe('grp_acct');
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
