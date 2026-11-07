import type { Device } from './fccidio';

// The last few devices looked up, kept on this device only (localStorage).
export interface RecentScan {
  fccId: string;
  applicant?: string;
  product?: string;
  scannedAt: number;
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'fcc-peek:recent';
// The Scan screen scrolls the list when it doesn't fit, so this can exceed what one screen shows.
export const MAX_RECENT = 10;

// localStorage can be missing or throw on access (private mode, blocked site data).
function defaultStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function addRecent(list: RecentScan[], entry: RecentScan, max = MAX_RECENT): RecentScan[] {
  return [entry, ...list.filter((r) => r.fccId !== entry.fccId)].slice(0, max);
}

function isRecent(v: unknown): v is RecentScan {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const optionalString = (x: unknown) => x === undefined || typeof x === 'string';
  return typeof r.fccId === 'string' && Number.isFinite(r.scannedAt) && optionalString(r.applicant) && optionalString(r.product);
}

export function loadRecent(storage: KeyValueStore | null = defaultStorage()): RecentScan[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function recordRecent(device: Device, now = Date.now(), storage: KeyValueStore | null = defaultStorage()): void {
  const entry: RecentScan = { fccId: device.fccId, scannedAt: now };
  if (device.applicant) entry.applicant = device.applicant;
  if (device.product) entry.product = device.product;
  try {
    storage?.setItem(KEY, JSON.stringify(addRecent(loadRecent(storage), entry)));
  } catch {
    // Not saving history is fine; the lookup itself still worked.
  }
}

// "Today · 2:14 PM", "Yesterday · 6:40 PM", "Nov 3 · 11:02 AM" (year added when not this year).
export function formatWhen(ts: number, now: number, locale?: string): string {
  const d = new Date(ts);
  const n = new Date(now);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(n) - midnight(d)) / 86_400_000);
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Yesterday'
        : d.toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
            ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}),
          });
  return `${day} · ${time}`;
}
