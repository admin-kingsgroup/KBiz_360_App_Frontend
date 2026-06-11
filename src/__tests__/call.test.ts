import { callsByFilter, searchCalls, missedCount, durationLabel } from '../logic/call';
import type { CallRecord } from '../types';

const c = (over: Partial<CallRecord>): CallRecord => ({
  id: 'x', contact: { id: 'u1', name: 'Faiz Khan', initials: 'FK', color: '#000', role: 'Branch View' },
  type: 'voice', direction: 'incoming', ts: 0, ...over,
});

describe('call logic', () => {
  const calls: CallRecord[] = [
    c({ id: '1', ts: 300, direction: 'incoming' }),
    c({ id: '2', ts: 200, direction: 'missed' }),
    c({ id: '3', ts: 100, direction: 'outgoing', contact: { id: 'u2', name: 'Riya Patel', initials: 'RP', color: '#000' } }),
  ];

  it('callsByFilter sorts newest first and filters missed', () => {
    expect(callsByFilter(calls, 'all').map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(callsByFilter(calls, 'missed').map((x) => x.id)).toEqual(['2']);
  });

  it('searchCalls matches contact name', () => {
    expect(searchCalls(calls, 'riya').map((x) => x.id)).toEqual(['3']);
    expect(searchCalls(calls, '').length).toBe(3);
  });

  it('missedCount counts missed calls', () => {
    expect(missedCount(calls)).toBe(1);
  });

  it('durationLabel formats mm:ss and h:mm:ss', () => {
    expect(durationLabel(0)).toBe('0:00');
    expect(durationLabel(65)).toBe('1:05');
    expect(durationLabel(3725)).toBe('1:02:05');
  });
});
