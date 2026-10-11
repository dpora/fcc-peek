import './style.css';
import { h } from './dom';
import { parseRoute } from './route';

type Cleanup = (() => void) | void;

const app = document.querySelector<HTMLElement>('#app')!;
let cleanup: Cleanup;

function render(): void {
  if (cleanup) cleanup();
  cleanup = undefined;
  const view = h('main');
  app.replaceChildren(view);
  const route = parseRoute(location.hash);
  if (route.name === 'confirm') view.append(h('h1', {}, 'Confirm'));
  else if (route.name === 'results') view.append(h('h1', {}, route.fccId));
  else view.append(h('h1', {}, 'FCC Peek'));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
