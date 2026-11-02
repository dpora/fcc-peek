// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FccIdioError, groupExhibits, lookup, parseDevicePage } from '../src/fccidio';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
const TODAY = '2026-10-11';

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof FccIdioError ? e.kind : 'other';
  }
  return undefined;
}

async function asyncKindOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return e instanceof FccIdioError ? e.kind : 'other';
  }
  return undefined;
}

describe('parseDevicePage: device with public internal photos', () => {
  const device = parseDevicePage(fixture('bcg-e3175a.html'), TODAY);

  it('reads the summary', () => {
    expect(device.fccId).toBe('BCG-E3175A');
    expect(device.applicant).toBe('Apple Inc.');
    expect(device.product).toBe('Smartphone');
    expect(device.grantDate).toBe('2017-10-04');
  });

  it('reads an available internal photos exhibit', () => {
    const ip = device.exhibits.find((e) => e.docId === '3547120');
    expect(ip).toEqual({
      type: 'Internal Photos',
      title: 'A1901_Internal_Photos_v1.1',
      status: 'available',
      availableDate: '2018-04-02',
      docId: '3547120',
      pageUrl: 'https://fccid.io/BCG-E3175A/Internal-Photos/A1901-Internal-Photos-v1-1-3547120',
      pdfUrl: 'https://fccid.io/pdf.php?id=3547120',
    });
  });

  it('marks withheld exhibits without a date as unavailable and cleans the title', () => {
    const tune = device.exhibits.find((e) => e.title === 'A1901_Tune_Up_Procedure_FCC_v1.0');
    expect(tune).toMatchObject({ status: 'unavailable', type: 'Parts List/Tune Up Info' });
    expect(tune?.docId).toBeUndefined();
    expect(tune?.availableDate).toBeUndefined();
  });

  it('marks withheld exhibits whose date has passed as unavailable, not pending', () => {
    const manual = device.exhibits.find((e) => e.title === 'User_Manual_All_Models_v1.0');
    expect(manual).toMatchObject({ status: 'unavailable', availableDate: '2018-04-02' });
  });
});

describe('parseDevicePage: internal photos still confidential', () => {
  it('reports pending with the availability date', () => {
    const device = parseDevicePage(fixture('apilivebeam4.html'), TODAY);
    const { internal } = groupExhibits(device);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal[0]).toMatchObject({ status: 'pending', availableDate: '2027-04-07' });
    expect(internal[0].pdfUrl).toBeUndefined();
  });

  it('reports unavailable once the date has passed but nothing is mirrored', () => {
    const device = parseDevicePage(fixture('apilivebeam4.html'), '2027-05-01');
    expect(groupExhibits(device).internal[0].status).toBe('unavailable');
  });
});

describe('parseDevicePage: errors', () => {
  it('treats the search page as not-found', () => {
    expect(kindOf(() => parseDevicePage(fixture('not-found.html'), TODAY))).toBe('not-found');
  });

  it('reports layout when a device page lacks the details table', () => {
    expect(kindOf(() => parseDevicePage('<h1>FCC ID X1234</h1>', TODAY))).toBe('layout');
  });
});

describe('groupExhibits', () => {
  it('splits internal photos from everything else', () => {
    const device = parseDevicePage(fixture('bcg-e3175a.html'), TODAY);
    const { internal, other } = groupExhibits(device);
    expect(internal.every((e) => e.type === 'Internal Photos')).toBe(true);
    expect(internal.length).toBeGreaterThan(0);
    expect(other.some((e) => e.type === 'External Photos')).toBe(true);
    expect(internal.length + other.length).toBe(device.exhibits.length);
  });
});

function respond(body: string, status: number, redirected = false): Response {
  const res = new Response(body, { status });
  Object.defineProperty(res, 'redirected', { value: redirected });
  return res;
}

describe('lookup', () => {
  it('fetches https://fccid.io/<id> and returns the device', async () => {
    const urls: string[] = [];
    const result = await lookup('BCG-E3175A', async (url) => {
      urls.push(url);
      return respond(fixture('bcg-e3175a.html'), 200);
    });
    expect(urls).toEqual(['https://fccid.io/BCG-E3175A']);
    expect(result.kind).toBe('device');
    if (result.kind === 'device') {
      expect(result.device.fccId).toBe('BCG-E3175A');
      expect(result.redirected).toBe(false);
    }
  });

  it('reports when fccid.io redirected to another ID', async () => {
    const result = await lookup('BCG-E3I75A', async () => respond(fixture('bcg-e3175a.html'), 200, true));
    expect(result).toMatchObject({ kind: 'device', redirected: true });
  });

  it('reads the Possible Matches table from a 300', async () => {
    const result = await lookup('2AJGM-UVSR', async () => respond(fixture('similar-2ajgm-uvsr.html'), 300));
    expect(result.kind).toBe('similar');
    if (result.kind === 'similar') {
      expect(result.suggestions.map((s) => s.id)).toEqual(['2AJGMUV-5R', expect.any(String)]);
      expect(result.suggestions[0]).toEqual({
        id: '2AJGMUV-5R',
        match: 'Similar FCC ID',
        applicant: 'PO FUNG ELECTRONIC(HK) INTERNATIOANL GROUP COMPANY',
        description: 'Walkie Talkie',
        date: '2020-11-03',
      });
    }
  });

  it('treats a 300 search-results page as not found, without suggestions', async () => {
    const result = await lookup('188', async () => respond(fixture('search-188.html'), 300));
    expect(result).toEqual({ kind: 'notfound' });
  });

  it('reads the grantee panel from a 404', async () => {
    const result = await lookup('I88RLG607N', async () => respond(fixture('notfound-grantee-i88rlg607n.html'), 404));
    expect(result).toEqual({
      kind: 'notfound',
      grantee: { code: 'I88', name: 'ZyXEL Communications Corporation' },
    });
  });

  it('returns a bare not found when the grantee is unknown', async () => {
    const result = await lookup('188RLG607N', async () => respond(fixture('notfound-no-grantee.html'), 404));
    expect(result).toEqual({ kind: 'notfound' });
  });

  it('treats a 200 that is not a device page (a grantee list) as not found', async () => {
    const result = await lookup('I88', async () => respond('<html><h1>ZyXEL FCC ID Applications</h1></html>', 200));
    expect(result).toEqual({ kind: 'notfound' });
  });

  it('maps other HTTP errors to http', async () => {
    const p = lookup('BCG-E3175A', async () => respond('oops', 503));
    expect(await asyncKindOf(p)).toBe('http');
  });

  it('maps a thrown fetch to network', async () => {
    const p = lookup('BCG-E3175A', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await asyncKindOf(p)).toBe('network');
  });
});
