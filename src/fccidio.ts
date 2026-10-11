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

  if (link) {
    const href = link.getAttribute('href') ?? '';
    exhibit.pageUrl = new URL(href, BASE).href;
    const docId = /-(\d+)$/.exec(href)?.[1];
    if (docId) {
      exhibit.status = 'available';
      exhibit.docId = docId;
      exhibit.pdfUrl = `${BASE}/pdf.php?id=${docId}`;
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

export async function getDevice(
  fccId: string,
  fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<Device> {
  let res: Response;
  try {
    res = await fetchFn(`${BASE}/${encodeURIComponent(fccId)}`);
  } catch {
    throw new FccIdioError('network', "Couldn't reach fccid.io. Check your connection.");
  }
  if (res.status === 404) throw new FccIdioError('not-found', 'fccid.io has no page for this FCC ID.');
  if (!res.ok) throw new FccIdioError('http', `fccid.io returned HTTP ${res.status}.`);
  return parseDevicePage(await res.text(), todayIso());
}

export function groupExhibits(device: Device): { internal: Exhibit[]; other: Exhibit[] } {
  const internal: Exhibit[] = [];
  const other: Exhibit[] = [];
  for (const e of device.exhibits) {
    (e.type.toLowerCase() === 'internal photos' ? internal : other).push(e);
  }
  return { internal, other };
}
