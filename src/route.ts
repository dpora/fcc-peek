import { normalize } from './fccId';

export type Route = { name: 'scan' } | { name: 'notfound' } | { name: 'results'; fccId: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/not-found') return { name: 'notfound' };
  const m = /^\/id\/(.+)$/.exec(path);
  if (m) {
    try {
      return { name: 'results', fccId: normalize(decodeURIComponent(m[1])) };
    } catch {
      return { name: 'scan' };
    }
  }
  return { name: 'scan' };
}

export function resultsHash(fccId: string): string {
  return `#/id/${encodeURIComponent(fccId)}`;
}
