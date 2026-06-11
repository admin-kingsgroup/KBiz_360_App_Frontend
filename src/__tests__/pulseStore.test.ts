import { usePulseStore } from '../store/pulseStore';
import { pulseEvents } from '../data/pulse';

describe('pulseStore — alert read-state', () => {
  beforeEach(() => usePulseStore.getState().setEvents(pulseEvents.map((e) => ({ ...e }))));

  it('eventsFor returns a channel\'s events newest-first', () => {
    const evs = usePulseStore.getState().eventsFor('tk_crm');
    expect(evs.length).toBeGreaterThan(0);
    for (let i = 1; i < evs.length; i++) expect(evs[i - 1].time).toBeGreaterThanOrEqual(evs[i].time);
  });
  it('markEventRead clears one event', () => {
    usePulseStore.getState().markEventRead('pe1');
    expect(usePulseStore.getState().events.find((e) => e.id === 'pe1')?.read).toBe(true);
  });
  it('markChannelRead clears all events in a channel', () => {
    usePulseStore.getState().markChannelRead('tk_crm');
    expect(usePulseStore.getState().events.filter((e) => e.channelId === 'tk_crm').every((e) => e.read)).toBe(true);
  });
});
