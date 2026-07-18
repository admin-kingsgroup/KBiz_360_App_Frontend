import { to12h, to24h } from '../logic/timeWheel';

describe('timeWheel 12h/24h conversion', () => {
  it('round-trips all 24 hours', () => {
    for (let h = 0; h < 24; h++) {
      const { h12, meridiem } = to12h(h);
      expect(h12).toBeGreaterThanOrEqual(1);
      expect(h12).toBeLessThanOrEqual(12);
      expect(to24h(h12, meridiem)).toBe(h);
    }
  });

  it('handles midnight and noon', () => {
    expect(to12h(0)).toEqual({ h12: 12, meridiem: 'AM' });
    expect(to12h(12)).toEqual({ h12: 12, meridiem: 'PM' });
    expect(to24h(12, 'AM')).toBe(0);
    expect(to24h(12, 'PM')).toBe(12);
  });

  it('meridiem flip keeps the clock-face hour', () => {
    expect(to24h(8, 'AM')).toBe(8);
    expect(to24h(8, 'PM')).toBe(20);
    expect(to24h(11, 'PM')).toBe(23);
  });
});
