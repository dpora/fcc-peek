const BASE = 'https://fccid.io';

export type FccIdioErrorKind = 'not-found' | 'network' | 'http' | 'layout';

export class FccIdioError extends Error {
  kind: FccIdioErrorKind;
  constructor(kind: FccIdioErrorKind, message: string) {
    super(message);
    this.name = 'FccIdioError';
    this.kind = kind;
  }
}

export interface Exhibit {
  type: string;
  title: string;
  status: 'available' | 'pending' | 'unavailable';
  availableDate?: string;
  docId?: string;
  pageUrl?: string;
  pdfUrl?: string;
  size?: string; // as fccid.io shows it, e.g. "2.1 MB"
}

export interface Device {
  fccId: string;
  applicant?: string;
  product?: string;
  grantDate?: string;
  exhibits: Exhibit[];
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function metaTable(doc: Document, heading: string): Map<string, string> | null {
  const h2 = [...doc.querySelectorAll('h2.panel-title')].find((el) => text(el) === heading);
  const table = h2?.closest('.panel')?.querySelector('table.meta-table');
  if (!table) return null;
  const map = new Map<string, string>();
  for (const tr of table.querySelectorAll('tr')) {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td')?.cloneNode(true) as Element | undefined;
    if (!th || !td) continue;
    td.querySelectorAll('[role="img"]').forEach((n) => n.remove());
    map.set(text(th), text(td));
  }
  return map;
}

function parseExhibit(tr: Element, today: string): Exhibit {
  const cell = (label: string) => tr.querySelector(`td[data-label="${label}"]`);
  const docCell = cell('Document');
  const link = docCell?.querySelector('a[href]');
  const availableDate = text(cell('Available')) || undefined;
  const type = text(cell('Type'));

  let title: string;
  if (link) {
    title = text(link);
  } else {
    const clone = docCell?.cloneNode(true) as Element | undefined;
    clone?.querySelectorAll('.doc-status').forEach((n) => n.remove());
    title = text(clone);
  }

  const exhibit: Exhibit = { type, title, status: 'unavailable' };
  if (availableDate) exhibit.availableDate = availableDate;
  const size = /([\d.,]+\s*[KMG]?B)\b/i.exec(text(cell('File')))?.[1];

  if (link) {
    const href = link.getAttribute('href') ?? '';
    exhibit.pageUrl = new URL(href, BASE).href;
    const docId = /-(\d+)$/.exec(href)?.[1];
    if (docId) {
      exhibit.status = 'available';
      exhibit.docId = docId;
      exhibit.pdfUrl = `${BASE}/pdf.php?id=${docId}`;
      if (size) exhibit.size = size;
    }
  } else if (availableDate && availableDate > today) {
    exhibit.status = 'pending';
  }
  return exhibit;
}

export function parseDevicePage(html: string, today: string): Device {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const h1 = text(doc.querySelector('h1'));
  if (!h1.startsWith('FCC ID ')) {
    throw new FccIdioError('not-found', 'fccid.io has no page for this FCC ID.');
  }
  const details = metaTable(doc, 'FCC ID Device Details');
  if (!details) {
    throw new FccIdioError('layout', "Couldn't read the fccid.io page (its layout may have changed).");
  }
  const app = metaTable(doc, 'Application Information');

  const device: Device = {
    fccId: details.get('FCC ID') || h1.slice('FCC ID '.length).trim(),
    exhibits: [...doc.querySelectorAll('table.exhibit-table tbody tr')].map((tr) => parseExhibit(tr, today)),
  };
  const applicant = details.get('Applicant Business');
  const product = text(doc.querySelector('h3')) || app?.get('Device Description');
  const grantDate = app?.get('Final Action Date');
  if (applicant) device.applicant = applicant;
  if (product) device.product = product;
  if (grantDate) device.grantDate = grantDate;
  return device;
}

export interface Suggestion {
  id: string;
  match: string;
  applicant?: string;
  description?: string;
  date?: string;
}

export interface Grantee {
  code: string;
  name: string;
}

// redirected: fccid.io answered with a 303 to a different ID (it corrects some misreads itself,
// but also sends unrelated words to unrelated devices: LABEL -> EA46GJLABEL).
export type Lookup =
  | { kind: 'device'; device: Device; redirected: boolean }
  | { kind: 'similar'; suggestions: Suggestion[] }
  | { kind: 'notfound'; grantee?: Grantee };

// 300 "Possible Matches": rows of FCC ID (link) / Match / Applicant / Description / Date.
function parseSuggestions(doc: Document): Suggestion[] {
  const out: Suggestion[] = [];
  for (const tr of doc.querySelectorAll('table.table tbody tr')) {
    const cells = [...tr.querySelectorAll('td')].map((td) => text(td));
    const id = text(tr.querySelector('td a'));
    if (!id) continue;
    const s: Suggestion = { id, match: cells[1] ?? '' };
    if (cells[2]) s.applicant = cells[2];
    if (cells[3]) s.description = cells[3];
    if (cells[4]) s.date = cells[4];
    out.push(s);
  }
  return out;
}

// 404 pages carry a "Grantee Code Found" panel when the first part of the ID is a real grantee:
// "The grantee code I88 belongs to ZyXEL Communications Corporation in Hsinchu N/A Taiwan."
function parseGrantee(doc: Document): Grantee | undefined {
  const h3 = [...doc.querySelectorAll('h3.panel-title')].find((el) => text(el) === 'Grantee Code Found');
  const p = h3?.closest('.panel')?.querySelector('.panel-body p');
  const code = text(p?.querySelector('a'));
  const name = /belongs to (.+) in .*$/.exec(text(p))?.[1];
  return code && name ? { code, name } : undefined;
}

export function parseLookupPage(status: number, html: string, today: string, redirected: boolean): Lookup {
  if (status === 200) {
    try {
      return { kind: 'device', device: parseDevicePage(html, today), redirected };
    } catch (err) {
      // A bare grantee code (or a search) also returns 200.
      if (err instanceof FccIdioError && err.kind === 'not-found') return { kind: 'notfound' };
      throw err;
    }
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (status === 300) {
    // The other 300 page, "FCC ID Search Matches", lists product-code hits, not look-alikes.
    if (!/Possible Matches/.test(doc.title)) return { kind: 'notfound' };
    return { kind: 'similar', suggestions: parseSuggestions(doc) };
  }
  if (status === 404) {
    const grantee = parseGrantee(doc);
    return grantee ? { kind: 'notfound', grantee } : { kind: 'notfound' };
  }
  throw new FccIdioError('http', `fccid.io returned HTTP ${status}.`);
}

export async function lookup(
  fccId: string,
  fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<Lookup> {
  let res: Response;
  try {
    res = await fetchFn(`${BASE}/${encodeURIComponent(fccId)}`);
  } catch {
    throw new FccIdioError('network', "Couldn't reach fccid.io. Check your connection.");
  }
  return parseLookupPage(res.status, await res.text(), todayIso(), res.redirected);
}
