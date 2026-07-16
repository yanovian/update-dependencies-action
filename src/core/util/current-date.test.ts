import { describe, expect, it } from 'vitest';
import { getUtcDateString } from './current-date.js';

describe('getUtcDateString', () => {
  it('formats a date as YYYY-MM-DD in UTC', () => {
    expect(getUtcDateString(new Date('2026-07-16T23:30:00Z'))).toBe('2026-07-16');
  });

  it('does not shift across a UTC day boundary', () => {
    expect(getUtcDateString(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });
});
