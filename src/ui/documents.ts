import { h } from '../dom';
import { gridRows, groupDocuments } from '../docTypes';
import type { DocGroup } from '../docTypes';
import type { Device, Exhibit } from '../fccidio';

// The documents part of the results page (Penpot "Results v2"): a 2-column grid of the types
// that have a public document, as many rows as fit on screen, then a "More documents" list
// (public types that did not fit, then confidential ones, then the types never filed).
// Tapping a public type opens the viewer; tapping a confidential one explains why.

const GAP = 12;
const MAX_ROW = 240; // with few tiles, rows stop growing here instead of filling the screen

// Types the FCC lets makers keep confidential for good.
const LONG_TERM = new Set(['Schematics', 'Block Diagram', 'Operational Description', 'Parts List/Tune Up Info', 'SDR Software/Security Info']);

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const plural = (n: number) => `${n} document${n === 1 ? '' : 's'}`;

function statusText(g: DocGroup): string {
  if (g.state === 'public') return plural(g.publicCount);
  if (g.state === 'pending') return `Confidential until ${formatDate(g.availableDate!)}`;
  return g.overdueSince ? `Due ${formatDate(g.overdueSince)}, not published` : 'Not public';
}

function lockIcon(): Element {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 22 26');
  svg.setAttribute('class', 'lock');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect x="4" y="1" width="14" height="16" rx="7" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="0" y="11" width="22" height="15" rx="3" fill="currentColor"/>';
  return svg;
}

export function renderDocuments(view: HTMLElement, device: Device): void {
  const { visible, confidential, notFiled } = groupDocuments(device.exhibits);
  const viewer = createViewer(device, view);
  const info = createInfoSheet(device, view);
  const open = (g: DocGroup) => (g.state === 'public' ? viewer.open(g) : info.open(g));

  const tile = (g: DocGroup) =>
    h('button', { type: 'button', class: 'tile', style: `--doc: ${g.color}` },
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      h('span', { class: 'name' }, g.name),
      h('span', { class: 'pill' }, statusText(g)));
  const row = (g: DocGroup) =>
    h('button', { type: 'button', class: `doc-row${g.state === 'public' ? '' : ' locked'}`, style: `--doc: ${g.color}` },
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      h('span', { class: 'text' }, h('b', {}, g.name), h('span', { class: 'sub' }, statusText(g))),
      g.state === 'public' ? h('span', { class: 'chev', 'aria-hidden': 'true' }, '›') : lockIcon());

  const grid = h('div', { class: 'doc-grid' });
  grid.addEventListener('click', (e) => {
    const i = [...grid.children].indexOf((e.target as Element).closest('.tile')!);
    if (i >= 0) open(visible[i]);
  });

  const count = h('span', { class: 'count' });
  const dots = h('span', { class: 'dots', 'aria-hidden': 'true' });
  const toggle = h('button', { type: 'button', class: 'more-toggle', 'aria-expanded': 'false', 'aria-controls': 'more-list' },
    h('span', { class: 'label' }, 'More documents', count), dots, h('span', { class: 'chev', 'aria-hidden': 'true' }, '▾'));
  const list = h('div', { class: 'more-list', id: 'more-list', hidden: '' });
  const more = h('section', { class: 'more' }, toggle, list);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    list.hidden = !expanded;
  });

  const nothing =
    device.exhibits.length === 0
      ? h('p', { class: 'status' }, 'fccid.io lists no documents for this FCC ID. Filings from before about 2000 are not online.')
      : visible.length === 0
        ? h('p', { class: 'status' }, 'None of the documents for this FCC ID are public yet.')
        : null;
  if (nothing) view.append(nothing);
  view.append(grid, more);

  let shown = -1;
  function layout(): void {
    if (!view.isConnected) {
      observer.disconnect();
      return;
    }
    const space = (moreShown: boolean) =>
      window.innerHeight - grid.offsetTop - (moreShown ? (more.hidden ? 52 : toggle.offsetHeight) + GAP : 0) - 16;
    let rows = gridRows(space(confidential.length > 0), visible.length);
    if (confidential.length === 0 && rows * 2 < visible.length) rows = gridRows(space(true), visible.length);
    const fit = Math.min(visible.length, rows * 2);
    const rowHeight = rows ? Math.max(120, Math.min(MAX_ROW, (space(fit < visible.length || confidential.length > 0) - GAP * (rows - 1)) / rows)) : 0;
    grid.style.gridTemplateRows = rows ? `repeat(${rows}, ${rowHeight}px)` : '';
    grid.hidden = rows === 0;
    if (fit === shown) return;
    shown = fit;

    grid.replaceChildren(...visible.slice(0, fit).map(tile));
    grid.classList.toggle('odd', fit % 2 === 1);
    const rest = visible.slice(fit);
    const items: Node[] = rest.map((g) => {
      const r = row(g);
      r.addEventListener('click', () => open(g));
      return r;
    });
    if (confidential.length > 0) {
      items.push(h('p', { class: 'section-label' }, 'Confidential'));
      for (const g of confidential) {
        const r = row(g);
        r.addEventListener('click', () => open(g));
        items.push(r);
      }
    }
    if (notFiled.length > 0) items.push(h('p', { class: 'meta' }, `Not filed: ${notFiled.join(', ')}`));
    list.replaceChildren(...items);
    const inList = [...rest, ...confidential];
    count.textContent = String(inList.length);
    dots.replaceChildren(...inList.map((g) => h('i', { style: `background: ${g.color}` })));
    more.hidden = inList.length === 0;
    // Nothing public to put in the grid: open the list straight away.
    if (visible.length === 0 && !more.hidden) {
      toggle.setAttribute('aria-expanded', 'true');
      list.hidden = false;
    }
  }
  const observer = new ResizeObserver(layout);
  observer.observe(view);
  window.addEventListener('resize', layout);
  layout();
}

