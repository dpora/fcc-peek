import './style.css';
import { h } from './dom';
import { parseRoute } from './route';
import { renderNoId, renderResults } from './ui/results';
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
  if (route.name === 'notfound') renderNoId(view);
  else if (route.name === 'results') renderResults(view, route.fccId);
  else cleanup = renderScan(view);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
