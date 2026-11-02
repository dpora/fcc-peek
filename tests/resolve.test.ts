import { describe, expect, it } from 'vitest';
import type { Device, Lookup } from '../src/fccidio';
import { distance, pickSuggestion, resolveId, resolveScan } from '../src/resolve';

const device = (fccId: string): Device => ({ fccId, exhibits: [] });

// A fake fccid.io: unknown IDs are a bare 404. Records every ID looked up.
function fake(pages: Record<string, Lookup>) {
  const seen: string[] = [];
  const fn = async (id: string): Promise<Lookup> => {
    seen.push(id);
    return pages[id] ?? { kind: 'notfound' };
  };
  return { fn, seen };
}

describe('distance', () => {
  it('charges a quarter for look-alike swaps and ignores hyphens and case', () => {
    expect(distance('2AJGM-UVSR', '2AJGMUV-5R')).toBe(0.25);
    expect(distance('e5xkbm1o51o', 'E5XKBM10510')).toBe(0.5);
  });

  it('charges 1 for any other edit', () => {
    expect(distance('A3LGT9100', 'A3LGTI9100')).toBe(1);
    expect(distance('PDD-AR5B93', 'PPD-AR5B93')).toBe(1);
  });
});

describe('pickSuggestion', () => {
  it('picks the unique closest suggestion within 1.25', () => {
    expect(pickSuggestion('A3LGT9100', ['K7GT9100', 'A3LGTI9100'])).toBe('A3LGTI9100');
  });

  it('refuses a tie for closest', () => {
    expect(pickSuggestion('PDD-AR5B93', ['HLZ-AR5B93', 'PDN-AR5B93', 'PPD-AR5B93'])).toBeNull();
  });

  it('refuses anything further than 1.25', () => {
    expect(pickSuggestion('DKD529', ['DKD529MPU-IPC'])).toBeNull();
  });
});

describe('resolveId', () => {
  it('returns an exact match as found, uncorrected', async () => {
    const { fn } = fake({ 'BCG-E3175A': { kind: 'device', device: device('BCG-E3175A'), redirected: false } });
    expect(await resolveId('BCG-E3175A', fn)).toEqual({
      kind: 'found', device: device('BCG-E3175A'), read: 'BCG-E3175A', corrected: false, others: [], alternatives: [],
    });
  });

  it('accepts a redirect to a look-alike ID as a correction', async () => {
    const { fn } = fake({ ESXKBM10510: { kind: 'device', device: device('E5XKBM10510'), redirected: true } });
    expect(await resolveId('ESXKBM10510', fn)).toMatchObject({
      kind: 'found', corrected: true, read: 'ESXKBM10510', alternatives: [{ id: 'E5XKBM10510', match: 'fccid.io redirect' }],
    });
  });

  it('turns a redirect to an unrelated ID into a suggestion', async () => {
    const d = { ...device('EA46GJLABEL'), applicant: 'Acme', product: 'Speaker' };
    const { fn } = fake({ LABEL: { kind: 'device', device: d, redirected: true } });
    expect(await resolveId('LABEL', fn)).toEqual({
      kind: 'notfound',
      read: 'LABEL',
      suggestions: [{ id: 'EA46GJLABEL', match: 'fccid.io redirect', applicant: 'Acme', description: 'Speaker' }],
    });
  });

  it('follows a close 300 suggestion and marks it corrected', async () => {
    const { fn, seen } = fake({
      '2AJGM-UVSR': { kind: 'similar', suggestions: [{ id: '2AJGMUV-5R', match: 'Similar FCC ID' }, { id: '2AJGM-UV6R', match: 'Similar FCC ID' }] },
      '2AJGMUV-5R': { kind: 'device', device: device('2AJGMUV-5R'), redirected: false },
    });
    const r = await resolveId('2AJGM-UVSR', fn);
    expect(r).toMatchObject({ kind: 'found', corrected: true, read: '2AJGM-UVSR' });
    // Kept for "Not this device?"
    expect(r.kind === 'found' && r.alternatives.map((s) => s.id)).toEqual(['2AJGMUV-5R', '2AJGM-UV6R']);
    expect(seen).toEqual(['2AJGM-UVSR', '2AJGMUV-5R']);
  });

  it('lists the 300 suggestions when none is a safe pick', async () => {
    const suggestions = ['HLZ-AR5B93', 'PDN-AR5B93', 'PPD-AR5B93'].map((id) => ({ id, match: 'Product-code suffix' }));
    const { fn } = fake({ 'PDD-AR5B93': { kind: 'similar', suggestions } });
    expect(await resolveId('PDD-AR5B93', fn)).toEqual({ kind: 'notfound', read: 'PDD-AR5B93', suggestions });
  });

  it('falls back to the suggestion list when the picked suggestion does not load', async () => {
    const suggestions = [{ id: '2AJGMUV-5R', match: 'Similar FCC ID' }];
    const { fn } = fake({ '2AJGM-UVSR': { kind: 'similar', suggestions } });
    expect(await resolveId('2AJGM-UVSR', fn)).toEqual({ kind: 'notfound', read: '2AJGM-UVSR', suggestions });
  });

  it('passes the grantee hint through on a 404', async () => {
    const grantee = { code: 'I88', name: 'ZyXEL Communications Corporation' };
    const { fn } = fake({ I88RLG607N: { kind: 'notfound', grantee } });
    expect(await resolveId('I88RLG607N', fn)).toEqual({ kind: 'notfound', read: 'I88RLG607N', suggestions: [], grantee });
  });
});

