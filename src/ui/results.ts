import { h } from '../dom';
import { isPlausible } from '../fccId';
import { FccIdioError, getDevice, groupExhibits } from '../fccidio';
import type { Device, Exhibit } from '../fccidio';
import { renderPdf } from '../pdfView';

export function renderResults(view: HTMLElement, fccId: string): void {
  view.append(h('a', { href: '#/' }, '← Scan another'), h('h1', {}, fccId));
  if (!isPlausible(fccId)) {
    view.append(h('p', { class: 'error' }, `"${fccId}" doesn't look like an FCC ID.`));
    return;
  }
  const status = h('p', { class: 'status' });
  view.append(status);
  void load();

  async function load(): Promise<void> {
    status.className = 'status';
    status.replaceChildren('Loading from fccid.io…');
    try {
      const device = await getDevice(fccId);
      status.remove();
      void show(view, device);
    } catch (err) {
      status.className = 'error';
      status.replaceChildren(...errorContent(err, fccId, load));
    }
  }
}

function errorContent(err: unknown, fccId: string, retry: () => void): Node[] {
  if (err instanceof FccIdioError && err.kind === 'not-found') {
    return [
      document.createTextNode('Not found on fccid.io. '),
      h('a', { href: `https://fcc.io/${encodeURIComponent(fccId)}`, target: '_blank', rel: 'noopener' }, 'Search the FCC directly'),
    ];
  }
  const message = err instanceof Error ? err.message : String(err);
  const nodes: Node[] = [document.createTextNode(message + ' ')];
  if (!(err instanceof FccIdioError) || err.kind === 'network' || err.kind === 'http') {
    const button = h('button', { type: 'button' }, 'Retry');
    button.addEventListener('click', retry);
    nodes.push(button);
  }
  return nodes;
}

async function show(view: HTMLElement, device: Device): Promise<void> {
  const summary = h('dl', { class: 'summary' });
  const add = (label: string, value?: string) => {
    if (value) summary.append(h('dt', {}, label), h('dd', {}, value));
  };
  add('Applicant', device.applicant);
  add('Product', device.product);
  add('Granted', device.grantDate);
  view.append(summary);

  const { internal, other } = groupExhibits(device);
  view.append(h('h2', {}, 'Internal photos'));
  if (internal.length === 0) view.append(h('p', { class: 'status' }, 'No internal photos are listed for this FCC ID.'));

  const toRender: { exhibit: Exhibit; pages: HTMLElement }[] = [];
  for (const exhibit of internal) {
    view.append(h('h3', {}, exhibit.title));
    if (exhibit.status === 'available' && exhibit.pdfUrl) {
      const pages = h('div', { class: 'pages' }, h('p', { class: 'status' }, 'Rendering…'));
      view.append(pages, h('p', {}, h('a', { href: exhibit.pdfUrl, target: '_blank', rel: 'noopener' }, 'Open PDF')));
      toRender.push({ exhibit, pages });
    } else if (exhibit.status === 'pending') {
      view.append(h('p', { class: 'status' }, `Confidential until ${exhibit.availableDate}.`));
    } else {
      view.append(h('p', { class: 'status' }, 'Not publicly available.'));
    }
  }

  if (other.length > 0) {
    view.append(h('h2', {}, 'Other documents'));
    const list = h('ul', { class: 'docs' });
    for (const e of other) {
      const label = `${e.title} — ${e.type}`;
      list.append(
        h('li', {},
          e.pageUrl ? h('a', { href: e.pageUrl, target: '_blank', rel: 'noopener' }, label) : label,
          e.status === 'pending' ? ` (confidential until ${e.availableDate})` : e.status === 'unavailable' ? ' (not public)' : null,
        ),
      );
    }
    view.append(list);
  }

  // Render one PDF at a time to keep memory down on phones.
  for (const { exhibit, pages } of toRender) {
    if (!pages.isConnected) return;
    pages.replaceChildren();
    try {
      await renderPdf(exhibit.pdfUrl!, pages);
    } catch {
      pages.replaceChildren(h('p', { class: 'error' }, "Couldn't render this PDF. Use “Open PDF” instead."));
    }
  }
}
