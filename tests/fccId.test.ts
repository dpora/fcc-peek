import { describe, expect, it } from 'vitest';
import { findBareCandidates, findCandidates, fixGrantee, isPlausible, normalize } from '../src/fccId';

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

describe('fixGrantee', () => {
  it('reads 0 as O and 1 as I inside a 3-character grantee code', () => {
    expect(fixGrantee('N0I9900-11215-000')).toBe('NOI9900-11215-000');
    expect(fixGrantee('Q1SEM770')).toBe('QISEM770');
  });
  it('reads a leading 1 or 0 as a letter, making a 3-character code', () => {
    expect(fixGrantee('188RLG607N')).toBe('I88RLG607N');
    expect(fixGrantee('08FMADECA')).toBe('O8FMADECA');
  });
  it('reads 0 as O and 1 as I inside a 5-character grantee code', () => {
    expect(fixGrantee('2A1GM-UV5R')).toBe('2AIGM-UV5R');
    expect(fixGrantee('20EV4-01')).toBe('2OEV4-01');
  });
  it('leaves the product code alone', () => {
    expect(fixGrantee('C3K1008')).toBe('C3K1008');
    expect(fixGrantee('2AEV4-01')).toBe('2AEV4-01');
    expect(fixGrantee('PD911230BNHU')).toBe('PD911230BNHU');
  });
  it('leaves a leading digit other than 0, 1 or 2 alone', () => {
    expect(fixGrantee('8CG-E3175A')).toBe('8CG-E3175A');
  });
});

describe('findCandidates', () => {
  it('skips heading words after "FCC ID"', () => {
    expect(ids('FCC ID Label\nFCC ID: BCG-E3175A')).toEqual(['BCG-E3175A']);
    expect(ids('FCC ID Label and Location')).toEqual([]);
    expect(ids('FCCID LABELANDLOCATION')).toEqual([]);
    expect(ids('FCC ID Labeling Statements')).toEqual([]);
    expect(ids('FCC ID Location')).toEqual([]);
  });

  it('skips LABEL misread with the B dropped', () => {
    expect(ids('FCCIDLael')).toEqual([]);
    expect(ids('FCC ID Lael and Location')).toEqual([]);
  });

  it('does not read "FCC IDENTIFICATION" or "FCC IDENTIFIER" as a label', () => {
    expect(ids('FCC IDENTIFICATION NUMBER')).toEqual([]);
    expect(ids('FCC Identifier: BCG-E3175A')).toEqual([]);
  });

  it('skips "Number" or "No." between the label and the id', () => {
    expect(ids('FCC ID Number: BCG-E3175A')).toEqual(['BCG-E3175A']);
    expect(ids('FCCID.NO.BR98YV1764')).toEqual(['BR98YV1764']);
    expect(ids('FCC ID No: BR98YV1764')).toEqual(['BR98YV1764']);
  });

  it('keeps ids that start with NO or are all letters', () => {
    expect(ids('FCC ID: NOI9900-11215-000')).toEqual(['NOI9900-11215-000']);
    expect(ids('FCC ID: RYYEYSHCN')).toEqual(['RYYEYSHCN']);
  });

  it('allows repeated punctuation after the label', () => {
    expect(ids('FCC ID. : UJO-ZAMM-TM110')).toEqual(['UJO-ZAMM-TM110']);
    expect(ids('FCC 1D.: 062N737')).toEqual(['O62N737']);
  });

  it('cuts a field glued to the id', () => {
    expect(ids('FCCID:2A6JBMI01/IC:28450-MI01')).toEqual(['2A6JBMI01']);
    expect(ids('FCCID:APISB595MK2SUBIC:6132A-SB595MK2SUB')).toEqual(['APISB595MK2SUB']);
    expect(ids('FCCID:2AEM4-231770IC:20631-231770')).toEqual(['2AEM4-231770']);
  });

  it('reads "FCC Certification ID"', () => {
    expect(ids('FCC Certification ID : 2AYSR-MCLSWB01')).toEqual(['2AYSR-MCLSWB01']);
  });

  it('applies grantee-code fixes to candidates', () => {
    expect(ids('FCC ID: 188RLG607N')).toEqual(['I88RLG607N']);
  });

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

  it('tolerates OCR dropping one C of "FCC"', () => {
    expect(ids('ICID:5689A-MCTL1\nFC ID: JJ4-MCTL1')).toEqual(['JJ4-MCTL1']);
    expect(ids('FCID : JJ4-MCTL1')).toEqual(['JJ4-MCTL1']);
    expect(ids('CC ID:BCG-E3175A')).toEqual(['BCG-E3175A']);
  });

  it('does not read "CCID" or "FCID" inside a word as a label', () => {
    expect(ids('ACCIDENTAL DAMAGE')).toEqual([]);
    expect(ids('Accidental: ABCD1234')).toEqual([]);
    expect(ids('PFCID BCG-E3175A')).toEqual([]);
  });

  it('needs a digit in ids after "FC ID" or "CC ID"', () => {
    expect(ids('CC 1D del LOoCation\nFCC ID: 2AB9SM32')).toEqual(['2AB9SM32']);
    expect(ids('FC ID LABE')).toEqual([]);
    expect(ids('FCC ID: RYYEYSHCN')).toEqual(['RYYEYSHCN']);
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

describe('findBareCandidates', () => {
  it('finds ids printed without a label', () => {
    expect(findBareCandidates('IC ID: 2AZ9PCC1020')).toEqual(['2AZ9PCC1020']);
    expect(findBareCandidates('CFS8DL5819S/573F-5819S')).toEqual(['CFS8DL5819S']);
    expect(findBareCandidates('3229B-EM120\nPKRNVWEM120\nWireless Inc. MADE IN KOREA')).toEqual(['PKRNVWEM120']);
  });
  it('splits glued words and fields', () => {
    expect(findBareCandidates('PKRNVWMIFI5792LabelLocation')).toEqual(['PKRNVWMIFI5792']);
    expect(findBareCandidates('CID: :2BCGWXE75IC:31152-XE75')).toEqual(['2BCGWXE75']);
  });
  it('skips IC numbers, words without digits and invalid grantee codes', () => {
    expect(findBareCandidates('2977A-TC695 20631-231770 MADE IN CHINA 102BE1 O1X2345')).toEqual([]);
  });
});
