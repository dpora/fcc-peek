import { h } from '../dom';
import { isPlausible, normalize } from '../fccId';
import { resultsHash } from '../route';

export function idForm(initial: string, buttonLabel = 'Look up'): HTMLFormElement {
  const input = h('input', {
    value: initial,
    placeholder: 'e.g. BCG-E3175A',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'FCC ID',
  }) as HTMLInputElement;
  const error = h('p', { class: 'error', hidden: '' });
  const form = h(
    'form',
    { class: 'id-form' },
    input,
    h('button', { type: 'submit', class: 'primary' }, buttonLabel),
    error,
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = normalize(input.value);
    if (!isPlausible(id)) {
      error.textContent = `"${input.value.trim()}" doesn't look like an FCC ID.`;
      error.hidden = false;
      return;
    }
    location.hash = resultsHash(id);
  });
  return form;
}
