import { makeAccessFilters } from '../logic/accessFilters';
import { deriveAccess } from '../logic/access';
import { branches, businessDepts } from '../data/businesses';
import { pulseChannels, CRM_ALERTS_ENABLED } from '../data/pulse';
import { adminUsers } from '../data/users';

const byId = (id: string) => adminUsers.find((u) => u.id === id)!;

// Reproduces the visibility math the three Home segments use, asserting View-As effects.
describe('Home segments — access filtering (View-As)', () => {
  it('Groups: Super sees all TK branches/groups; Employee(Rohan) sees only AMD-Ticketing', () => {
    const sup = makeAccessFilters(deriveAccess(byId('a1')));
    const supGroups = branches.filter((br) => sup.brOK(br.code)).flatMap((br) => br.groups.filter((g) => sup.grpOK(br.code, g.name)));
    expect(supGroups.length).toBe(15); // 3 branches × 5 groups

    const emp = makeAccessFilters(deriveAccess(byId('a6'))); // Rohan: AMD, AMD-Ticketing
    const empGroups = branches.filter((br) => emp.brOK(br.code)).flatMap((br) => br.groups.filter((g) => emp.grpOK(br.code, g.name)));
    expect(empGroups.map((g) => g.name)).toEqual(['Ticketing']);
  });

  it('Departments: HOD(Harshit) sees only AMD-Ticketing dept', () => {
    const f = makeAccessFilters(deriveAccess(byId('a5'))); // Harshit: AMD, AMD-Ticketing
    const depts = branches.filter((br) => f.brOK(br.code)).flatMap((br) => (businessDepts['tk'] || []).filter((d) => f.deptOK(br.code, d.name)).map((d) => `${br.code}-${d.name}`));
    expect(depts).toEqual(['AMD-Ticketing']);
  });

  it('System Alerts: Employee(Nurul, BOM-crm) sees only the CRM - BOM channel (none while CRM alerts are hidden)', () => {
    const f = makeAccessFilters(deriveAccess(byId('a8'))); // Nurul: BOM, BOM-crm — no hr/accounts grant
    const visible = pulseChannels.filter((ch) => f.bizOK(ch.bizId) && f.alertOK(ch.branch ?? null, ch.module));
    expect(visible.map((ch) => ch.id)).toEqual(CRM_ALERTS_ENABLED ? ['tk_crm_bom'] : []);
  });

  it('Super sees every registered alert channel', () => {
    const f = makeAccessFilters(deriveAccess(byId('a1')));
    const visible = pulseChannels.filter((ch) => f.bizOK(ch.bizId) && f.alertOK(ch.branch ?? null, ch.module));
    expect(visible.length).toBe(pulseChannels.length);
  });
});
