import { describe, expect, it } from 'vitest';
import { collectVersionDates } from './version-date-map.js';

describe('collectVersionDates', () => {
  it('maps each entry to its version and date', () => {
    const entries = [
      { num: '1.0.0', created_at: '2020-01-01T00:00:00.000Z' },
      { num: '1.1.0', created_at: '2021-06-15T00:00:00.000Z' },
    ];

    const dates = collectVersionDates(
      entries,
      (entry) => entry.num,
      (entry) => entry.created_at,
    );

    expect(dates.get('1.0.0')).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    expect(dates.get('1.1.0')).toEqual(new Date('2021-06-15T00:00:00.000Z'));
  });

  it('accepts a numeric date (epoch millis)', () => {
    const dates = collectVersionDates(
      [{ v: '1.0.0', timestamp: 1577836800000 }],
      (entry) => entry.v,
      (entry) => entry.timestamp,
    );

    expect(dates.get('1.0.0')).toEqual(new Date(1577836800000));
  });

  it('skips entries missing a version or a date', () => {
    const entries = [
      { version: undefined, time: '2020-01-01T00:00:00.000Z' },
      { version: '1.0.0', time: undefined },
      { version: '2.0.0', time: '2022-01-01T00:00:00.000Z' },
    ];

    const dates = collectVersionDates(
      entries,
      (entry) => entry.version,
      (entry) => entry.time,
    );

    expect(dates.size).toBe(1);
    expect(dates.get('2.0.0')).toEqual(new Date('2022-01-01T00:00:00.000Z'));
  });

  it('returns an empty map for an empty list', () => {
    expect(
      collectVersionDates(
        [],
        () => undefined,
        () => undefined,
      ).size,
    ).toBe(0);
  });
});
