import { FccIdioError } from '../fccidio';

export interface ErrorDescription {
  message: string;
  retry: boolean;
  links: { href: string; label: string }[];
}

// A Cloudflare challenge from fccid.io reaches the browser as a CORS failure, which
// looks identical to being offline, so only blame the connection when the browser
// says it is offline, and always offer the fccid.io page itself as a way forward.
export function describeError(err: unknown, fccId: string, online: boolean): ErrorDescription {
  const id = encodeURIComponent(fccId);
  const fccidio = { href: `https://fccid.io/${id}`, label: 'Open on fccid.io' };
  if (err instanceof FccIdioError) {
    switch (err.kind) {
      case 'not-found':
        return {
          message: 'Not found on fccid.io.',
          retry: false,
          links: [{ href: `https://fcc.io/${id}`, label: 'Search the FCC directly' }],
        };
      case 'network':
        return {
          message: online
            ? "Couldn't load from fccid.io. It may be down or may have blocked the request."
            : "You're offline. Reconnect and retry.",
          retry: true,
          links: [fccidio],
        };
      case 'http':
        return { message: err.message, retry: true, links: [fccidio] };
      case 'layout':
        return { message: err.message, retry: false, links: [fccidio] };
    }
  }
  return { message: err instanceof Error ? err.message : String(err), retry: true, links: [fccidio] };
}
