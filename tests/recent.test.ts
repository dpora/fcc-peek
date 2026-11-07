import { describe, expect, it } from 'vitest';
import { addRecent, formatWhen, loadRecent, MAX_RECENT, recordRecent } from '../src/recent';
import type { RecentScan } from '../src/recent';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const scan = (fccId: string, scannedAt = 1): RecentScan => ({ fccId, scannedAt });

describe('addRecent', () => {
  it('puts the newest first', () => {
    expect(addRecent([scan('A')], scan('B')).map((r) => r.fccId)).toEqual(['B', 'A']);
  });

  it('moves a repeat to the top instead of listing it twice', () => {
    const list = [scan('A'), scan('B'), scan('C')];
    expect(addRecent(list, scan('C', 9))).toEqual([scan('C', 9), scan('A'), scan('B')]);
  });

  it(`keeps at most ${MAX_RECENT}, dropping the oldest`, () => {
    expect(MAX_RECENT).toBe(10);
    const list = Array.from({ length: MAX_RECENT }, (_, i) => scan(`ID${i}`));
    const next = addRecent(list, scan('NEW'));
    expect(next).toHaveLength(MAX_RECENT);
    expect(next[0].fccId).toBe('NEW');
    expect(next.map((r) => r.fccId)).not.toContain(`ID${MAX_RECENT - 1}`);
  });
});

describe('loadRecent', () => {
  it('returns [] when nothing is stored, the JSON is broken, or storage is unavailable', () => {
    expect(loadRecent(memoryStorage())).toEqual([]);
    expect(loadRecent(memoryStorage({ 'fcc-peek:recent': '{not json' }))).toEqual([]);
    expect(loadRecent(memoryStorage({ 'fcc-peek:recent': '{"a":1}' }))).toEqual([]);
    expect(loadRecent(null)).toEqual([]);
  });

  it(`reads back at most ${MAX_RECENT}`, () => {
    const raw = JSON.stringify(Array.from({ length: MAX_RECENT + 5 }, (_, i) => scan(`ID${i}`)));
    expect(loadRecent(memoryStorage({ 'fcc-peek:recent': raw }))).toHaveLength(MAX_RECENT);
  });

  it('drops malformed entries', () => {
    const raw = JSON.stringify([
      { fccId: 'BCG-E3175A', applicant: 'Apple Inc.', scannedAt: 5 },
      { fccId: 42, scannedAt: 5 },
      { fccId: 'X' },
      'junk',
    ]);
    expect(loadRecent(memoryStorage({ 'fcc-peek:recent': raw }))).toEqual([
      { fccId: 'BCG-E3175A', applicant: 'Apple Inc.', scannedAt: 5 },
    ]);
  });
});

describe('recordRecent', () => {
  it('stores the device and reads back newest first', () => {
    const storage = memoryStorage();
    recordRecent({ fccId: 'A', applicant: 'Acme', product: 'Router', exhibits: [] }, 1, storage);
    recordRecent({ fccId: 'B', exhibits: [] }, 2, storage);
    expect(loadRecent(storage)).toEqual([
      { fccId: 'B', scannedAt: 2 },
      { fccId: 'A', applicant: 'Acme', product: 'Router', scannedAt: 1 },
    ]);
  });

  it('ignores storage that throws (private mode, quota)', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => recordRecent({ fccId: 'A', exhibits: [] }, 1, storage)).not.toThrow();
    expect(() => recordRecent({ fccId: 'A', exhibits: [] }, 1, null)).not.toThrow();
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 10, 7, 15, 0).getTime();
  const fmt = (d: Date) => formatWhen(d.getTime(), now, 'en-US').replace(/\s/g, ' ');

  it('says Today and Yesterday', () => {
    expect(fmt(new Date(2026, 10, 7, 14, 14))).toBe('Today · 2:14 PM');
    expect(fmt(new Date(2026, 10, 6, 18, 40))).toBe('Yesterday · 6:40 PM');
  });

  it('uses the date for older scans, adding the year only when it differs', () => {
    expect(fmt(new Date(2026, 10, 3, 11, 2))).toBe('Nov 3 · 11:02 AM');
    expect(fmt(new Date(2025, 11, 30, 9, 5))).toBe('Dec 30, 2025 · 9:05 AM');
  });
});
