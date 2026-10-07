import { makeAccessFilters } from '../logic/accessFilters';
import { channelLabel, financeAlertChannels, crmAlertChannels, leadAlertChannels, grantableAlertChannels, channelGrantModule, pulseChannels, pulseGroups, groupById, groupForChannel, channelById, isVisibleAlertChannel, FINANCE_ALERTS_ENABLED, CRM_ALERTS_ENABLED } from '../data/pulse';
import type { AccessControl } from '../types';

const restricted = (alerts: string[], branches: string[] = []): AccessControl => ({
  isSuper: false, role: 'EMPLOYEE', name: 'Test', bizIds: ['tk'], branches, groups: [], alerts, canManage: false,
});

describe('system-alert access — branch channels', () => {
  it('defines what is left of the branch channels — the hidden Finance and CRM pair', () => {
    expect(financeAlertChannels.map((c) => c.id)).toEqual(['tk_fin_bom', 'tk_fin_amd']);
    expect(crmAlertChannels.map((c) => c.id)).toEqual(['tk_crm_bom', 'tk_crm_amd']);
    // Retired 2026-08-19: every branch-fed family — Receivables, Payables, Bank & Cash,
    // Attendance, Accounts, Sales Invoice and SO/PO/GP. They post into branch group chats now.
    // My Alerts (the puncher's own check-in) is unaffected: it is not in this registry.
    expect(pulseChannels.some((c) => /^tk_(ar|ap|bc|att|acc|si|bkg)_/.test(c.id))).toBe(false);
    // The grant-visible list is what the app SHOWS: CRM Alerts always; the Finance and CRM pairs
    // only while their flags are on.
    const six = ['BOM', 'AMD', 'NBO', 'DAR', 'FBM', 'MHUB'];
    const five = ['BOM', 'AMD', 'NBO', 'DAR', 'FBM'];
    expect(pulseChannels.filter((c) => c.branch).map((c) => `${c.branch}-${channelGrantModule(c)}`)).toEqual([
      ...six.map((b) => `${b}-attendance`),
      ...five.map((b) => `${b}-leads`),
      ...six.map((b) => `${b}-erp`),
      ...five.map((b) => `${b}-crm-reports`),
      ...six.map((b) => `${b}-erp-reports`),
      'KGD-crm-tickets', 'KGD-erp-tickets', // KGD Alerts (2026-10-07) — company-wide, grant-only
      ...(CRM_ALERTS_ENABLED ? ['BOM-crm', 'AMD-crm'] : []),
      ...(FINANCE_ALERTS_ENABLED ? ['BOM-accounts', 'AMD-accounts'] : []),
    ]);
  });

  it('super admin sees every channel', () => {
    const f = makeAccessFilters(null);
    for (const ch of pulseChannels) expect(f.alertOK(ch.branch ?? null, channelGrantModule(ch))).toBe(true);
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
      'HR', 'CRM', 'ERP', 'CRM Reports', 'ERP Reports', 'KGD Alerts',
      ...(CRM_ALERTS_ENABLED ? ['CRM Payments'] : []),
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
      expect(g.channels.filter((ch) => f.alertOK(ch.branch ?? null, channelGrantModule(ch)))).toHaveLength(g.channels.length);
    }
  });
});

// CRM Alerts: a lead converted into a query, posted into the query's branch. The backend grants
// "<BR>-leads" to every user of that branch (alertGrants.effectiveFor), so the app just checks it.
describe('CRM (lead conversions) — branch-wide', () => {
  const visibleTo = (alerts: string[], branches: string[] = []) => {
    const f = makeAccessFilters(restricted(alerts, branches));
    return pulseChannels.filter((ch) => f.alertOK(ch.branch ?? null, channelGrantModule(ch))).map((ch) => ch.id);
  };

  it('one channel per branch, granted as <BR>-leads, always visible', () => {
    expect(leadAlertChannels.map((c) => [c.id, c.name, `${c.branch}-${channelGrantModule(c)}`])).toEqual([
      ['tk_lead_bom', 'CRM - BOM', 'BOM-leads'],
      ['tk_lead_amd', 'CRM - AMD', 'AMD-leads'],
      ['tk_lead_nbo', 'CRM - NBO', 'NBO-leads'],
      ['tk_lead_dar', 'CRM - DAR', 'DAR-leads'],
      ['tk_lead_fbm', 'CRM - FBM', 'FBM-leads'],
    ]);
    for (const c of leadAlertChannels) expect(isVisibleAlertChannel(c.id)).toBe(true);
  });

  it('a BOM user sees CRM Alerts - BOM and no other branch', () => {
    expect(visibleTo(['BOM-leads'], ['bom-branch-id'])).toEqual(['tk_lead_bom']);
    expect(visibleTo(['BOM-leads', 'NBO-leads'])).toEqual(['tk_lead_bom', 'tk_lead_nbo']);
  });

  it('the grant-only "BOM-crm" (payments) never opens CRM Alerts, and vice versa', () => {
    expect(visibleTo(['BOM-crm'])).toEqual(CRM_ALERTS_ENABLED ? ['tk_crm_bom'] : []); // legacy CRM Payments only
    expect(visibleTo(['BOM-leads'])).not.toContain('tk_crm_bom');
  });

  it('CRM is never a per-user switch in Team & Users — branch membership grants it', () => {
    expect(grantableAlertChannels.some((c) => c.branchWide || c.id.startsWith('tk_lead_'))).toBe(false);
  });

  it('a push for tk_lead_bom opens the CRM card with BOM picked', () => {
    expect(groupForChannel('tk_lead_bom')?.id).toBe('grp_leads');
    expect(groupById('grp_leads')?.name).toBe('CRM');
    expect(channelById('tk_lead_fbm')?.name).toBe('CRM - FBM');
  });
});

