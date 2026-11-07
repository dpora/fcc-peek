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

// Fetch the OCR model (~25 MB) in the background once the page has loaded, so it is ready by the
// first scan. Skipped when the user has asked the browser to save data; the first scan loads it then.
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
if (!saveData) {
  const preload = () => void import('./ocr').then((m) => m.preloadOcr());
  if (document.readyState === 'complete') preload();
  else window.addEventListener('load', preload, { once: true });
}