function sheetHeader(g: DocGroup, close: HTMLElement, ...extra: (Node | string)[]): HTMLElement {
  return h('div', { class: 'title-row sheet-head' },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h('div', { class: 'head-text' }, h('h2', {}, g.name), ...extra),
    close);
}

function closeOnBackdrop(dialog: HTMLDialogElement): void {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// Near-full-screen viewer for one document type: chips to switch between its documents,
// the PDF pages, "Save PDF" and "Open on fccid.io".
function createViewer(device: Device, host: HTMLElement): { open: (g: DocGroup) => void } {
  const dialog = h('dialog', { class: 'sheet viewer', 'aria-labelledby': 'viewer-title' }) as HTMLDialogElement;
  closeOnBackdrop(dialog);
  dialog.addEventListener('close', () => dialog.replaceChildren());
  host.append(dialog);

  function open(g: DocGroup): void {
    const close = h('button', { type: 'button', class: 'icon', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => dialog.close());
    const head = sheetHeader(g, close, h('span', { class: 'id' }, device.fccId));
    head.querySelector('h2')!.id = 'viewer-title';
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Documents' });
    const pagesBox = h('div', { class: 'viewer-body' });
    const indicator = h('span', { class: 'page-indicator', hidden: '' });
    const openLink = h('a', { class: 'button', target: '_blank', rel: 'noopener' }, 'Open on fccid.io') as HTMLAnchorElement;
    const save = h('button', { type: 'button', class: 'primary' }, 'Save PDF') as HTMLButtonElement;
    const meta = h('p', { class: 'meta' });
    let current: Exhibit | null = null;

    function select(e: Exhibit): void {
      current = e;
      for (const c of chips.children) c.setAttribute('aria-pressed', String(c === chipFor.get(e)));
      openLink.href = e.pageUrl ?? `https://fccid.io/${encodeURIComponent(device.fccId)}`;
      save.disabled = e.status !== 'available';
      meta.textContent = [e.title, e.status === 'available' ? 'PDF' : null, e.size].filter(Boolean).join(' · ');
      indicator.hidden = true;
      const pages = h('div', { class: 'pages' });
      pagesBox.replaceChildren(pages, indicator);
      if (e.status !== 'available' || !e.pdfUrl) {
        pages.append(h('p', { class: 'status' }, e.status === 'pending' ? `Confidential until ${formatDate(e.availableDate!)}.` : 'This document is not public.'));
        return;
      }
      pages.append(h('p', { class: 'status' }, 'Loading…'));
      let total = 0;
      const seen = new IntersectionObserver((entries) => {
        for (const en of entries) if (en.isIntersecting) indicator.textContent = `Page ${(en.target as HTMLImageElement).dataset.page} of ${total}`;
      }, { root: pagesBox, threshold: 0.5 });
      new MutationObserver((records, mo) => {
        if (!pages.isConnected) return mo.disconnect();
        for (const r of records) for (const n of r.addedNodes) {
          const img = (n as Element).querySelector?.('img');
          if (img) { img.dataset.page = img.alt.replace(/\D/g, ''); seen.observe(img); }
        }
      }).observe(pages, { childList: true });
      renderPdf(e.pdfUrl, pages, (n) => {
        total = n;
        indicator.textContent = `Page 1 of ${n}`;
        indicator.hidden = false;
      })
        .then(() => pages.querySelector('.status')?.remove())
        .catch(() => {
          if (current === e) pages.replaceChildren(h('p', { class: 'error' }, "Couldn't show this PDF here. Use “Open on fccid.io” instead."));
        });
    }

    const chipFor = new Map<Exhibit, HTMLElement>();
    for (const e of g.exhibits) {
      const c = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, e.title || g.name);
      c.addEventListener('click', () => select(e));
      chipFor.set(e, c);
      chips.append(c);
    }
    chips.hidden = g.exhibits.length < 2;
    save.addEventListener('click', () => current && void savePdf(current, device.fccId, save));

    dialog.style.setProperty('--doc', g.color);
    dialog.replaceChildren(
      h('div', { class: 'grabber', 'aria-hidden': 'true' }),
      head,
      chips,
      pagesBox,
      h('div', { class: 'viewer-foot' }, h('div', { class: 'row' }, openLink, save), meta),
    );
    dialog.showModal();
    // Rendering measures the page box, so start once the dialog is laid out.
    select(g.exhibits.find((e) => e.status === 'available') ?? g.exhibits[0]);
  }
  return { open };
}

// Lazy so the results page doesn't load pdf.js until a document is opened.
async function renderPdf(url: string, container: HTMLElement, onPageCount: (n: number) => void): Promise<void> {
  const m = await import('../pdfView');
  return m.renderPdf(url, container, onPageCount);
}

async function savePdf(e: Exhibit, fccId: string, button: HTMLButtonElement): Promise<void> {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const res = await fetch(e.pdfUrl!);
    if (!res.ok) throw new Error(String(res.status));
    const blob = new Blob([await res.blob()], { type: 'application/pdf' });
    const name = `${fccId} ${e.title}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    // Couldn't fetch it here: let the browser open the PDF so it can be saved from there.
    window.open(e.pdfUrl, '_blank', 'noopener');
  } finally {
    button.textContent = label;
    button.disabled = false;
  }
}

// Bottom sheet for a type with nothing to open: why, and until when.
function createInfoSheet(device: Device, host: HTMLElement): { open: (g: DocGroup) => void } {
  const dialog = h('dialog', { class: 'sheet info', 'aria-labelledby': 'info-title' }) as HTMLDialogElement;
  closeOnBackdrop(dialog);
  host.append(dialog);
  const filing = `https://fccid.io/${encodeURIComponent(device.fccId)}`;

  function open(g: DocGroup): void {
    const close = h('button', { class: 'icon', value: 'close', 'aria-label': 'Close' }, '×');
    const head = sheetHeader(g, close, h('span', { class: 'sub' }, statusText(g)));
    head.querySelector('h2')!.id = 'info-title';
    const name = g.name.toLowerCase();
    const body: HTMLElement[] = [];
    if (g.state === 'pending') {
      body.push(h('p', {}, `The maker asked the FCC to hold the ${name} back for a while, usually until the product launches. It becomes public on ${formatDate(g.availableDate!)}.`));
      body.push(h('p', {}, 'Check back after that date, or ', h('a', { href: filing, target: '_blank', rel: 'noopener' }, 'open the filing on fccid.io'), '.'));
    } else if (g.overdueSince) {
      body.push(h('p', {}, `This was due to become public on ${formatDate(g.overdueSince)}, but fccid.io hasn't published it.`));
      body.push(h('p', {}, h('a', { href: filing, target: '_blank', rel: 'noopener' }, 'Open the filing on fccid.io'), ' to check, or search the FCC directly.'));
    } else if (LONG_TERM.has(g.name)) {
      body.push(h('p', {}, `The maker asked the FCC to keep the ${name} confidential. The FCC allows this permanently for schematics, block diagrams, operational descriptions and parts lists, so this document will not be released.`));
      body.push(h('p', { class: 'meta' }, 'Most devices keep these private: about 9 in 10 in a sample of 1,069 filings.'));
    } else {
      body.push(h('p', {}, 'fccid.io lists this document but has no public copy of it.'));
      body.push(h('p', {}, h('a', { href: filing, target: '_blank', rel: 'noopener' }, 'Open the filing on fccid.io'), ' to check.'));
    }
    dialog.style.setProperty('--doc', g.color);
    dialog.replaceChildren(
      h('form', { method: 'dialog' },
        h('div', { class: 'grabber', 'aria-hidden': 'true' }),
        head,
        ...body,
        h('button', { class: 'primary wide', value: 'ok' }, 'Got it')),
    );
    dialog.showModal();
  }
  return { open };
}
