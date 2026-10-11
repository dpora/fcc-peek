import { describe, expect, it } from 'vitest';
import { FccIdioError } from '../src/fccidio';
import { describeError } from '../src/ui/errors';

const fccidioLink = { href: 'https://fccid.io/BCG-E3175A', label: 'Open on fccid.io' };

describe('describeError', () => {
  it('does not blame the connection when online: fccid.io may have blocked the request', () => {
    const d = describeError(new FccIdioError('network', 'x'), 'BCG-E3175A', true);
    expect(d.message).toMatch(/blocked/);
    expect(d.message).not.toMatch(/check your connection/i);
    expect(d.retry).toBe(true);
    expect(d.links).toEqual([fccidioLink]);
  });

  it('says offline when the browser reports offline', () => {
    const d = describeError(new FccIdioError('network', 'x'), 'BCG-E3175A', false);
    expect(d.message).toMatch(/offline/i);
    expect(d.retry).toBe(true);
  });

  it('offers retry and the fccid.io link for HTTP errors', () => {
    const d = describeError(new FccIdioError('http', 'fccid.io returned HTTP 503.'), 'BCG-E3175A', true);
    expect(d.message).toBe('fccid.io returned HTTP 503.');
    expect(d.retry).toBe(true);
    expect(d.links).toEqual([fccidioLink]);
  });

  it('gives a way forward for layout errors', () => {
    const d = describeError(new FccIdioError('layout', 'layout changed'), 'BCG-E3175A', true);
    expect(d.retry).toBe(false);
    expect(d.links).toEqual([fccidioLink]);
  });

  it('links to the FCC search when fccid.io has no page', () => {
    const d = describeError(new FccIdioError('not-found', 'x'), 'BCG-E3175A', true);
    expect(d.message).toBe('Not found on fccid.io.');
    expect(d.retry).toBe(false);
    expect(d.links).toEqual([{ href: 'https://fcc.io/BCG-E3175A', label: 'Search the FCC directly' }]);
  });

  it('treats unknown errors as retryable', () => {
    const d = describeError(new Error('boom'), 'BCG-E3175A', true);
    expect(d.message).toBe('boom');
    expect(d.retry).toBe(true);
    expect(d.links).toEqual([fccidioLink]);
  });
});
