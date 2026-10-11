import { describe, expect, it } from 'vitest';
import { parseRoute, resultsHash } from '../src/route';

describe('parseRoute', () => {
  it('defaults to scan', () => {
    expect(parseRoute('')).toEqual({ name: 'scan' });
    expect(parseRoute('#/')).toEqual({ name: 'scan' });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'scan' });
  });

  it('parses confirm', () => {
    expect(parseRoute('#/confirm')).toEqual({ name: 'confirm' });
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
