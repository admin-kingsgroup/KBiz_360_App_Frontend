import { makeAccessFilters } from '../logic/accessFilters';
import { financeAlertChannels, crmAlertChannels, salesInvoiceAlertChannels, bookingsAlertChannels, acctAlertChannels, pulseChannels, pulseGroups, groupById, groupForChannel, channelById, FINANCE_ALERTS_ENABLED, CRM_ALERTS_ENABLED } from '../data/pulse';
import type { AccessControl } from '../types';

const restricted = (alerts: string[], branches: string[] = []): AccessControl => ({
  isSuper: false, role: 'EMPLOYEE', name: 'Test', bizIds: ['tk'], branches, groups: [], depts: [], alerts, canManage: false,
});

describe('system-alert access — branch channels', () => {
  it('defines the branch channels (finance + crm + sales + bookings + accounts) with matching grants', () => {
    expect(financeAlertChannels.map((c) => c.id)).toEqual(['tk_fin_bom', 'tk_fin_amd']);
    expect(crmAlertChannels.map((c) => c.id)).toEqual(['tk_crm_bom', 'tk_crm_amd']);
    expect(salesInvoiceAlertChannels.map((c) => c.id)).toEqual(['tk_si_bom', 'tk_si_amd', 'tk_si_nbo', 'tk_si_dar', 'tk_si_fbm']);
    expect(bookingsAlertChannels.map((c) => c.id)).toEqual(['tk_bkg_bom', 'tk_bkg_amd', 'tk_bkg_nbo', 'tk_bkg_dar', 'tk_bkg_fbm']);
    expect(acctAlertChannels.map((c) => c.id)).toEqual(['tk_acc_bom', 'tk_acc_amd', 'tk_acc_nbo', 'tk_acc_dar', 'tk_acc_fbm']);
    // Retired 2026-08-19: Clients Receivables (tk_ar_*), Supplier Payables (tk_ap_*), Bank & Cash
    // (tk_bc_*) and Attendance (tk_att_*) — all of those reports are posted into the branch group
    // chats now. My Alerts (the puncher's own check-in) is unaffected: it is not in this registry.
    expect(pulseChannels.some((c) => /^tk_(ar|ap|bc|att)_/.test(c.id))).toBe(false);
    // The grant-visible list is what the app SHOWS: only the "Finance" (accounts) channels are
    // hidden from pulseChannels while FINANCE_ALERTS_ENABLED is false — every other family stays.
    expect(pulseChannels.filter((c) => c.branch).map((c) => `${c.branch}-${c.module}`)).toEqual([
      ...(CRM_ALERTS_ENABLED ? ['BOM-crm', 'AMD-crm'] : []),
      ...(FINANCE_ALERTS_ENABLED ? ['BOM-accounts', 'AMD-accounts'] : []),
      'BOM-sales', 'AMD-sales', 'NBO-sales', 'DAR-sales', 'FBM-sales',
      'BOM-bookings', 'AMD-bookings', 'NBO-bookings', 'DAR-bookings', 'FBM-bookings',
      'BOM-acct', 'AMD-acct', 'NBO-acct', 'DAR-acct', 'FBM-acct',
    ]);
  });

  it('super admin sees every channel', () => {
    const f = makeAccessFilters(null);
    for (const ch of pulseChannels) expect(f.alertOK(ch.branch ?? null, ch.module)).toBe(true);
  });

  it('a BOM-sales grant shows only the BOM Sales Invoice channel', () => {
    const f = makeAccessFilters(restricted(['BOM-sales']));
    expect(f.alertOK('BOM', 'sales')).toBe(true);
    expect(f.alertOK('AMD', 'sales')).toBe(false);
    expect(f.alertOK(null, 'sales')).toBe(false); // no module-wide grant
  });

  it('alertBrOK surfaces a branch section from an alert grant alone', () => {
    const f = makeAccessFilters(restricted(['BOM-sales']));
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

  it('module grants stay independent of each other and of Finance', () => {
    const f = makeAccessFilters(restricted(['DAR-acct']));
    expect(f.alertOK('DAR', 'acct')).toBe(true);
    expect(f.alertOK('DAR', 'bookings')).toBe(false);
    expect(f.alertOK('DAR', 'accounts')).toBe(false);
    expect(f.alertOK('BOM', 'acct')).toBe(false);
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

  it('groups collapse the branch channels into one card per visible module ("Finance" hidden while disabled)', () => {
    expect(pulseGroups.map((g) => g.name)).toEqual([
      ...(CRM_ALERTS_ENABLED ? ['CRM'] : []),
      ...(FINANCE_ALERTS_ENABLED ? ['Finance'] : []),
      'Sales Invoice', 'SO/PO/GP / INB', 'Accounts',
    ]);
    expect(pulseGroups.map((g) => g.channels.length)).toEqual([
      ...(CRM_ALERTS_ENABLED ? [2] : []),
      ...(FINANCE_ALERTS_ENABLED ? [2] : []),
      5, 5, 5,
    ]);
    for (const gid of ['grp_sales', 'grp_bookings', 'grp_acct']) {
      expect(groupById(gid)?.channels.map((c) => c.branch)).toEqual(['BOM', 'AMD', 'NBO', 'DAR', 'FBM']);
    }
    if (!FINANCE_ALERTS_ENABLED) expect(groupById('grp_accounts')).toBeUndefined(); // hidden — no card
    if (!CRM_ALERTS_ENABLED) expect(groupById('grp_crm')).toBeUndefined(); // hidden — no card
  });

  it('group ids can never collide with a backend channel id', () => {
    const channelIds = new Set([...pulseChannels.map((c) => c.id), 'user_alerts']);
    for (const g of pulseGroups) expect(channelIds.has(g.id)).toBe(false);
  });

  it('groupForChannel resolves a push deep link back to its group', () => {
    if (CRM_ALERTS_ENABLED) expect(groupForChannel('tk_crm_bom')?.id).toBe('grp_crm');
    else { expect(groupForChannel('tk_crm_bom')).toBeUndefined(); expect(channelById('tk_crm_bom')?.id).toBe('tk_crm_bom'); }
    expect(groupForChannel('tk_si_dar')?.id).toBe('grp_sales');
    expect(groupForChannel('tk_bkg_amd')?.id).toBe('grp_bookings');
    expect(groupForChannel('tk_acc_dar')?.id).toBe('grp_acct');
    // Retired families resolve to nothing at all — card, group and channel are gone.
    for (const id of ['tk_ar_nbo', 'tk_ap_fbm', 'tk_bc_nbo', 'tk_att_bom', 'tk_att_dir']) {
      expect(groupForChannel(id)).toBeUndefined();
      expect(channelById(id)).toBeUndefined();
    }
    if (FINANCE_ALERTS_ENABLED) {
      expect(groupForChannel('tk_fin_amd')?.id).toBe('grp_accounts');
    } else {
      // Hidden "Finance": no visible group card — but channelById must STILL resolve the channel,
      // so a stray Finance push notification never crashes the alert detail screen.
      expect(groupForChannel('tk_fin_amd')).toBeUndefined();
      expect(channelById('tk_fin_amd')?.id).toBe('tk_fin_amd');
    }
    expect(groupForChannel('user_alerts')).toBeUndefined(); // personal channel — no group
    expect(groupForChannel('announcements')).toBeUndefined();
  });

  it('a BOM-sales grant opens the Sales Invoice group as BOM ALONE (grouping never widens access)', () => {
    const f = makeAccessFilters(restricted(['BOM-sales']));
    const g = groupById('grp_sales');
    const mine = (g?.channels ?? []).filter((ch) => f.alertOK(ch.branch ?? null, ch.module));
    expect(mine.map((c) => c.id)).toEqual(['tk_si_bom']);
  });

  it('the personal My Alerts channel survives the Attendance removal', () => {
    // A puncher still gets "You checked in" — it lives outside pulseChannels, resolved by id.
    expect(channelById('user_alerts')?.name).toBe('My Alerts');
  });

  it('a super admin sees every branch of every group', () => {
    const f = makeAccessFilters(null);
    for (const g of pulseGroups) {
      expect(g.channels.filter((ch) => f.alertOK(ch.branch ?? null, ch.module))).toHaveLength(g.channels.length);
    }
  });
});
