import type { Device, Grantee, Lookup, Suggestion } from './fccidio';

// Turns what the OCR read into a device, following fccid.io's corrections only when they are
// close to the read. Rule and thresholds from docs/ocr-research ("look1+bare"): 54/65 real photos
// right and none wrong, where taking fccid.io's first suggestion got 3 wrong.

export type Resolution =
  // alternatives: what fccid.io offered when it was corrected, for "Not this device?".
  | { kind: 'found'; device: Device; read: string; corrected: boolean; others: string[]; alternatives: Suggestion[] }
  | { kind: 'notfound'; read: string; suggestions: Suggestion[]; grantee?: Grantee };

type LookupFn = (id: string) => Promise<Lookup>;

// Characters OCR confuses on printed labels.
const GROUPS = ['0ODQ', '1IL7', '5S', '8B', '2Z', '6G', 'UV', '4A'];
const LOOK = new Set<string>();
for (const g of GROUPS) for (const a of g) for (const b of g) if (a !== b) LOOK.add(a + b);

const MAX_DISTANCE = 1.25;
const MAX_BARE = 5;

const flat = (id: string) => id.toUpperCase().replace(/-/g, '');

// Weighted edit distance: look-alike substitution 0.25, any other edit 1.
export function distance(a: string, b: string): number {
  a = flat(a);
  b = flat(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : LOOK.has(a[i - 1] + b[j - 1]) ? 0.25 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
    }
  return d[a.length][b.length];
}

// The one suggestion close enough to open without asking, or null (none close, or a tie).
export function pickSuggestion(read: string, ids: string[]): string | null {
  const scored = ids.map((id) => ({ id, dist: distance(read, id) })).sort((x, y) => x.dist - y.dist);
  const [best, second] = scored;
  if (!best || best.dist > MAX_DISTANCE) return null;
  if (second && second.dist === best.dist) return null;
  return best.id;
}

const notFound = (read: string, suggestions: Suggestion[], grantee?: Grantee): Resolution =>
  grantee ? { kind: 'notfound', read, suggestions, grantee } : { kind: 'notfound', read, suggestions };

export async function resolveId(read: string, lookupFn: LookupFn): Promise<Resolution> {
  const page = await lookupFn(read);
  if (page.kind === 'device') {
    if (!page.redirected) return { kind: 'found', device: page.device, read, corrected: false, others: [], alternatives: [] };
    const s: Suggestion = { id: page.device.fccId, match: 'fccid.io redirect' };
    if (page.device.applicant) s.applicant = page.device.applicant;
    if (page.device.product) s.description = page.device.product;
    if (distance(read, page.device.fccId) <= MAX_DISTANCE) {
      return { kind: 'found', device: page.device, read, corrected: true, others: [], alternatives: [s] };
    }
    return notFound(read, [s]);
  }
  if (page.kind === 'similar') {
    const pick = pickSuggestion(read, page.suggestions.map((s) => s.id));
    if (pick) {
      const next = await lookupFn(pick);
      if (next.kind === 'device') {
        return { kind: 'found', device: next.device, read, corrected: true, others: [], alternatives: page.suggestions };
      }
    }
    return notFound(read, page.suggestions);
  }
  return notFound(read, [], page.grantee);
}

// Tries each labelled ID in order and opens the first that resolves. If none does, tries IDs
// printed without an "FCC ID" label, accepting only an exact match (they are weaker evidence).
export async function resolveScan(labelled: string[], bare: string[], lookupFn: LookupFn): Promise<Resolution> {
  let first: Resolution | undefined;
  for (const read of labelled) {
    const r = await resolveId(read, lookupFn);
    if (r.kind === 'found') return { ...r, others: labelled.filter((id) => id !== read) };
    first ??= r;
  }
  for (const read of bare.filter((id) => !labelled.includes(id)).slice(0, MAX_BARE)) {
    const page = await lookupFn(read);
    if (page.kind === 'device' && !page.redirected) {
      return { kind: 'found', device: page.device, read, corrected: false, others: labelled, alternatives: [] };
    }
  }
  return first ?? notFound('', []);
}