describe('resolveScan', () => {
  it('opens the first ID that resolves and lists the other IDs on the label', async () => {
    const { fn, seen } = fake({ XMR201903EG25G: { kind: 'device', device: device('XMR201903EG25G'), redirected: false } });
    const result = await resolveScan(['2BLPP-KDV9', 'XMR201903EG25G', 'ABC-123'], [], fn);
    expect(result).toMatchObject({ kind: 'found', read: 'XMR201903EG25G', others: ['2BLPP-KDV9', 'ABC-123'] });
    expect(seen).toEqual(['2BLPP-KDV9', 'XMR201903EG25G']);
  });

  it('tries unlabelled IDs only when no labelled one resolves, exact matches only', async () => {
    const { fn, seen } = fake({
      PKRNVWEM120: { kind: 'device', device: device('PKRNVWEM120'), redirected: false },
      LABELX1: { kind: 'device', device: device('EA46GJLABEL'), redirected: true },
    });
    const result = await resolveScan(['ZATA6'], ['LABELX1', 'PKRNVWEM120'], fn);
    expect(result).toMatchObject({ kind: 'found', read: 'PKRNVWEM120', corrected: false, others: ['ZATA6'] });
    expect(seen).toEqual(['ZATA6', 'LABELX1', 'PKRNVWEM120']);
  });

  it('skips unlabelled IDs that were already tried as labelled ones', async () => {
    const { fn, seen } = fake({});
    await resolveScan(['ZATA6'], ['ZATA6'], fn);
    expect(seen).toEqual(['ZATA6']);
  });

  it('reports the first labelled ID as not found when nothing resolves', async () => {
    const grantee = { code: 'I88', name: 'ZyXEL' };
    const { fn } = fake({ I88RLG607N: { kind: 'notfound', grantee } });
    expect(await resolveScan(['I88RLG607N', 'QQQ12345'], [], fn)).toEqual({
      kind: 'notfound', read: 'I88RLG607N', suggestions: [], grantee,
    });
  });

  it('reports an empty read when the label had no ID at all', async () => {
    const { fn, seen } = fake({});
    expect(await resolveScan([], [], fn)).toEqual({ kind: 'notfound', read: '', suggestions: [] });
    expect(seen).toEqual([]);
  });
});
