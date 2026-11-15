import { h } from '../dom';
import { isPlausible } from '../fccId';
import { lookup } from '../fccidio';
import type { Device } from '../fccidio';
import { recordRecent } from '../recent';
import { resolveId } from '../resolve';
import type { Resolution } from '../resolve';
import { resultsHash } from '../route';
import { scanState } from '../store';
import { renderDocuments, formatDate } from './documents';
import { describeError } from './errors';
import { idForm } from './idForm';

// The scan already resolved this ID: reuse that answer (and keep the OCR text and the
// correction note) instead of asking fccid.io again.
function fromScan(fccId: string): Resolution | null {
  const r = scanState.resolution;
  if (!r) return null;
  return (r.kind === 'found' ? r.device.fccId : r.read) === fccId ? r : null;
}

export function renderResults(view: HTMLElement, fccId: string): void {
  if (!isPlausible(fccId)) {
    renderNotFound(view, { kind: 'notfound', read: fccId, suggestions: [] }, '');
    return;
  }
  const stored = fromScan(fccId);
  if (stored) {
    showResolution(view, stored, scanState.text);
    return;
  }
  const status = h('p', { class: 'status' });
  view.append(h('a', { href: '#/' }, '← Scan another'), status);
  void load();

  async function load(): Promise<void> {
    status.className = 'status';
    status.replaceChildren('Checking fccid.io…');
    try {
      const resolution = await resolveId(fccId, (id) => lookup(id));
      view.replaceChildren();
      showResolution(view, resolution, '');
    } catch (err) {
      status.className = 'error';
      status.replaceChildren(...errorContent(err, fccId, load));
    }
  }
}

// Shown when a scan found no FCC ID on the label at all.
export function renderNoId(view: HTMLElement): void {
  if (!scanState.text) {
    location.hash = '#/';
    return;
  }
  renderNotFound(view, { kind: 'notfound', read: '', suggestions: [] }, scanState.text);
}

function showResolution(view: HTMLElement, r: Resolution, ocrText: string): void {
  if (r.kind === 'found') show(view, r.device, r);
  else renderNotFound(view, r, ocrText);
}

function renderNotFound(view: HTMLElement, r: Extract<Resolution, { kind: 'notfound' }>, ocrText: string): void {
  view.append(h('a', { href: '#/' }, '← Scan again'), h('h1', {}, 'Not found'));
  view.append(
    h('p', { class: 'status' },
      ...(r.read
        ? ['No exact match for ', h('b', { class: 'id' }, r.read), ' on fccid.io. Check it against the label and fix any wrong characters.']
        : ['No FCC ID found on the label. Type it in, or scan again closer with better light.'])),
    idForm(r.read),
  );
  if (r.grantee) {
    view.append(
      h('p', { class: 'note' },
        'The grantee code ', h('b', { class: 'id' }, r.grantee.code), ` belongs to ${r.grantee.name}, so the start of the ID is probably right. The device may not be on fccid.io. `,
        h('a', { href: `https://fccid.io/${encodeURIComponent(r.grantee.code)}`, target: '_blank', rel: 'noopener' }, `Browse ${r.grantee.code} devices`)),
    );
  }
  if (r.suggestions.length > 0) {
    view.append(h('h2', {}, 'Did you mean'));
    const list = h('div', { class: 'sugg' });
    for (const s of r.suggestions) {
      list.append(
        h('a', { class: 'item', href: resultsHash(s.id) },
          h('span', { class: 'id' }, ...highlight(r.read, s.id)),
          [s.applicant, s.description].filter(Boolean).length ? h('span', {}, [s.applicant, s.description].filter(Boolean).join(' · ')) : null,
          h('span', { class: 'meta' }, [s.match, s.date].filter(Boolean).join(' · '))),
      );
    }
    view.append(list);
  }
  if (r.read) {
    view.append(h('p', {}, h('a', { href: `https://fcc.io/${encodeURIComponent(r.read)}`, target: '_blank', rel: 'noopener' }, 'Search the FCC directly')));
  }
  if (ocrText) view.append(h('details', {}, h('summary', {}, 'Text read from the label'), h('pre', {}, ocrText)));
}

// Marks the characters of `id` that differ from what was read (position by position,
// ignoring hyphens), so a one-letter fix stands out.
function highlight(read: string, id: string): (Node | string)[] {
  const flatRead = read.replace(/-/g, '');
  const out: (Node | string)[] = [];
  let k = 0;
  for (const c of id) {
    if (c === '-') {
      out.push(c);
      continue;
    }
    out.push(c === flatRead[k] ? c : h('mark', {}, c));
    k++;
  }
  return out;
}

function errorContent(err: unknown, fccId: string, retry: () => void): Node[] {
  const { message, retry: canRetry, links } = describeError(err, fccId, navigator.onLine);
  const nodes: Node[] = [document.createTextNode(message + ' ')];
  if (canRetry) {
    const button = h('button', { type: 'button' }, 'Retry');
    button.addEventListener('click', retry);
    nodes.push(button);
  }
  for (const link of links) {
    nodes.push(document.createTextNode(' '), h('a', { href: link.href, target: '_blank', rel: 'noopener' }, link.label));
  }
  return nodes;
}

function show(view: HTMLElement, device: Device, r: Extract<Resolution, { kind: 'found' }>): void {
  recordRecent(device);
  view.classList.add('results');
  const summary = [device.applicant, device.product, device.grantDate && `Granted ${formatDate(device.grantDate)}`].filter(Boolean).join(' · ');
  view.append(
    h('a', { href: '#/' }, '← Scan another'),
    h('header', { class: 'device' }, h('h1', {}, device.fccId), summary ? h('p', { class: 'meta' }, summary) : null),
  );
  if (r.corrected) {
    const notThis = h('button', { type: 'button', class: 'link' }, 'Not this device?');
    view.append(
      h('p', { class: 'note' },
        'Label read as ', h('b', { class: 'id' }, r.read), '. Showing the closest match. ',
        notThis),
    );
    notThis.addEventListener('click', () => {
      view.replaceChildren();
      view.classList.remove('results');
      renderNotFound(view, { kind: 'notfound', read: r.read, suggestions: r.alternatives }, scanState.text);
      window.scrollTo(0, 0);
    });
  }
  if (r.others.length > 0) {
    const also = h('p', { class: 'status' }, 'Also on this label: ');
    r.others.forEach((id, i) => also.append(i ? ', ' : '', h('a', { href: resultsHash(id) }, id)));
    view.append(also);
  }
  renderDocuments(view, device);
}
