import type { Exhibit } from './fccidio';

// The FCC exhibit types in the order the results page shows them, each with a fixed color
// used wherever the type appears (grid tile, list row, viewer). The eight types that usually
// end up in the grid get the most distinct hues, ordered so neighbors differ; types that are
// almost always confidential get darker, quieter ones. Must match the Penpot "Results v2" legend.
export const DOC_TYPES = [
  { name: 'Internal Photos', color: '#DC2626' },
  { name: 'External Photos', color: '#2563EB' },
  { name: 'Schematics', color: '#92400E' },
  { name: 'Block Diagram', color: '#4D7C0F' },
  { name: 'User Manual', color: '#16A34A' },
  { name: 'ID Label/Location Info', color: '#EA580C' },
  { name: 'Cover Letter(s)', color: '#7C3AED' },
  { name: 'Operational Description', color: '#155E75' },
  { name: 'Parts List/Tune Up Info', color: '#9D174D' },
  { name: 'Test Report', color: '#0D9488' },
  { name: 'Test Setup Photos', color: '#DB2777' },
  { name: 'RF Exposure Info', color: '#CA8A04' },
  { name: 'Attestation Statements', color: '#64748B' },
  { name: 'SDR Software/Security Info', color: '#57534E' },
] as const;

// Anything fccid.io lists that is not above (e.g. a stray "jpeg" type on a 2001 filing).
export const OTHER_COLOR = '#9CA3AF';

// fccid.io spells a few types differently from the list above.
const ALIASES: Record<string, string> = {
  'users manual': 'User Manual',
  'sdr software/security info.': 'SDR Software/Security Info',
  'sdr software/security inf': 'SDR Software/Security Info',
};

export interface DocGroup {
  name: string;
  color: string;
  exhibits: Exhibit[];
  // Documents you can open now.
  publicCount: number;
  // public: at least one document can be opened. pending: none yet, some have a release
  // date (availableDate = the earliest). private: none, and none are due.
  state: 'public' | 'pending' | 'private';
  availableDate?: string;
  // A withheld document whose release date has passed but fccid.io never published it.
  overdueSince?: string;
}

export interface GroupedDocuments {
  visible: DocGroup[]; // types with a public document, in priority order
  confidential: DocGroup[]; // types with nothing public, in priority order
  notFiled: string[]; // listed types this device has no document of
}

function canonical(type: string): string {
  const t = type.trim();
  const lower = t.toLowerCase();
  return ALIASES[lower] ?? DOC_TYPES.find((d) => d.name.toLowerCase() === lower)?.name ?? t;
}

export function groupDocuments(exhibits: Exhibit[]): GroupedDocuments {
  const byName = new Map<string, Exhibit[]>();
  for (const e of exhibits) {
    const name = canonical(e.type);
    byName.set(name, [...(byName.get(name) ?? []), e]);
  }
  const rank = (name: string) => {
    const i = DOC_TYPES.findIndex((d) => d.name === name);
    return i < 0 ? DOC_TYPES.length : i;
  };
  const groups = [...byName.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, list]): DocGroup => {
      const publicCount = list.filter((e) => e.status === 'available').length;
      const pendingDates = list.filter((e) => e.status === 'pending' && e.availableDate).map((e) => e.availableDate!).sort();
      const overdue = list.filter((e) => e.status === 'unavailable' && e.availableDate).map((e) => e.availableDate!).sort();
      const group: DocGroup = {
        name,
        color: DOC_TYPES.find((d) => d.name === name)?.color ?? OTHER_COLOR,
        exhibits: list,
        publicCount,
        state: publicCount > 0 ? 'public' : pendingDates.length > 0 ? 'pending' : 'private',
      };
      if (group.state === 'pending') group.availableDate = pendingDates[0];
      if (group.state === 'private' && overdue.length > 0) group.overdueSince = overdue[overdue.length - 1];
      return group;
    });
  return {
    visible: groups.filter((g) => g.state === 'public'),
    confidential: groups.filter((g) => g.state !== 'public'),
    notFiled: DOC_TYPES.map((d) => d.name).filter((n) => !byName.has(n)),
  };
}

// Grid rows that fit in `space` px with tiles at least `minTile` tall, never more than the
// tiles need (two per row), and at least one when there are any.
export function gridRows(space: number, tiles: number, minTile = 120, gap = 12): number {
  if (tiles === 0) return 0;
  return Math.max(1, Math.min(Math.ceil(tiles / 2), Math.floor((space + gap) / (minTile + gap))));
}
