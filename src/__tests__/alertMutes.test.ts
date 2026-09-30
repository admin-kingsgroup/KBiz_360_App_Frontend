const setAlertMute = jest.fn();
jest.mock('../api/alerts', () => ({
  listAlerts: jest.fn(),
  markAlertRead: jest.fn(() => Promise.resolve({ ok: true })),
  markAlertChannelRead: jest.fn(() => Promise.resolve({ ok: true })),
  setAlertMute: (...args: unknown[]) => setAlertMute(...args),
}));

import { countsTowardBadge, isAlertMuted, muteLabel, muteStateOf } from '../logic/alertMutes';
import { usePulseStore } from '../store/pulseStore';

// Muting an alert is personal: the events stay in the Alerts tab, the server stops pushing them to
// this user, and their unread count stops feeding the Alerts tab badge.
const now = new Date(2026, 8, 30, 10, 0, 0).getTime();
const HOUR = 3600_000;

describe('alert mute state', () => {
  const mutes = { tk_erp_bom: null, tk_erp_amd: now + 8 * HOUR, tk_hr_bom: now - HOUR };

  it('"Always" and a running timed mute are muted; a run-out or absent one is not', () => {
    expect(isAlertMuted(mutes, 'tk_erp_bom', now)).toBe(true);
    expect(isAlertMuted(mutes, 'tk_erp_amd', now)).toBe(true);
    expect(isAlertMuted(mutes, 'tk_hr_bom', now)).toBe(false);
    expect(isAlertMuted(mutes, 'tk_lead_bom', now)).toBe(false);
    expect(isAlertMuted(undefined, 'tk_erp_bom', now)).toBe(false);
  });

  it('a group card reads as muted only when every branch it shows is', () => {
    expect(muteStateOf(mutes, ['tk_erp_bom', 'tk_erp_amd'], now)).toEqual({ all: true, some: true, until: null });
    expect(muteStateOf(mutes, ['tk_erp_amd'], now)).toEqual({ all: true, some: true, until: now + 8 * HOUR });
    expect(muteStateOf(mutes, ['tk_erp_bom', 'tk_erp_nbo'], now)).toEqual({ all: false, some: true, until: null });
    expect(muteStateOf(mutes, ['tk_hr_bom'], now)).toEqual({ all: false, some: false, until: null });
    expect(muteStateOf(mutes, [], now).all).toBe(false);
  });

  it('labels say when the mute ends — a future time, never a past-style stamp', () => {
    expect(muteLabel(null, now)).toBe('Muted');
    expect(muteLabel(now + 2 * HOUR, now)).toMatch(/^Muted until \d{1,2}:\d{2}/);
    expect(muteLabel(now + 20 * HOUR, now)).toMatch(/^Muted until tomorrow, /);
    expect(muteLabel(now + 7 * 24 * HOUR, now)).toMatch(/^Muted until (7 Oct|Oct 7)$/); // day/month order follows the phone locale
  });

  it('unread events of a muted channel do not count toward the Alerts tab badge', () => {
    expect(countsTowardBadge({ read: false, channelId: 'tk_erp_bom' }, mutes, now)).toBe(false);
    expect(countsTowardBadge({ read: false, channelId: 'tk_hr_bom' }, mutes, now)).toBe(true); // mute ran out
    expect(countsTowardBadge({ read: true, channelId: 'tk_lead_bom' }, mutes, now)).toBe(false);
    expect(countsTowardBadge({ read: false, channelId: 'tk_lead_bom' }, {}, now)).toBe(true);
  });
});

describe('pulseStore.setMuted', () => {
  beforeEach(() => {
    setAlertMute.mockReset();
    usePulseStore.setState({ mutes: {} });
  });

  it('mutes at once, then takes the server\'s answer', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    setAlertMute.mockReturnValue(new Promise((r) => { resolve = r; }));
    const p = usePulseStore.getState().setMuted(['tk_erp_bom', 'tk_erp_amd'], true, null);
    expect(usePulseStore.getState().mutes).toEqual({ tk_erp_bom: null, tk_erp_amd: null });
    expect(setAlertMute).toHaveBeenCalledWith(['tk_erp_bom', 'tk_erp_amd'], true, null);
    resolve({ mutes: { tk_erp_bom: null, tk_erp_amd: null, user_alerts: 123 } });
    await p;
    expect(usePulseStore.getState().mutes).toEqual({ tk_erp_bom: null, tk_erp_amd: null, user_alerts: 123 });
  });

  it('a timed mute ends that many hours from now', async () => {
    setAlertMute.mockReturnValue(new Promise(() => undefined));
    const before = Date.now();
    void usePulseStore.getState().setMuted(['tk_hr_bom'], true, 8);
    const until = usePulseStore.getState().mutes.tk_hr_bom as number;
    expect(until).toBeGreaterThanOrEqual(before + 8 * HOUR);
    expect(until).toBeLessThanOrEqual(Date.now() + 8 * HOUR);
  });

  it('unmute removes the channels; a refused call puts the old mutes back and throws', async () => {
    usePulseStore.setState({ mutes: { tk_erp_bom: null, tk_lead_bom: null } });
    setAlertMute.mockRejectedValue(new Error('offline'));
    await expect(usePulseStore.getState().setMuted(['tk_erp_bom'], false)).rejects.toThrow('offline');
    expect(usePulseStore.getState().mutes).toEqual({ tk_erp_bom: null, tk_lead_bom: null });

    setAlertMute.mockResolvedValue({ mutes: { tk_lead_bom: null } });
    await usePulseStore.getState().setMuted(['tk_erp_bom'], false);
    expect(usePulseStore.getState().mutes).toEqual({ tk_lead_bom: null });
  });

  it('sign-out clears the mutes with the feed', () => {
    usePulseStore.setState({ mutes: { tk_erp_bom: null } });
    usePulseStore.getState().reset();
    expect(usePulseStore.getState().mutes).toEqual({});
  });
});