// The five groups (owner, 2026-09-27): HR · CRM · ERP · CRM Reports · ERP Reports.
describe('Alerts groups — HR · CRM · ERP · CRM Reports · ERP Reports', () => {
  const visibleTo = (alerts: string[]) => {
    const f = makeAccessFilters(restricted(alerts));
    return pulseChannels.filter((ch) => f.alertOK(ch.branch ?? null, channelGrantModule(ch))).map((ch) => ch.id);
  };

  it('each group is one channel per branch; HR / ERP / ERP Reports include the hub', () => {
    const ids = (g: string) => groupById(g)?.channels.map((c) => c.id);
    expect(ids('grp_hr')).toEqual(['tk_hr_bom', 'tk_hr_amd', 'tk_hr_nbo', 'tk_hr_dar', 'tk_hr_fbm', 'tk_hr_mhub']);
    expect(ids('grp_erp')).toEqual(['tk_erp_bom', 'tk_erp_amd', 'tk_erp_nbo', 'tk_erp_dar', 'tk_erp_fbm', 'tk_erp_mhub']);
    expect(ids('grp_crm_reports')).toEqual(['tk_crmrep_bom', 'tk_crmrep_amd', 'tk_crmrep_nbo', 'tk_crmrep_dar', 'tk_crmrep_fbm']);
    expect(ids('grp_erp_reports')).toEqual(['tk_erprep_bom', 'tk_erprep_amd', 'tk_erprep_nbo', 'tk_erprep_dar', 'tk_erprep_fbm', 'tk_erprep_mhub']);
    expect(channelById('tk_erprep_mhub')?.name).toBe('ERP Reports - MHUB');
  });

  it('a BOM salesperson (branch-wide grants only) sees CRM + CRM Reports, never money or hours', () => {
    expect(visibleTo(['BOM-leads', 'BOM-crm-reports'])).toEqual(['tk_lead_bom', 'tk_crmrep_bom']);
  });

  it('HR / ERP / ERP Reports open only with their own switch, per branch', () => {
    expect(visibleTo(['BOM-attendance'])).toEqual(['tk_hr_bom']);
    expect(visibleTo(['NBO-erp', 'MHUB-erp-reports'])).toEqual(['tk_erp_nbo', 'tk_erprep_mhub']);
    expect(visibleTo(['BOM-erp'])).not.toContain('tk_erprep_bom'); // live feed ≠ the daily reports
  });

  it('Team & Users switches exactly HR / ERP / ERP Reports (18) + KGD Alerts (2) — the branch-wide groups are not switches', () => {
    expect(grantableAlertChannels).toHaveLength(20);
    expect(new Set(grantableAlertChannels.map(channelGrantModule))).toEqual(new Set(['attendance', 'erp', 'erp-reports', 'crm-tickets', 'erp-tickets']));
  });

  it('KGD Alerts — one company-wide channel per system, labelled by section', () => {
    expect(groupForChannel('tk_kgd_crm')?.name).toBe('KGD Alerts');
    expect(groupForChannel('tk_kgd_erp')?.name).toBe('KGD Alerts');
    const crm = channelById('tk_kgd_crm')!;
    const erp = channelById('tk_kgd_erp')!;
    expect(`${crm.branch}-${channelGrantModule(crm)}`).toBe('KGD-crm-tickets');
    expect(`${erp.branch}-${channelGrantModule(erp)}`).toBe('KGD-erp-tickets');
    expect([channelLabel(crm), channelLabel(erp)]).toEqual(['CRM', 'ERP']);
    expect(channelLabel(channelById('tk_hr_bom')!)).toBe('BOM');
    expect(crm.companyWide && erp.companyWide).toBe(true);
  });

  it('push deep links land on the right card', () => {
    expect(groupForChannel('tk_hr_dar')?.name).toBe('HR');
    expect(groupForChannel('tk_erp_fbm')?.name).toBe('ERP');
    expect(groupForChannel('tk_crmrep_amd')?.name).toBe('CRM Reports');
    expect(groupForChannel('tk_erprep_bom')?.name).toBe('ERP Reports');
  });
});
