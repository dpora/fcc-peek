import './style.css';
import { h } from './dom';
import { parseRoute } from './route';
import { renderConfirm } from './ui/confirm';
import { renderScan } from './ui/scan';

type Cleanup = (() => void) | void;

const app = document.querySelector<HTMLElement>('#app')!;
let cleanup: Cleanup;

function render(): void {
  if (cleanup) cleanup();
  cleanup = undefined;
  const view = h('main');
  app.replaceChildren(view);
  const route = parseRoute(location.hash);
  if (route.name === 'confirm') cleanup = renderConfirm(view);
  else if (route.name === 'results') view.append(h('h1', {}, route.fccId));
  else cleanup = renderScan(view);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
