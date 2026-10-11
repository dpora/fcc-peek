import { describe, expect, it } from 'vitest';
import { findCandidates, isPlausible, normalize } from '../src/fccId';

const ids = (text: string) => findCandidates(text).map((c) => c.id);

describe('normalize', () => {
  it('uppercases, strips spaces and trailing punctuation, unifies dashes', () => {
    expect(normalize(' bcg-e3175a ')).toBe('BCG-E3175A');
    expect(normalize('BCG—E3175A')).toBe('BCG-E3175A');
    expect(normalize('BCG_E3175A.')).toBe('BCG-E3175A');
    expect(normalize('2AEV4 01')).toBe('2AEV401');
  });
});

describe('isPlausible', () => {
  it('accepts real ids', () => {
    expect(isPlausible('BCG-E3175A')).toBe(true);
    expect(isPlausible('2AEV4-01')).toBe(true);
    expect(isPlausible('QOQBGM13P')).toBe(true);
    expect(isPlausible('abc1')).toBe(true);
  });
  it('rejects too short, too long, or malformed ids', () => {
    expect(isPlausible('BCG')).toBe(false);
    expect(isPlausible('A'.repeat(20))).toBe(false);
    expect(isPlausible('BCG-')).toBe(false);
    expect(isPlausible('-BCG1')).toBe(false);
    expect(isPlausible('BCG/E31')).toBe(false);
    expect(isPlausible('')).toBe(false);
  });
});

describe('findCandidates', () => {
  it('finds a plain label', () => {
    expect(findCandidates('FCC ID: BCG-E3175A')).toEqual([
      { id: 'BCG-E3175A', source: 'label', raw: 'FCC ID: BCG-E3175A' },
    ]);
  });

  it('handles case, spacing and separators', () => {
    expect(ids('fcc id : 2aev4-01')).toEqual(['2AEV4-01']);
    expect(ids('FCCID:2AEV4-01')).toEqual(['2AEV4-01']);
    expect(ids('FCC-ID 2AEV4-01')).toEqual(['2AEV4-01']);
  });

  it('tolerates OCR reading I as l, 1 or |', () => {
    expect(ids('FCC lD: 2AEV4-01')).toEqual(['2AEV4-01']);
    expect(ids('FCC 1D: 2AEV4-01')).toEqual(['2AEV4-01']);
    expect(ids('FCC |D: 2AEV4-01')).toEqual(['2AEV4-01']);
  });

  it('joins a grantee code split from the product code by a space', () => {
    expect(ids('FCC ID: 2AEV4 01')).toEqual(['2AEV401']);
    expect(ids('FCC ID: BCG E3175A')).toEqual(['BCGE3175A']);
  });

  it('does not swallow other label fields', () => {
    expect(ids('Model A1901\nFCC ID:BCG-E3175A IC: 579C-E3175A')).toEqual(['BCG-E3175A']);
    expect(ids('FCC ID: BCG IC: 579C-E3175A')).toEqual([]);
    expect(ids('FCC ID: BCG MODEL: X1')).toEqual([]);
  });

  it('finds an id on the line after the label', () => {
    expect(ids('FCC ID:\nBCG-E3175A\nMade in China')).toEqual(['BCG-E3175A']);
  });

  it('strips trailing punctuation and unifies dashes', () => {
    expect(ids('FCC ID: BCG-E3175A.')).toEqual(['BCG-E3175A']);
    expect(ids('FCC ID: BCG—E3175A')).toEqual(['BCG-E3175A']);
  });

  it('marks module ids', () => {
    expect(findCandidates('Contains FCC ID: QOQBGM13P')).toEqual([
      { id: 'QOQBGM13P', source: 'module', raw: 'Contains FCC ID: QOQBGM13P' },
    ]);
  });

  it('returns host and module ids in order, de-duplicated', () => {
    const text = 'FCC ID: 2AEV4-01\nContains FCC ID: QOQBGM13P\nFCC ID: 2AEV4-01';
    expect(findCandidates(text).map((c) => [c.id, c.source])).toEqual([
      ['2AEV4-01', 'label'],
      ['QOQBGM13P', 'module'],
    ]);
  });

  it('returns nothing without an FCC ID label', () => {
    expect(ids('This device complies with part 15 of the FCC Rules.')).toEqual([]);
    expect(ids('')).toEqual([]);
  });
});
