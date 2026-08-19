import { makeAccessFilters } from '../logic/accessFilters';
import { financeAlertChannels, crmAlertChannels, pulseChannels, pulseGroups, groupById, groupForChannel, channelById, FINANCE_ALERTS_ENABLED, CRM_ALERTS_ENABLED } from '../data/pulse';
import type { AccessControl } from '../types';

const restricted = (alerts: string[], branches: string[] = []): AccessControl => ({
  isSuper: false, role: 'EMPLOYEE', name: 'Test', bizIds: ['tk'], branches, groups: [], depts: [], alerts, canManage: false,
});

describe('system-alert access — branch channels', () => {
  it('defines what is left of the branch channels — the hidden Finance and CRM pair', () => {
    expect(financeAlertChannels.map((c) => c.id)).toEqual(['tk_fin_bom', 'tk_fin_amd']);
    expect(crmAlertChannels.map((c) => c.id)).toEqual(['tk_crm_bom', 'tk_crm_amd']);
    // Retired 2026-08-19: every branch-fed family — Receivables, Payables, Bank & Cash,
    // Attendance, Accounts, Sales Invoice and SO/PO/GP. They post into branch group chats now.
    // My Alerts (the puncher's own check-in) is unaffected: it is not in this registry.
    expect(pulseChannels.some((c) => /^tk_(ar|ap|bc|att|acc|si|bkg)_/.test(c.id))).toBe(false);
    // The grant-visible list is what the app SHOWS: only the "Finance" (accounts) channels are
    // hidden from pulseChannels while FINANCE_ALERTS_ENABLED is false — every other family stays.
    expect(pulseChannels.filter((c) => c.branch).map((c) => `${c.branch}-${c.module}`)).toEqual([
      ...(CRM_ALERTS_ENABLED ? ['BOM-crm', 'AMD-crm'] : []),
      ...(FINANCE_ALERTS_ENABLED ? ['BOM-accounts', 'AMD-accounts'] : []),
    ]);
  });

  it('super admin sees every channel', () => {
    const f = makeAccessFilters(null);
    for (const ch of pulseChannels) expect(f.alertOK(ch.branch ?? null, ch.module)).toBe(true);
  });

  it('a BOM-accounts grant shows only the BOM Finance channel', () => {
    const f = makeAccessFilters(restricted(['BOM-accounts']));
    expect(f.alertOK('BOM', 'accounts')).toBe(true);
    expect(f.alertOK('AMD', 'accounts')).toBe(false);
    expect(f.alertOK(null, 'accounts')).toBe(false); // no module-wide grant
  });

  it('alertBrOK surfaces a branch section from an alert grant alone', () => {
    const f = makeAccessFilters(restricted(['BOM-accounts']));
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

  it('no branch cards are left — every family moved to a group chat', () => {
    expect(pulseGroups.map((g) => g.name)).toEqual([
      ...(CRM_ALERTS_ENABLED ? ['CRM'] : []),
      ...(FINANCE_ALERTS_ENABLED ? ['Finance'] : []),
    ]);
    if (!FINANCE_ALERTS_ENABLED) expect(groupById('grp_accounts')).toBeUndefined(); // hidden — no card
    if (!CRM_ALERTS_ENABLED) expect(groupById('grp_crm')).toBeUndefined(); // hidden — no card
    // The Alerts tab is down to the personal channel, which is rendered explicitly.
    expect(channelById('user_alerts')?.name).toBe('My Alerts');
  });

  it('group ids can never collide with a backend channel id', () => {
    const channelIds = new Set([...pulseChannels.map((c) => c.id), 'user_alerts']);
    for (const g of pulseGroups) expect(channelIds.has(g.id)).toBe(false);
  });

  it('groupForChannel resolves a push deep link back to its group', () => {
    if (CRM_ALERTS_ENABLED) expect(groupForChannel('tk_crm_bom')?.id).toBe('grp_crm');
    else { expect(groupForChannel('tk_crm_bom')).toBeUndefined(); expect(channelById('tk_crm_bom')?.id).toBe('tk_crm_bom'); }
    // Retired families resolve to nothing at all — card, group and channel are gone.
    for (const id of ['tk_ar_nbo', 'tk_ap_fbm', 'tk_bc_nbo', 'tk_att_bom', 'tk_att_dir', 'tk_acc_dar', 'tk_si_dar', 'tk_bkg_amd']) {
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
