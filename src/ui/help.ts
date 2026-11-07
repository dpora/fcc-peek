import { h } from '../dom';

// The "?" button in the Scan header and the "What is FCC Peek?" sheet it opens.
export function helpButton(): HTMLElement[] {
  const button = h('button', { type: 'button', class: 'icon', 'aria-label': 'About FCC Peek', 'aria-haspopup': 'dialog' }, '?');
  const close = h('button', { class: 'icon', value: 'close', 'aria-label': 'Close' }, '×');
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': 'help-title' },
    h('form', { method: 'dialog' },
      h('div', { class: 'grabber', 'aria-hidden': 'true' }),
      h('div', { class: 'title-row' }, h('h2', { id: 'help-title' }, 'What is FCC Peek?'), close),
      h('p', {}, 'Scan the label on any wireless gadget and FCC Peek looks up its FCC ID, so you can see what the maker filed with the FCC, including photos of the inside.'),
      h('h3', {}, 'What’s an FCC ID?'),
      h('p', {}, 'Anything sold in the US that sends radio signals (phones, routers, earbuds, smart-home gear) has to be approved by the Federal Communications Commission. The FCC ID is its approval code, printed on the label or under Settings → About.'),
      h('div', { class: 'note example' },
        h('span', { class: 'id' }, h('b', { class: 'grantee' }, 'BCG'), h('b', {}, '-E3175A')),
        h('span', { class: 'meta' }, 'The first 3 or 5 characters name the company; the rest is the product.')),
      h('h3', {}, 'What you can see with it'),
      h('ul', {},
        h('li', {}, 'Who made it and what the product is'),
        h('li', {}, 'When the FCC approved it'),
        h('li', {}, 'Internal photos: the device opened up, no screwdriver needed'),
        h('li', {}, 'External photos, label location and user manuals, when public')),
      h('p', { class: 'meta' }, 'Data comes from public FCC filings, looked up on fccid.io.'),
      h('button', { class: 'primary wide', value: 'ok' }, 'Got it')),
  ) as HTMLDialogElement;

  button.addEventListener('click', () => dialog.showModal());
  // A click on the dialog element itself (not its form) is a click on the dimmed backdrop.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return [button, dialog];
}
