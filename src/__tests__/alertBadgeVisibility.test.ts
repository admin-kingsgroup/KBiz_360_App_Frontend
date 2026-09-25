import { isVisibleAlertChannel, pulseChannels, userAlertsChannel, CRM_ALERTS_ENABLED, FINANCE_ALERTS_ENABLED } from '../data/pulse';

// The Alerts tab badge must count only events the alerts UI can actually surface. The backend
// keeps sending events for hidden channel families (their grants survive the visibility flags),
// and counting them produced a badge the user could never clear — the stuck "7 unread" from
// tk_crm_bom while the CRM family was flagged off.
describe('isVisibleAlertChannel', () => {
  it('personal My Alerts channel is always visible', () => {
    expect(isVisibleAlertChannel(userAlertsChannel.id)).toBe(true);
  });

  it('every channel in the visible registry passes', () => {
    for (const c of pulseChannels) expect(isVisibleAlertChannel(c.id)).toBe(true);
  });

  it('hidden CRM family channels are NOT visible while the flag is off', () => {
    if (!CRM_ALERTS_ENABLED) expect(isVisibleAlertChannel('tk_crm_bom')).toBe(false);
  });

  it('hidden Finance family channels are NOT visible while the flag is off', () => {
    if (!FINANCE_ALERTS_ENABLED) expect(isVisibleAlertChannel('tk_fin_bom')).toBe(false);
  });

  it('an unknown/legacy channel id never counts toward the badge', () => {
    expect(isVisibleAlertChannel('tk_ghost_xyz')).toBe(false);
  });
});
