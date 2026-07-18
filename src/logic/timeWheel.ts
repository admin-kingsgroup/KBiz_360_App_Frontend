// Pure 12-hour ↔ 24-hour conversions backing the TimeWheel picker.
export type Meridiem = 'AM' | 'PM';

export const to12h = (hour24: number): { h12: number; meridiem: Meridiem } => ({
  h12: hour24 % 12 || 12,
  meridiem: hour24 < 12 ? 'AM' : 'PM',
});

export const to24h = (h12: number, meridiem: Meridiem): number => (h12 % 12) + (meridiem === 'PM' ? 12 : 0);
