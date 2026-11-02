import { describe, expect, it } from 'vitest';
import { parseRoute, resultsHash } from '../src/route';

describe('parseRoute', () => {
  it('defaults to scan', () => {
    expect(parseRoute('')).toEqual({ name: 'scan' });
    expect(parseRoute('#/')).toEqual({ name: 'scan' });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'scan' });
  });

  it('parses not-found', () => {
    expect(parseRoute('#/not-found')).toEqual({ name: 'notfound' });
  });

  it('no longer has a confirm screen', () => {
    expect(parseRoute('#/confirm')).toEqual({ name: 'scan' });
  });

  it('parses results and normalizes the id', () => {
    expect(parseRoute('#/id/BCG-E3175A')).toEqual({ name: 'results', fccId: 'BCG-E3175A' });
    expect(parseRoute('#/id/bcg-e3175a')).toEqual({ name: 'results', fccId: 'BCG-E3175A' });
    expect(parseRoute('#/id/2AEV4%2001')).toEqual({ name: 'results', fccId: '2AEV401' });
  });

  it('falls back to scan on a malformed escape', () => {
    expect(parseRoute('#/id/%E0%A4%A')).toEqual({ name: 'scan' });
  });

  it('round-trips through resultsHash', () => {
    expect(parseRoute(resultsHash('BCG-E3175A'))).toEqual({ name: 'results', fccId: 'BCG-E3175A' });
  });
});
