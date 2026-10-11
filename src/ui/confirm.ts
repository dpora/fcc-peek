import { h } from '../dom';
import { scanState } from '../store';
import { idForm } from './idForm';

export function renderConfirm(view: HTMLElement): void {
  if (!scanState.text) {
    location.hash = '#/';
    return;
  }
  view.append(h('a', { href: '#/' }, '← Scan again'), h('h1', {}, 'Confirm FCC ID'));

  if (scanState.candidates.length === 0) {
    view.append(h('p', { class: 'status' }, 'No FCC ID found on the label. Type it in:'), idForm(''));
  } else {
    view.append(h('p', { class: 'status' }, 'Check the ID, edit if needed, then look it up.'));
    for (const c of scanState.candidates) {
      view.append(
        h('div', { class: 'row' }, c.source === 'module' ? h('span', { class: 'tag' }, 'Module inside device') : null),
        idForm(c.id),
      );
    }
  }

  view.append(h('details', {}, h('summary', {}, 'OCR text'), h('pre', {}, scanState.text)));
}
